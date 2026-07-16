import { dirname } from "node:path"
import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { TOOL_DESCRIPTION_PREFIX } from "./constants"
import { shouldInvalidateSkillCacheForSession } from "./session-skill-cache"
import type { SkillArgs, SkillLoadOptions } from "./types"
import type { LoadedSkill } from "../../features/opencode-skill-loader"
import { clearSkillCache, getAllSkills } from "../../features/opencode-skill-loader/skill-content"
import { injectGitMasterConfig } from "../../features/opencode-skill-loader/skill-content"
import * as commandDiscovery from "../slashcommand/command-discovery"
import type { CommandInfo } from "../slashcommand/types"
import { formatLoadedCommand } from "../slashcommand/command-output-formatter"
import { formatCombinedDescription } from "./description-formatter"
import { formatMcpCapabilities } from "./mcp-capability-formatter"
import {
  findPartialMatches,
  matchCommandByName,
  matchSkillByName,
} from "./skill-matcher"
import { extractSkillBody } from "./skill-body"
import {
  isPromiseLike,
  loadedSkillToInfo,
  mergeNativeSkillInfos,
  mergeNativeSkills,
} from "./native-skills"
import {
  buildAgentUnavailableSet,
  findUnknownUnavailableSkills,
  isSkillUnavailable,
} from "../../agents/agent-skill-availability"
import type { AgentUnavailableSet } from "../../agents/agent-skill-availability"
import { log } from "../../shared/logger"
import { getAgentConfigKey } from "../../shared/agent-display-names"

export function createSkillTool(options: SkillLoadOptions): ToolDefinition {
  let cachedDescription: string | null = null
  const descriptionsByAgent = new Map<string, string>()
  const reportedUnknownAgents = new Set<string>()
  const hasAgentScopedAvailability = options.unavailableSkillsResolver !== undefined

  // Resolve the active agent's denylist at call time. The static
  // `options.unavailableSkills` is honored when no resolver is provided; the
  // resolver takes precedence because the same `skill` tool is shared across
  // many agents and the denylist depends on the caller.
  const resolveUnavailable = (agentName: string | undefined): AgentUnavailableSet => {
    const resolved = agentName !== undefined && options.unavailableSkillsResolver
      ? options.unavailableSkillsResolver(agentName)
      : options.unavailableSkills
    return buildAgentUnavailableSet(resolved)
  }

  const filterUnavailableSkills = (
    skills: LoadedSkill[],
    agentName: string | undefined,
  ): LoadedSkill[] => {
    const set = resolveUnavailable(agentName)
    if (set.entries.size === 0) return skills
    return skills.filter(s => !isSkillUnavailable(s.name, set))
  }

  const getBaseSkills = async (context?: ToolContext): Promise<LoadedSkill[]> => {
    if (shouldInvalidateSkillCacheForSession(context?.sessionID)) {
      clearSkillCache()
    }

    if (options.getLoadedSkills) {
      const loadedSkills = await options.getLoadedSkills()
      return [...loadedSkills]
    }

    const discovered = (await getAllSkills({
      disabledSkills: options?.disabledSkills,
      browserProvider: options?.browserProvider,
      teamModeEnabled: options?.teamModeEnabled,
      directory: options.directory,
    })) ?? []
    return options.skills ? [...options.skills] : discovered
  }

  const mergeNativeSkillsInto = async (skills: LoadedSkill[]): Promise<void> => {
    if (options.nativeSkills) {
      try {
        const nativeAll = await options.nativeSkills.all()
        mergeNativeSkills(skills, nativeAll, options.disabledSkills)
      } catch (error) {
        if (!(error instanceof Error)) throw error
      }
    }
  }

  const getSkills = async (context?: ToolContext, agentName = context?.agent): Promise<LoadedSkill[]> => {
    const allSkills = await getBaseSkills(context)
    await mergeNativeSkillsInto(allSkills)
    return filterUnavailableSkills(allSkills, agentName)
  }

  const getCommands = (): CommandInfo[] => {
    if (options.commands) return [...options.commands]

    return commandDiscovery.discoverCommandsSync(undefined, {
      pluginsEnabled: options.pluginsEnabled,
      enabledPluginsOverride: options.enabledPluginsOverride,
    }) ?? []
  }

  const buildDescription = async (force = false): Promise<string> => {
    const agentName = options.getDescriptionAgent?.()
    const cacheKey = agentName ?? "__global__"
    const cachedForAgent = descriptionsByAgent.get(cacheKey)
    if (!force && cachedForAgent) return cachedForAgent
    const commands = getCommands()
    const skills = await getSkills(undefined, agentName)
    const publicSkills = skills.filter((s) => !s.definition.agent)
    const skillInfos = publicSkills.map(loadedSkillToInfo)
    const description = formatCombinedDescription(skillInfos, commands, {
      includeSkills: options.includeSkillsInDescription,
    })
    descriptionsByAgent.set(cacheKey, description)
    if (agentName === undefined) cachedDescription = description
    return description
  }

  if (options.skills !== undefined) {
    const staticSet = buildAgentUnavailableSet(options.unavailableSkills)
    const publicSkills = options.skills
      .filter((s) => !s.definition.agent)
      .filter((s) => !isSkillUnavailable(s.name, staticSet))
    const skillInfos = publicSkills.map(loadedSkillToInfo)
    const commandsForDescription = options.commands ?? []
    let needsAsyncRefresh = false

    if (options.nativeSkills) {
      try {
        const nativeAll = options.nativeSkills.all()
        if (isPromiseLike(nativeAll)) {
          needsAsyncRefresh = true
        } else {
          mergeNativeSkillInfos(skillInfos, nativeAll, options.disabledSkills)
          if (staticSet.entries.size > 0) {
            for (let i = skillInfos.length - 1; i >= 0; i--) {
              if (isSkillUnavailable(skillInfos[i]!.name, staticSet)) {
                skillInfos.splice(i, 1)
              }
            }
          }
        }
      } catch (error) {
        if (!(error instanceof Error)) throw error
      }
    }

    cachedDescription = formatCombinedDescription(skillInfos, commandsForDescription, {
      includeSkills: options.includeSkillsInDescription,
    })
    descriptionsByAgent.set("__global__", cachedDescription)
    if (needsAsyncRefresh || options.getDescriptionAgent) {
      void buildDescription(true)
    }
  } else if (options.commands !== undefined) {
    cachedDescription = formatCombinedDescription([], options.commands, {
      includeSkills: options.includeSkillsInDescription,
    })
  }

  return tool({
    get description() {
      const agentName = options.getDescriptionAgent?.()
      const agentDescription = descriptionsByAgent.get(agentName ?? "__global__")
      if (agentDescription) return agentDescription
      if (agentName !== undefined) {
        void buildDescription(true)
      }
      if (cachedDescription === null) {
        void buildDescription()
      }
      return cachedDescription ?? TOOL_DESCRIPTION_PREFIX
    },
    args: {
      name: tool.schema.string().describe("The skill or command name (e.g., 'review-work' or 'publish'). Use without leading slash for commands."),
      user_message: tool.schema
        .string()
        .optional()
        .describe("Optional arguments or context for command invocation. Example: name='publish', user_message='patch'"),
    },
    async execute(args: SkillArgs, ctx?: ToolContext) {
      const skills = await getBaseSkills(ctx)
      const commands = getCommands()

      const requestedName = args.name.replace(/^\//, "")
      let matchedSkill = matchSkillByName(skills, requestedName)

      if (!matchedSkill && options.nativeSkills) {
        await mergeNativeSkillsInto(skills)
        matchedSkill = matchSkillByName(skills, requestedName)
      }

      const visibleSkills = filterUnavailableSkills(skills, ctx?.agent)
      const denySet = resolveUnavailable(ctx?.agent)
      const agentName = ctx?.agent
      if (agentName !== undefined && !reportedUnknownAgents.has(agentName)) {
        const unknownSkills = findUnknownUnavailableSkills(
          Array.from(denySet.entries.keys()),
          skills.map((skill) => skill.name),
        )
        if (unknownSkills.length > 0) {
          log("Unknown unavailable_skills entries retained", {
            agent: agentName,
            skills: unknownSkills,
          })
        }
        reportedUnknownAgents.add(agentName)
      }
      if (!hasAgentScopedAvailability) {
        cachedDescription = formatCombinedDescription(visibleSkills.map(loadedSkillToInfo), commands, {
          includeSkills: options.includeSkillsInDescription,
        })
      }

      if (matchedSkill) {
        if (isSkillUnavailable(matchedSkill.name, denySet)) {
          throw new Error(
            `Skill "${matchedSkill.name}" is unavailable for agent "${ctx?.agent ?? "unknown"}" (denylisted via unavailable_skills).`
          )
        }

        await ctx?.ask({
          permission: "skill",
          patterns: [matchedSkill.name],
          always: [matchedSkill.name],
          metadata: {
            skill: matchedSkill.name,
          },
        })

        if (matchedSkill.definition.agent && (!ctx?.agent || getAgentConfigKey(matchedSkill.definition.agent) !== getAgentConfigKey(ctx.agent))) {
          throw new Error(`Skill "${matchedSkill.name}" is restricted to agent "${matchedSkill.definition.agent}"`)
        }

        let body = await extractSkillBody(matchedSkill)

        if (matchedSkill.name === "git-master") {
          body = injectGitMasterConfig(body, options.gitMasterConfig)
        }

        const dir = matchedSkill.path ? dirname(matchedSkill.path) : matchedSkill.resolvedPath || process.cwd()

        const output = [
          `## Skill: ${matchedSkill.name}`,
          "",
          `**Base directory**: ${dir}`,
          "",
          body,
        ]

        if (options.mcpManager && matchedSkill.mcpConfig) {
          const sessionID = ctx?.sessionID || options.getSessionID?.()

          if (!sessionID) {
            return output.join("\n")
          }

          const mcpInfo = await formatMcpCapabilities(
            matchedSkill,
            options.mcpManager,
            sessionID
          )
          if (mcpInfo) {
            output.push(mcpInfo)
          }
        }

        return output.join("\n")
      }

      const matchedCommand = matchCommandByName(commands, requestedName)

      if (matchedCommand) {
        return await formatLoadedCommand(matchedCommand, args.user_message)
      }

      const partialMatches = findPartialMatches(visibleSkills, commands, requestedName)

      if (partialMatches.length > 0) {
        throw new Error(
          `Skill or command "${args.name}" not found. Did you mean: ${partialMatches.join(", ")}?`
        )
      }

      const available = [
        ...visibleSkills.map((skill) => skill.name),
        ...commands.map((command) => `/${command.name}`),
      ].join(", ")
      throw new Error(
        `Skill or command "${args.name}" not found. Available: ${available || "none"}`
      )
    },
  })
}

export const skill: ToolDefinition = createSkillTool({ directory: process.cwd() })
