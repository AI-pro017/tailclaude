import "./iii.js";
import { useApi, useEvent, useCron } from "./hooks.js";
import { handleHealth } from "./handlers/health.js";
import { handleCreateSession } from "./handlers/create-session.js";
import { handleSendMessage } from "./handlers/send-message.js";
import { handleListSessions } from "./handlers/list-sessions.js";
import { handleServeUI } from "./handlers/serve-ui.js";
import { handleEngineStarted } from "./handlers/setup.js";
import { handleCleanup } from "./handlers/cleanup.js";
import { registerShutdownHandlers } from "./handlers/shutdown.js";

useApi(
  { api_path: "/", http_method: "GET", description: "Serve chat UI" },
  handleServeUI,
);
useApi(
  { api_path: "health", http_method: "GET", description: "Health check" },
  handleHealth,
);
useApi(
  { api_path: "sessions", http_method: "GET", description: "List sessions" },
  handleListSessions,
);
useApi(
  { api_path: "sessions", http_method: "POST", description: "Create session" },
  handleCreateSession,
);
useApi(
  {
    api_path: "sessions/chat",
    http_method: "POST",
    description: "Send message",
  },
  handleSendMessage,
);

useEvent("engine::started", handleEngineStarted, "Check Tailscale and publish");

useCron(
  "0 */30 * * * *",
  handleCleanup,
  "Cleanup stale sessions every 30 minutes",
);

registerShutdownHandlers();

console.log("TailClaude worker registered — waiting for iii engine connection");
