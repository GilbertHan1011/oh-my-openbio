# Server TUI State Mirror Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable `TuiStateMirror` by default when OMO runs against an OpenCode server, while preserving CLI/TUI defaults and explicit configuration overrides.

**Architecture:** Preserve the tri-state configuration value through schema parsing. Resolve the runtime default in `createManagers` using `ctx.serverUrl`: a local CLI has no server URL and keeps the mirror; a server-connected runtime defaults off. Explicit booleans override runtime detection.

**Tech Stack:** TypeScript, Zod, Bun test.

---

### Task 1: Preserve explicit sidebar configuration

**Files:**
- Modify: `packages/omo-opencode/src/config/schema/tui.ts`
- Test: `packages/omo-opencode/src/config/schema/oh-my-opencode-config.test.ts`

- [ ] Write a failing test asserting an unset sidebar remains `undefined`, while explicit booleans parse unchanged.
- [ ] Run the focused schema test and confirm the assertion fails because the schema defaults it to `true`.
- [ ] Replace the boolean default with an optional boolean and keep the parent sidebar object available.
- [ ] Re-run the focused schema test.

### Task 2: Gate the server-side mirror by runtime

**Files:**
- Modify: `packages/omo-opencode/src/create-managers.ts`
- Test: `packages/omo-opencode/src/create-managers.test.ts`

- [ ] Write failing tests for server default disabled and explicit server opt-in.
- [ ] Run the focused manager test and confirm both tests fail before the change.
- [ ] Add a small named resolver for explicit `true`/`false` and the unset CLI/server defaults; use it before constructing `TuiStateMirror`.
- [ ] Re-run the focused manager test.

### Task 3: Verify behavior and record isolated QA evidence

**Files:**
- Create: `.omo/evidence/20260720-server-tui-mirror-default/README.md`

- [ ] Run focused schema and manager tests, then package typecheck.
- [ ] Run the repository `opencode-qa` isolated server/SSE smoke harness; do not touch the real OpenCode DB.
- [ ] Record commands, results, isolation proof, and remaining limits in the evidence file.

## Execution note
- 2026-07-20: `bun install --frozen-lockfile` in the isolated worktree failed because `bun` is not on PATH (`/bin/bash: bun: command not found`). Next step: locate the project-supported Bun runtime or use a supported repository wrapper; do not substitute another test runner.
- 2026-07-20: temporary Bun runner was acquired via `npm exec bun@1.3.12`. Dependency installation populated `node_modules`, but its repository postinstall entered the unrelated frontend-materialization build for several minutes and was interrupted rather than waiting indefinitely. Targeted Bun tests remain available through the installed dependencies; full build remains a later validation step.
- 2026-07-20: First implementation attempt did not change either failing expectation. The focused test output proves a second defaulting layer still sets `tui.sidebar.enabled` to `true`; no additional behavior changes will be made until that layer is identified.
- 2026-07-20: Package typecheck showed that making top-level `tui` required breaks typed test fixtures. The repair preserves the existing optional top-level shape and defaults only the nested sidebar object, leaving `enabled` unset when omitted.
