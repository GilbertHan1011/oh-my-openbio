import type { AvailableSkill } from "../dynamic-agent-prompt-builder"
import type { BrowserAutomationProvider } from "../../config/schema"
import type { LoadedSkill, SkillScope } from "../../features/opencode-skill-loader/types"
import { isDisabledSkillAlias, normalizeSkillAliasName } from "../../features/opencode-skill-loader"
import { createBuiltinSkills } from "../../features/builtin-skills"
import {
  buildAgentUnavailableSet,
  findUnknownUnavailableSkills,
  isSkillAllowedByAgentRestriction,
  isSkillUnavailable,
} from "../agent-skill-availability"
import { log } from "../../shared/logger"

const SHARED_SKILL_PREFIX = "shared/"

function mapScopeToLocation(scope: SkillScope): AvailableSkill["location"] {
  if (scope === "user" || scope === "opencode") return "user"
  if (scope === "project" || scope === "opencode-project") return "project"
  return "plugin"
}

function buildProtectedSharedAliasNames(skills: LoadedSkill[]): Set<string> {
  const protectedNames = new Set<string>()

  for (const skill of skills) {
    if (skill.scope !== "shared") continue

    const normalizedName = normalizeSkillAliasName(skill.name)
    if (normalizedName.startsWith(SHARED_SKILL_PREFIX)) {
      protectedNames.add(normalizedName)
      continue
    }

    protectedNames.add(`${SHARED_SKILL_PREFIX}${normalizedName}`)
  }

  return protectedNames
}

function collidesWithProtectedSharedAlias(
  skill: LoadedSkill,
  protectedSharedAliasNames: ReadonlySet<string>,
): boolean {
  if (skill.scope === "shared") return false
  return protectedSharedAliasNames.has(normalizeSkillAliasName(skill.name))
}

export function buildAvailableSkills(
  discoveredSkills: LoadedSkill[],
  browserProvider?: BrowserAutomationProvider,
  disabledSkills?: Set<string>,
  teamModeEnabled?: boolean,
  agentName?: string,
  unavailableSkills?: readonly string[],
): AvailableSkill[] {
  const builtinSkills = createBuiltinSkills({ browserProvider, disabledSkills, teamModeEnabled })
  const builtinSkillNames = new Set(builtinSkills.map(s => s.name))
  const protectedSharedAliasNames = buildProtectedSharedAliasNames(discoveredSkills)
  const agentUnavailableSet = buildAgentUnavailableSet(unavailableSkills)
  const unknownUnavailableSkills = findUnknownUnavailableSkills(
    unavailableSkills,
    [...builtinSkills.map((skill) => skill.name), ...discoveredSkills.map((skill) => skill.name)],
  )
  if (unknownUnavailableSkills.length > 0) {
    log("Unknown unavailable_skills entries retained", {
      agentName: agentName ?? "unknown",
      skillNames: unknownUnavailableSkills,
    })
  }

  const builtinAvailable: AvailableSkill[] = builtinSkills
    .filter((skill) => !isSkillUnavailable(skill.name, agentUnavailableSet))
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      location: "plugin" as const,
    }))

  const discoveredAvailable: AvailableSkill[] = discoveredSkills
    .filter(s => {
      if (disabledSkills && isDisabledSkillAlias(s, disabledSkills)) return false
      if (collidesWithProtectedSharedAlias(s, protectedSharedAliasNames)) return false
      // Agent denylist (unavailable_skills) — evaluated AFTER the existing
      // agent: allowlist so a skill that explicitly targets this agent
      // cannot bypass a deliberate denylist.
      if (isSkillUnavailable(s.name, agentUnavailableSet)) return false
      // If the skill declares an agent restriction and we know the current agent,
      // exclude skills that don't belong to this agent.
      if (agentName && !isSkillAllowedByAgentRestriction(s.definition.agent, agentName)) return false
      return true
    })
    .map((skill) => ({
      name: skill.name,
      description: skill.definition.description ?? "",
      location: mapScopeToLocation(skill.scope),
      ...(skill.definition.agent ? { agent: skill.definition.agent } : {}),
    }))

  const skillMap = new Map<string, AvailableSkill>()
  builtinAvailable.forEach(skill => skillMap.set(skill.name, skill))
  discoveredAvailable.forEach(skill => skillMap.set(skill.name, skill))
  return Array.from(skillMap.values())
}
