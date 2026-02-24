import { execFile } from "node:child_process";

const TAILSCALE_CLI =
  process.platform === "darwin"
    ? "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
    : "tailscale";

const SHUTDOWN_TIMEOUT_MS = 5_000;

async function unpublishTailscale(): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      TAILSCALE_CLI,
      ["serve", "--https=443", "off"],
      { timeout: 10_000 },
      (err, _stdout, stderr) => {
        if (err) {
          console.error(`Tailscale cleanup error: ${stderr || err.message}`);
        } else {
          console.log("Tailscale serve unpublished (HTTPS 443)");
        }
        resolve();
      },
    );
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — shutting down TailClaude`);

  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await unpublishTailscale();
  } catch {
    // best-effort cleanup
  }

  clearTimeout(forceExit);
  process.exit(0);
}

export function registerShutdownHandlers(): void {
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  console.log("Shutdown handlers registered (SIGINT, SIGTERM)");
}
