import type { ToolDefinition } from "@opencode-ai/plugin"
import type { AvailableCategory } from "../agents/dynamic-agent-prompt-builder"
import type { OhMyOpenCodeConfig } from "../config"
import type { Managers } from "../create-managers"
import type { SkillContext } from "./skill-context"
import type { PluginContext, ToolsRecord } from "./types"
import type { ToolRegistryFactories } from "./tool-registry-factories"

import { getMainSessionID } from "../features/claude-code-session-state"
import * as openclawRuntimeDispatch from "../openclaw/runtime-dispatch"
import { log } from "../shared"
import { getSisyphusJuniorModelOverride } from "./tool-registry-team-tools"
import { createNativeSkills, getPluginInputNativeSkills } from "./native-skills"
import { createSkillContext } from "./skill-context"
import { createRuntimeSkillsResolver, readRuntimeHostSkills } from "./runtime-skill-resolver"
import { getAgentConfigKey } from "../shared/agent-display-names"
import { resolveAgentUnavailableSkills } from "../agents/agent-skill-availability"

export function createCoreTools(args: {
  readonly ctx: PluginContext
  readonly pluginConfig: OhMyOpenCodeConfig
  readonly managers: Pick<Managers, "backgroundManager" | "tmuxSessionManager" | "skillMcpManager" | "modelFallbackControllerAccessor">
  readonly skillContext: SkillContext
  readonly availableCategories: AvailableCategory[]
  readonly factories: ToolRegistryFactories
}): Record<string, ToolDefinition> {
  const { ctx, pluginConfig, managers, skillContext, availableCategories, factories } = args
  const backgroundTools = factories.createBackgroundTools(managers.backgroundManager, ctx.client)
  const callOmoAgent = factories.createCallOmoAgent(
    ctx,
    managers.backgroundManager,
    pluginConfig.disabled_agents ?? [],
    pluginConfig.agents,
    pluginConfig.categories,
    managers.modelFallbackControllerAccessor,
  )
  const isMultimodalLookerEnabled = !(pluginConfig.disabled_agents ?? []).some(
    (agent) => agent.toLowerCase() === "multimodal-looker",
  )
  const nativeSkills = getPluginInputNativeSkills(ctx) ?? createNativeSkills({
    client: ctx.client,
    directory: ctx.directory,
  })
  const getSessionIDForMcp = (): string | undefined => getMainSessionID()
  const getLoadedSkills = createRuntimeSkillsResolver({
    baseSkills: skillContext.mergedSkills,
    readRuntimeHostSkills: () => readRuntimeHostSkills(ctx.client),
    buildMergedSkills: async (hostSkills) =>
      (await createSkillContext({ directory: ctx.directory, pluginConfig, hostSkills })).mergedSkills,
  })

  // The task and skill tools are shared across agents, so agent-level policy is
  // resolved at call time. Global disabled_skills remains a separate filter.
  const agentOverrides = pluginConfig.agents ?? {}
  const resolveUnavailableSkills = (
    agentName: string | undefined,
  ): readonly string[] | undefined => {
    if (!agentName) return undefined
    const key = getAgentConfigKey(agentName)
    const override = agentOverrides[key]
      ?? Object.entries(agentOverrides).find(([k]) => k.toLowerCase() === agentName.toLowerCase())?.[1]
    return resolveAgentUnavailableSkills(key, override?.unavailable_skills)
  }
  const configuredAgentNames = new Set([...Object.keys(agentOverrides), "hermes"])
  const globallyUnavailableSkills = Array.from(configuredAgentNames)
    .flatMap((agentName) => resolveUnavailableSkills(agentName) ?? [])

  const delegateTask = factories.createDelegateTask({
    manager: managers.backgroundManager,
    client: ctx.client,
    directory: ctx.directory,
    userCategories: pluginConfig.categories,
    agentOverrides: pluginConfig.agents,
    gitMasterConfig: pluginConfig.git_master,
    sisyphusJuniorModel: getSisyphusJuniorModelOverride(pluginConfig.agents?.["sisyphus-junior"]),
    browserProvider: skillContext.browserProvider,
    disabledSkills: skillContext.disabledSkills,
    teamModeEnabled: pluginConfig.team_mode?.enabled ?? false,
    availableCategories,
    availableSkills: skillContext.availableSkills,
    nativeSkills,
    getLoadedSkills,
    sisyphusAgentConfig: pluginConfig.sisyphus_agent,
    syncPollTimeoutMs: pluginConfig.background_task?.syncPollTimeoutMs,
    modelFallbackControllerAccessor: managers.modelFallbackControllerAccessor,
    unavailableSkillsResolver: resolveUnavailableSkills,
    onSyncSessionCreated: async (event) => {
      log("[index] onSyncSessionCreated callback", {
        sessionID: event.sessionID,
        parentID: event.parentID,
        title: event.title,
      })
      await managers.tmuxSessionManager.onSessionCreated({
        type: "session.created",
        properties: {
          info: {
            id: event.sessionID,
            parentID: event.parentID,
            title: event.title,
          },
        },
      })

      if (pluginConfig.openclaw) {
        await openclawRuntimeDispatch.dispatchOpenClawEvent({
          config: pluginConfig.openclaw,
          rawEvent: "session.created",
          context: {
            sessionId: event.sessionID,
            projectPath: ctx.directory,
            tmuxPaneId: managers.tmuxSessionManager.getTrackedPaneId?.(event.sessionID) ?? process.env.TMUX_PANE,
          },
        })
      }
    },
  })

  const skillMcpTool = factories.createSkillMcpTool({
    manager: managers.skillMcpManager,
    getLoadedSkills,
    getSessionID: getSessionIDForMcp,
    unavailableSkillsResolver: resolveUnavailableSkills,
  })
  const commands = factories.discoverCommandsSync(ctx.directory, {
    pluginsEnabled: pluginConfig.claude_code?.plugins ?? true,
    enabledPluginsOverride: pluginConfig.claude_code?.plugins_override,
  })
  const skillTool = factories.createSkillTool({
    directory: ctx.directory,
    commands,
    skills: skillContext.mergedSkills,
    getLoadedSkills,
    mcpManager: managers.skillMcpManager,
    getSessionID: getSessionIDForMcp,
    gitMasterConfig: pluginConfig.git_master,
    browserProvider: skillContext.browserProvider,
    disabledSkills: skillContext.disabledSkills,
    teamModeEnabled: pluginConfig.team_mode?.enabled ?? false,
    nativeSkills,
    pluginsEnabled: pluginConfig.claude_code?.plugins ?? true,
    enabledPluginsOverride: pluginConfig.claude_code?.plugins_override,
    includeSkillsInDescription: true,
    unavailableSkills: globallyUnavailableSkills,
    unavailableSkillsResolver: resolveUnavailableSkills,
  })

  const tools: ToolsRecord = {
    ...factories.createGrepTools(ctx),
    ...factories.createGlobTools(ctx),
    ...factories.createSessionManagerTools(ctx),
    ...backgroundTools,
    call_omo_agent: callOmoAgent,
  }
  if (isMultimodalLookerEnabled) {
    tools.look_at = factories.createLookAt(ctx)
  }
  tools.task = delegateTask
  tools.skill_mcp = skillMcpTool
  tools.skill = skillTool

  return tools
}
