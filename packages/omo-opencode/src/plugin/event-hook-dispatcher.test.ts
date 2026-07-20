/// <reference path="../../../../bun-test.d.ts" />
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { CreatedHooks } from "../create-hooks";
import { _flushForTesting, _resetLoggerForTesting, _setLoggerForTesting } from "../shared/logger";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventHookDispatcher, createEventHookRunner } from "./event-hook-dispatcher";
import type { EventInput } from "./event-types";

const PROFILE_ENV = "OMO_EVENT_PROFILE";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function asEventInput(value: unknown): EventInput {
  return value as EventInput;
}

function createSlowDispatcher() {
  const hooks = {
    claudeCodeHooks: {
      event: async () => wait(40),
    },
  } as unknown as CreatedHooks;

  return createEventHookDispatcher(hooks, createEventHookRunner());
}

describe("event hook dispatcher profiling", () => {
  let tempDirectory: string;
  let logFilePath: string;
  let originalProfileEnvironment: string | undefined;

  beforeEach(() => {
    tempDirectory = mkdtempSync(join(tmpdir(), "omo-event-profile-"));
    logFilePath = join(tempDirectory, "oh-my-opencode.log");
    originalProfileEnvironment = process.env[PROFILE_ENV];
    delete process.env[PROFILE_ENV];
    _setLoggerForTesting({ filePath: logFilePath });
  });

  afterEach(() => {
    if (originalProfileEnvironment === undefined) delete process.env[PROFILE_ENV];
    else process.env[PROFILE_ENV] = originalProfileEnvironment;
    _resetLoggerForTesting();
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("does not emit event timing logs while profiling is disabled", async () => {
    const dispatcher = createSlowDispatcher();

    await dispatcher(asEventInput({ event: { type: "message.part.delta", properties: {} } }));
    _flushForTesting();

    const contents = existsSync(logFilePath) ? readFileSync(logFilePath, "utf8") : "";
    expect(contents).not.toContain("[omo-event-profile]");
  });

  it("records the slow hook and total dispatcher time when profiling is enabled", async () => {
    process.env[PROFILE_ENV] = "1";
    const dispatcher = createSlowDispatcher();

    await dispatcher(asEventInput({ event: { type: "message.part.delta", properties: {} } }));
    _flushForTesting();

    const contents = readFileSync(logFilePath, "utf8");
    expect(contents).toContain("[omo-event-profile] hook");
    expect(contents).toContain('"eventType":"message.part.delta"');
    expect(contents).toContain('"hook":"claudeCodeHooks"');
    expect(contents).toContain("[omo-event-profile] dispatcher");
  });
});
