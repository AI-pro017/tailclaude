# TailClaude

Claude Code on your Tailscale tailnet, powered by the [iii engine](https://github.com/iii-hq/iii).

TailClaude publishes a multi-session Claude Code interface to every device on your tailnet — accessible from any browser with zero port forwarding, zero tunnels, and automatic HTTPS via Tailscale.

## Why TailClaude?

The popular "doom coding" approach uses SSH + tmux + Termius to access Claude Code from a phone. It works, but requires:

- Installing Termius (or another SSH client)
- Configuring SSH keys and auth
- Learning tmux shortcuts (`Ctrl+b d` to detach, `Ctrl+b c` for new window)
- Typing code on a tiny terminal keyboard

TailClaude takes a different approach: **open a browser, start chatting**.

| | SSH + tmux + Termius | TailClaude |
|---|---|---|
| **Client** | Termius app (SSH terminal) | Any browser |
| **Setup on phone** | Install Tailscale + Termius, configure SSH | Open the Tailscale URL |
| **Session persistence** | tmux keeps terminal alive | iii engine state store |
| **Interface** | Full terminal emulator | Web chat UI with markdown |
| **Session management** | `tmux new -s name`, `tmux attach` | Click "+ New Chat", name sessions |
| **Model switching** | Edit CLI flags manually | Dropdown menu |
| **Mobile experience** | Tiny terminal, keyboard shortcuts | Touch-optimized responsive UI |
| **Install time** | ~15 minutes | `npm install && iii -c iii-config.yaml` |

Both approaches use Tailscale for secure access. TailClaude just removes everything else.

## Architecture

```text
+-----------------------------------------------------------------+
|  Browser (any device on your tailnet)                           |
|  https://your-machine.tail-abc.ts.net                           |
+---------------------------------+-------------------------------+
                                  | HTTPS (auto-cert via Tailscale)
                                  v
+-----------------------------------------------------------------+
|  tailscale serve :443 -> http://127.0.0.1:3110                  |
+---------------------------------+-------------------------------+
                                  |
                                  v
+-----------------------------------------------------------------+
|  Node.js Proxy (port 3110)                                      |
|                                                                 |
|  GET  /              -> Chat UI (streaming, controls, QR)       |
|  POST /chat          -> SSE streaming (claude --stream-json)    |
|  POST /chat/stop     -> Kill active claude process              |
|  GET  /sessions      -> Discover terminal + web sessions        |
|  GET  /qr            -> QR code SVG                             |
|  GET  /settings      -> MCP servers list                        |
|  *                   -> Proxy to iii engine (port 3111)          |
+---------------------------------+-------------------------------+
                                  |
                                  v
+-----------------------------------------------------------------+
|  iii REST API (port 3111)                                       |
|                                                                 |
|  GET  /health        -> Health + Tailscale status + sessions    |
|                                                                 |
|  Event: engine::started -> auto-publish to Tailscale + QR       |
|  Cron:  */30 * * * *    -> cleanup sessions older than 24h      |
|  Signal: SIGINT/SIGTERM  -> unpublish Tailscale + clean exit    |
+---------------------------------+-------------------------------+
                                  | WebSocket (ws://localhost:49134)
                                  v
+-----------------------------------------------------------------+
|  iii engine                                                     |
|                                                                 |
|  +----------+ +--------+ +------+ +----+ +----------+          |
|  |  State   | | Queue  | |PubSub| |Cron| |   Otel   |          |
|  | (KV/file)| |(builtin)| |(local)| |(KV)| | (memory) |          |
|  +----------+ +--------+ +------+ +----+ +----------+          |
+-----------------------------------------------------------------+
                                  |
                                  v
+-----------------------------------------------------------------+
|  claude -p --output-format stream-json --include-partial-messages|
|  (Claude Code CLI -- works with Pro/Max plans)                  |
+-----------------------------------------------------------------+
```

## How It Works

1. **iii engine** runs the REST API, state store, event bus, and cron scheduler
2. **TailClaude worker** connects via WebSocket and registers the health handler
3. **Node.js proxy** (port 3110) serves the UI and handles all chat/session endpoints
4. `POST /chat` spawns `claude -p --output-format stream-json` and streams tokens via SSE
5. `GET /sessions` discovers both terminal sessions (`~/.claude/sessions/`) and web sessions
6. On engine start, TailClaude auto-publishes to your tailnet via `tailscale serve` and prints a QR code
7. On shutdown (Ctrl+C), TailClaude unpublishes from Tailscale and exits cleanly
8. A cron job cleans up stale sessions every 30 minutes

## Prerequisites

- [iii engine](https://github.com/iii-hq/iii) installed and on your PATH
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- [Tailscale](https://tailscale.com) installed (optional -- works locally without it)
- Node.js 20+

## Setup

```bash
git clone https://github.com/rohitg00/tailclaude.git
cd tailclaude
npm install
```

## Running

### Option A: iii manages everything (recommended)

The `iii-config.yaml` includes a shell exec module that auto-starts the worker:

```bash
iii -c iii-config.yaml
```

This starts the iii engine and automatically runs `npx tsx src/index.ts`.

### Option B: Run separately

```bash
# Terminal 1 -- start iii engine
iii -c iii-config.yaml

# Terminal 2 -- start the worker
npm run dev
```

### Verify

```bash
# Health check
curl http://localhost:3111/health

# Open the chat UI (via proxy)
open http://localhost:3110

# List all sessions (terminal + web)
curl http://localhost:3110/sessions

# QR code SVG
curl http://localhost:3110/qr
```

## Chat UI Features

- **SSE streaming** -- tokens appear in real-time as Claude generates them
- **Session discovery** -- browse and resume any terminal or web session
- **QR code** -- scan from phone to access TailClaude on your tailnet
- **Permission modes** -- default, plan, acceptEdits, bypassPermissions, dontAsk
- **Effort levels** -- low, medium, high
- **Model selector** -- switch between Sonnet, Opus, and Haiku
- **Budget control** -- set max spend per message
- **System prompt** -- append instructions to every message
- **MCP servers** -- view configured MCP servers in settings
- **Stop button** -- abort mid-response
- **Mobile-first** -- hamburger menu, touch-optimized, responsive layout
- **Session naming** -- double-click (or long-press on mobile) to name sessions
- **Auto-restore** -- reopening the browser resumes your last active session
- **Dark theme** with purple accents
- **Inline markdown** rendering (code blocks, bold, italic, lists)
- **Cost tracking** per message and cumulative
- **Tool use badges** on assistant responses
- **Connection status** with auto-reconnect polling
- **Auth support** -- set `TAILCLAUDE_TOKEN` env var to require bearer token

## Project Structure

```text
tailclaude/
├── iii-config.yaml              # iii engine configuration (180s timeout)
├── package.json                 # dependencies (iii-sdk, qrcode)
├── tsconfig.json
└── src/
    ├── iii.ts                   # SDK init (iii-sdk init() with OTel config)
    ├── hooks.ts                 # useApi, useEvent, useCron helpers
    ├── state.ts                 # State wrapper (scope/key API via iii.call)
    ├── proxy.ts                 # HTTP proxy with SSE chat, sessions, QR, settings
    ├── index.ts                 # Register health route + event + cron + proxy
    ├── ui.html                  # Chat UI (single file, inline CSS/JS)
    └── handlers/
        ├── health.ts            # GET /health (with Tailscale + session status)
        ├── setup.ts             # Tailscale auto-publish with QR code
        ├── shutdown.ts          # Graceful shutdown (SIGINT/SIGTERM + unpublish)
        └── cleanup.ts           # Cron: remove stale sessions
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `III_BRIDGE_URL` | `ws://localhost:49134` | iii engine WebSocket URL |
| `NODE_ENV` | - | Set to `production` to enable UI caching |
| `TAILCLAUDE_TOKEN` | - | Bearer token for proxy auth (optional) |

### iii Modules

The `iii-config.yaml` enables these modules:

| Module | Purpose |
|--------|---------|
| State (KV/file) | Persist sessions to `./data/state_store.db` |
| REST API | HTTP server on port 3111 with CORS (180s timeout) |
| Queue (builtin) | Internal task queue |
| PubSub (local) | Event bus for `engine::started` |
| Cron (KV) | Scheduled session cleanup |
| Otel (memory) | Observability and structured logging |
| Shell Exec | Auto-run the TypeScript worker (watches `src/**/*.ts`) |

## Tailscale Integration

When Tailscale is available, TailClaude automatically:

1. Detects your Tailscale IP on engine start
2. Checks for existing serve listeners (reuses if already active)
3. Runs `tailscale serve --bg --yes --https=443 http://127.0.0.1:3110`
4. Verifies the proxy registered via `tailscale serve status --json`
5. Handles port conflicts by clearing and retrying
6. Prints a QR code to the terminal for mobile access
7. Logs the published URL (also shown in health check and UI sidebar)
8. On shutdown (SIGINT/SIGTERM), runs `tailscale serve --https=443 off`

If Tailscale is not installed, it runs in local-only mode at `http://127.0.0.1:3110`.

## Inspiration

TailClaude was inspired by the "doom coding" movement -- developers using Tailscale + SSH + tmux + Termius to code from their phones. Articles by [Pete Sena](https://medium.com/@petesena) and [Emre Isik](https://medium.com/@emreisik95), plus the [doom-coding](https://github.com/rberg27/doom-coding) repo by Ryan Bergamini, showed how powerful mobile coding can be.

TailClaude takes this further by removing the terminal layer entirely -- just a browser and a URL.

## License

MIT
