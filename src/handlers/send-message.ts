import { spawn } from "node:child_process";
import type { ApiRequest, ApiResponse, Context } from "iii-sdk";
import { state } from "../state.js";

type ChatBody = {
  sessionId: string;
  message: string;
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

export const handleSendMessage = async (
  req: ApiRequest<ChatBody>,
  ctx: Context,
): Promise<ApiResponse> => {
  const { sessionId, message } = req.body ?? {};

  if (!sessionId || !message) {
    return {
      status_code: 400,
      headers: { "content-type": "application/json" },
      body: { error: "Missing sessionId or message" },
    };
  }

  const session = await state.get<Session>({
    scope: "sessions",
    key: sessionId,
  });
  if (!session) {
    return {
      status_code: 404,
      headers: { "content-type": "application/json" },
      body: { error: "Session not found" },
    };
  }

  ctx.logger.info(`[${sessionId}] Sending message (${message.length} chars)`);
  const start = Date.now();

  try {
    const raw = await runClaude(message, sessionId, session.model);
    const duration = Date.now() - start;
    const parsed = parseClaudeResponse(raw);

    await state.set({
      scope: "sessions",
      key: sessionId,
      data: {
        ...session,
        lastUsed: new Date().toISOString(),
        messageCount: session.messageCount + 1,
      },
    });

    ctx.logger.info(`[${sessionId}] Response in ${duration}ms`);

    return {
      status_code: 200,
      headers: { "content-type": "application/json" },
      body: {
        response: parsed.text,
        toolsUsed: parsed.toolsUsed,
        cost: parsed.cost,
        duration,
        sessionId,
      },
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`[${sessionId}] Error: ${detail}`);

    return {
      status_code: 500,
      headers: { "content-type": "application/json" },
      body: { error: "Claude invocation failed", detail },
    };
  }
};

function runClaude(
  prompt: string,
  sessionId: string,
  model: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--resume",
      sessionId,
      "--model",
      model,
    ];

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
      reject(new Error(`Claude CLI timed out after 160s. stderr: ${stderr}`));
    }, 160_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
        return;
      }
      resolve(stdout);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function parseClaudeResponse(raw: string): {
  text: string;
  toolsUsed: string[];
  cost: string | null;
} {
  try {
    const parsed = JSON.parse(raw);
    return {
      text: parsed.result ?? parsed.text ?? raw,
      toolsUsed: parsed.tool_uses?.map((t: { name: string }) => t.name) ?? [],
      cost: parsed.total_cost_usd?.toString() ?? null,
    };
  } catch {
    return { text: raw.trim(), toolsUsed: [], cost: null };
  }
}
