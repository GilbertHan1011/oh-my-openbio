import type { CreatedHooks } from "../create-hooks"
import type { OhMyOpenCodeConfig } from "../config"
import { getSessionAgent } from "../features/claude-code-session-state"
import { isRalphLoopResumeArgument, parseRalphLoopArguments } from "../hooks/ralph-loop/command-arguments"
import { log } from "../shared/logger"
import { isAgentCommandAvailable } from "./agent-command-availability"
import { stopContinuation } from "./stop-continuation"

type CommandExecuteBeforeInput = {
  command: string
  sessionID: string
  arguments: string
}

type CommandExecuteBeforeOutput = {
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>
  message?: Record<string, unknown>
}

const NATIVE_LOOP_TRIGGERED_FLAG = "__omoNativeLoopTriggered"

function hasPartsOutput(value: unknown): value is CommandExecuteBeforeOutput {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  const parts = record["parts"]
  return Array.isArray(parts)
}

export function createCommandExecuteBeforeHandler(args: {
  directory: string
  pluginConfig: OhMyOpenCodeConfig
  hooks: CreatedHooks
}): (
  input: CommandExecuteBeforeInput,
  output: CommandExecuteBeforeOutput,
) => Promise<void> {
  const { directory, pluginConfig, hooks } = args

  return async (input, output): Promise<void> => {
    const normalizedCommand = input.command.toLowerCase()
    const sessionID = input.sessionID
    if (!isAgentCommandAvailable(pluginConfig, getSessionAgent(sessionID), normalizedCommand)) {
      output.parts.splice(0, output.parts.length, {
        type: "text",
        text: "This command is unavailable for the active agent.",
      })
      return
    }

    await hooks.autoSlashCommand?.["command.execute.before"]?.(input, output)

    if (normalizedCommand === "stop-continuation" && sessionID) {
      stopContinuation({ directory, hooks, sessionID })
    }

    if (hooks.ralphLoop && sessionID) {
      if (normalizedCommand === "ralph-loop" || normalizedCommand === "ulw-loop") {
        const parsedArguments = parseRalphLoopArguments(input.arguments || "")
        const resumed = isRalphLoopResumeArgument(input.arguments || "")
          && hooks.ralphLoop.resumeLoop?.(sessionID) === true
        if (!resumed) {
          hooks.ralphLoop.startLoop(sessionID, parsedArguments.prompt, {
            ultrawork: normalizedCommand === "ulw-loop",
            maxIterations: parsedArguments.maxIterations,
            completionPromise: parsedArguments.completionPromise,
            strategy: parsedArguments.strategy,
          })
        }
        output.message ??= {}
        output.message[NATIVE_LOOP_TRIGGERED_FLAG] = true
        if (hooks.stopContinuationGuard?.isStopped(sessionID)) {
          hooks.stopContinuationGuard.clear(sessionID)
          log("[stop-continuation] Stop state cleared by native command", {
            sessionID,
            command: normalizedCommand,
          })
        }
      } else if (normalizedCommand === "cancel-ralph") {
        hooks.ralphLoop.cancelLoop(sessionID)
        output.message ??= {}
        output.message[NATIVE_LOOP_TRIGGERED_FLAG] = true
      }
    }

    if (
      hooks.startWork
      && normalizedCommand === "start-work"
      && hasPartsOutput(output)
    ) {
      await hooks.startWork["command.execute.before"]?.(input, output)
      if (hooks.stopContinuationGuard?.isStopped(sessionID)) {
        hooks.stopContinuationGuard.clear(sessionID)
        log("[stop-continuation] Stop state cleared by native command", {
          sessionID,
          command: normalizedCommand,
        })
      }
    }
  }
}

export { NATIVE_LOOP_TRIGGERED_FLAG }
