import { spawn } from "node:child_process";
import type { ApiRequest, ApiResponse, Context } from "iii-sdk";
import { state } from "../state.js";

type CreateSessionBody = {
  model?: string;
};

type Session = {
  id: string;
  model: string;
  createdAt: string;
  lastUsed: string;
  messageCount: number;
};

const CLAUDE_PATH =
  process.platform === "darwin"
    ? `${process.env.HOME}/.local/bin/claude`
    : "claude";

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (val && !key.startsWith("CLAUDE") && !key.startsWith("III_")) {
      env[key] = val;
    }
  }
  return env;
}

export const handleCreateSession = async (
  req: ApiRequest<CreateSessionBody>,
  ctx: Context,
): Promise<ApiResponse> => {
  const model = req.body?.model ?? "sonnet";

  ctx.logger.info(`Creating session with model ${model}`);

  try {
    const result = await runClaudeInit("Say: ready", model);

    const session: Session = {
      id: result.sessionId,
      model,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      messageCount: 0,
    };

    await state.set({
      scope: "sessions",
      key: result.sessionId,
      data: session,
    });

    ctx.logger.info(`Session ${result.sessionId} created successfully`);

    return {
      status_code: 201,
      headers: { "content-type": "application/json" },
      body: {
        sessionId: result.sessionId,
        model,
        status: "ready",
        initResponse: result.text || "Session created",
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`Failed to create session: ${message}`);

    return {
      status_code: 500,
      headers: { "content-type": "application/json" },
      body: { error: "Failed to create session", detail: message },
    };
  }
};

function runClaudeInit(
  prompt: string,
  model: string,
): Promise<{ sessionId: string; text: string }> {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, "--output-format", "json", "--model", model];
    const env = cleanEnv();

    const child = spawn(CLAUDE_PATH, args, {
      env,
      cwd: "/tmp",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Claude CLI timed out after 60s. stderr: ${stderr}`));
    }, 60_000);

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const sessionId = parsed.session_id;
        if (!sessionId) {
          reject(new Error(`No session_id in response: ${stdout.slice(0, 200)}`));
          return;
        }
        resolve({
          sessionId,
          text: parsed.result ?? parsed.text ?? "Ready",
        });
      } catch {
        reject(new Error(`Failed to parse output: ${stdout.slice(0, 200)}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
