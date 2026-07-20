# Server TUI State Mirror Default

## Goal
Prevent the OpenCode server runtime from spending CPU, database reads, and filesystem writes on the terminal-only `TuiStateMirror`, while preserving terminal sidebar behavior when it is useful.

## Evidence
- `createManagers` currently constructs and starts `TuiStateMirror` whenever `tui.sidebar.enabled !== false`.
- `TuiStateMirror` flushes on every plugin event and every two-second heartbeat.
- Every flush reads session status, fetches messages for active sessions, and atomically writes the mirror.
- A long-running server with a large OpenCode database and concurrent sessions therefore pays this cost even when no terminal sidebar consumes it.

## Design
1. Preserve whether `tui.sidebar.enabled` was explicitly configured by making the parsed field optional instead of defaulting it to `true`.
2. In `createManagers`, resolve the runtime default:
   - explicit `true`: start the mirror in any runtime;
   - explicit `false`: never start the mirror;
   - unset with no `ctx.serverUrl`: start the mirror for local CLI/TUI usage;
   - unset with `ctx.serverUrl`: do not start it for server/web usage.
3. Keep the existing TUI plugin entry behavior: an unset value remains enabled for terminal users; only the server-side mirror is disabled by default.
4. Lock the behavior with focused unit tests for server default, CLI default, explicit server opt-in, and explicit opt-out.

## Non-goals
- Do not alter background-agent polling, event-hook ordering, or other plugin behavior.
- Do not change user configuration files or live service processes.
- Do not redesign the TUI protocol.

## Validation
- Test-first unit tests demonstrate the new runtime default and explicit overrides.
- Package typecheck and focused tests pass.
- Isolated OpenCode server QA proves the plugin still loads and server/SSE behavior works without touching the real OpenCode data directory.
