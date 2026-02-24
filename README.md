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

```
+-----------------------------------------------------------------+
|  Browser (any device on your tailnet)                           |
|  https://your-machine.tail-abc.ts.net                           |
+---------------------------------+-------------------------------+
                                  | HTTPS (auto-cert via Tailscale)
                                  v
+-----------------------------------------------------------------+
|  tailscale serve :443 -> http://127.0.0.1:3111                  |
+---------------------------------+-------------------------------+
                                  |
                                  v
+-----------------------------------------------------------------+
|  iii REST API (port 3111)                                       |
|                                                                 |
|  GET  /              -> Chat UI (responsive, session naming)    |
|  GET  /health        -> Health + Tailscale status + sessions    |
|  GET  /sessions      -> List all sessions                       |
|  POST /sessions      -> Create new Claude session               |
|  POST /sessions/chat -> Send message to Claude                  |
|                                                                 |
|  Event: engine::started -> auto-publish to Tailscale            |
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
|  claude -p --resume <session-id> --output-format json           |
|  (Claude Code CLI -- works with Pro/Max plans)                  |
+-----------------------------------------------------------------+
```

## How It Works

1. **iii engine** runs the REST API, state store, event bus, and cron scheduler
2. **TailClaude worker** connects via WebSocket and registers API handlers
3. `POST /sessions` spawns a new Claude session via `claude -p --session-id <uuid>`
4. `POST /sessions/chat` sends messages via `claude -p --resume <id>` for multi-turn context
5. On engine start, TailClaude auto-publishes to your tailnet via `tailscale serve`
6. On shutdown (Ctrl+C), TailClaude unpublishes from Tailscale and exits cleanly
7. A cron job cleans up stale sessions every 30 minutes

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
# Health check (now includes Tailscale status and session count)
curl http://localhost:3111/health

# Create a session (takes 30-60s for Claude CLI init)
curl -X POST http://localhost:3111/sessions \
  -H 'Content-Type: application/json' \
  -d '{"model":"sonnet"}'

# Send a message
curl -X POST http://localhost:3111/sessions/chat \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"<id-from-above>","message":"What is 2+2?"}'

# Open the chat UI
open http://localhost:3111
```

## Chat UI Features

- **Mobile-first** -- hamburger menu, touch-optimized, responsive layout
- **Session naming** -- double-click (or long-press on mobile) to name sessions
- **Model selector** -- switch between Sonnet, Opus, and Haiku from the sidebar
- **Auto-restore** -- reopening the browser resumes your last active session
- **Tailscale URL display** -- shows your published URL in the sidebar
- **Dark theme** with purple accents
- **Inline markdown** rendering (code blocks, bold, italic, lists)
- **Loading animation** while waiting for Claude
- **Cost tracking** per message and cumulative
- **Tool use badges** on assistant responses
- **Connection status** with auto-reconnect polling

## Project Structure

```
tailclaude/
├── iii-config.yaml              # iii engine configuration (180s timeout)
├── package.json                 # dependencies (iii-sdk)
├── tsconfig.json
└── src/
    ├── iii.ts                   # SDK init (iii-sdk init() with OTel config)
    ├── hooks.ts                 # useApi, useEvent, useCron helpers
    ├── state.ts                 # State wrapper (scope/key API via iii.call)
    ├── index.ts                 # Register all routes + handlers
    ├── ui.html                  # Chat UI (single file, inline CSS/JS)
    └── handlers/
        ├── health.ts            # GET /health (with Tailscale + session status)
        ├── create-session.ts    # POST /sessions
        ├── send-message.ts      # POST /sessions/chat
        ├── list-sessions.ts     # GET /sessions
        ├── serve-ui.ts          # GET / (serves ui.html, dev-mode cache bypass)
        ├── setup.ts             # Tailscale auto-publish with verification
        ├── shutdown.ts          # Graceful shutdown (SIGINT/SIGTERM + unpublish)
        └── cleanup.ts           # Cron: remove stale sessions
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `III_BRIDGE_URL` | `ws://localhost:49134` | iii engine WebSocket URL |
| `NODE_ENV` | - | Set to `production` to enable UI caching |

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
3. Runs `tailscale serve --bg --yes --https=443 http://127.0.0.1:3111`
4. Verifies the proxy registered via `tailscale serve status --json`
5. Handles port conflicts by clearing and retrying
6. Logs the published URL (also shown in health check and UI sidebar)
7. On shutdown (SIGINT/SIGTERM), runs `tailscale serve --https=443 off`

If Tailscale is not installed, it runs in local-only mode at `http://127.0.0.1:3111`.

## Inspiration

TailClaude was inspired by the "doom coding" movement -- developers using Tailscale + SSH + tmux + Termius to code from their phones. Articles by [Pete Sena](https://medium.com/@petesena) and [Emre Isik](https://medium.com/@emreisik95), plus the [doom-coding](https://github.com/rberg27/doom-coding) repo by Ryan Bergamini, showed how powerful mobile coding can be.

TailClaude takes this further by removing the terminal layer entirely -- just a browser and a URL.

## License

MIT
