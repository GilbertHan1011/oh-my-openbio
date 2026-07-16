import type { AgentConfig } from "@opencode-ai/sdk"
import type { BrowserAutomationProvider, GitMasterConfig } from "../config/schema"
import { resolveMultipleSkills, resolveMultipleSkillsAsync } from "../features/opencode-skill-loader/skill-content"
import { getAllSkills } from "../features/opencode-skill-loader/skill-discovery"
import { matchSkillByName } from "../tools/skill/skill-matcher"
import type { AgentConfigWithSkillPolicy } from "./types"
import { buildAgentUnavailableSet, isSkillUnavailable } from "./agent-skill-availability"
import type { AvailableSkill } from "./dynamic-agent-prompt-builder"
import { getAgentConfigKey } from "../shared/agent-display-names"

export function resolveAgentSkills(
  config: AgentConfig,
  options: {
    gitMasterConfig?: GitMasterConfig
    browserProvider?: BrowserAutomationProvider
    disabledSkills?: Set<string>
    teamModeEnabled?: boolean
    unavailableSkills?: readonly string[]
    agentName?: string
    availableSkills?: readonly AvailableSkill[]
  } = {}
): AgentConfig {
  const { skills, unavailable_skills: _unavailableSkills, ...configWithoutSkills } = config as AgentConfigWithSkillPolicy
  if (!skills?.length) return configWithoutSkills

  const unavailableSet = buildAgentUnavailableSet(
    options.unavailableSkills ?? (config as AgentConfigWithSkillPolicy).unavailable_skills
  )
  validateStaticSkillAgentRestrictions(skills, options.agentName, options.availableSkills)
  const conflictingSkills = skills.filter((skill) => isSkillUnavailable(skill, unavailableSet))
  if (conflictingSkills.length > 0) {
    throw new Error(
      `Agent static skills conflict with unavailable_skills: ${conflictingSkills.join(", ")}`
    )
  }

  const { resolved } = resolveMultipleSkills([...skills], options)
  if (resolved.size === 0) return configWithoutSkills

  const skillContent = Array.from(resolved.values()).join("\n\n")
  return {
    ...configWithoutSkills,
    prompt: skillContent + (configWithoutSkills.prompt ? "\n\n" + configWithoutSkills.prompt : ""),
  }
}

export async function resolveAgentSkillsAsync(
  config: AgentConfig,
  options: {
    gitMasterConfig?: GitMasterConfig
    browserProvider?: BrowserAutomationProvider
    disabledSkills?: Set<string>
    teamModeEnabled?: boolean
    unavailableSkills?: readonly string[]
    directory?: string
    agentName?: string
  } = {}
): Promise<AgentConfig> {
  const { skills, unavailable_skills: _unavailableSkills, ...configWithoutSkills } = config as AgentConfigWithSkillPolicy
  if (!skills?.length) return configWithoutSkills

  const unavailableSet = buildAgentUnavailableSet(
    options.unavailableSkills ?? (config as AgentConfigWithSkillPolicy).unavailable_skills
  )
  if (options.agentName) {
    const availableSkills = await getAllSkills(options)
    for (const skillName of skills) {
      const matched = matchSkillByName(availableSkills, skillName)
      if (matched?.definition.agent && getAgentConfigKey(matched.definition.agent) !== getAgentConfigKey(options.agentName)) {
        throw new Error(`Agent static skill "${skillName}" is restricted to agent "${matched.definition.agent}"`)
      }
    }
  }
  const conflictingSkills = skills.filter((skill) => isSkillUnavailable(skill, unavailableSet))
  if (conflictingSkills.length > 0) {
    throw new Error(
      `Agent static skills conflict with unavailable_skills: ${conflictingSkills.join(", ")}`
    )
  }

  const { resolved, notFound } = await resolveMultipleSkillsAsync([...skills], options)
  if (notFound.length > 0) {
    throw new Error(`Agent static skills not found: ${notFound.join(", ")}`)
  }

  const skillContent = Array.from(resolved.values()).join("\n\n")
  return {
    ...configWithoutSkills,
    prompt: skillContent + (configWithoutSkills.prompt ? "\n\n" + configWithoutSkills.prompt : ""),
  }
}

function validateStaticSkillAgentRestrictions(
  skills: readonly string[],
  agentName: string | undefined,
  availableSkills: readonly AvailableSkill[] | undefined,
): void {
  if (!agentName || !availableSkills) return
  const normalizedAgent = getAgentConfigKey(agentName)
  for (const skillName of skills) {
    const matched = availableSkills.find((skill) => skill.name.toLowerCase() === skillName.toLowerCase())
    if (matched?.agent && getAgentConfigKey(matched.agent) !== normalizedAgent) {
      throw new Error(`Agent static skill "${skillName}" is restricted to agent "${matched.agent}"`)
    }
  }
}
