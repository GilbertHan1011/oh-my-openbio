import { normalizeSkillAliasName } from "../features/opencode-skill-loader"

const SHARED_SKILL_PREFIX = "shared/"

export const DEFAULT_AGENT_UNAVAILABLE_SKILLS: Readonly<Record<string, readonly string[]>> = {
  hermes: ["data-analysis-workflow", "planning-with-files"],
}

export function resolveAgentUnavailableSkills(
  agentName: string,
  configured: readonly string[] | undefined,
): readonly string[] {
  return Array.from(new Set([
    ...(DEFAULT_AGENT_UNAVAILABLE_SKILLS[normalizeSkillAliasName(agentName)] ?? []),
    ...(configured ?? []),
  ]))
}

/**
 * A resolved unavailable-skill entry: normalized to lowercase canonical form.
 * Retains the original input string for diagnostic purposes.
 */
export interface UnavailableSkillEntry {
  /** Lowercase canonical name, e.g. "data-analysis-workflow" */
  readonly canonical: string
  /** The original input string the user configured */
  readonly original: string
}

/**
 * Effective deny set for a specific agent, pre-normalized for fast O(1) lookup.
 * Built from agent-level unavailable_skills.
 * Does NOT include Skill frontmatter `agent:` allowlist checks — those are
 * applied separately in the per-skill filter.
 */
export interface AgentUnavailableSet {
  /** Lowercase canonical name → original input */
  readonly entries: ReadonlyMap<string, UnavailableSkillEntry>
}

/**
 * Build an AgentUnavailableSet from raw config strings.
 * Strings are normalized via normalizeSkillAliasName (lowercases, preserves shared/ prefix).
 * Unknown names are retained with a warning — they may be discovered later.
 *
 * @param unavailableSkills - raw string[] from agents.<agent>.unavailable_skills
 */
export function buildAgentUnavailableSet(
  unavailableSkills: readonly string[] | undefined,
): AgentUnavailableSet {
  const entries = new Map<string, UnavailableSkillEntry>()

  if (unavailableSkills) {
    for (const original of unavailableSkills) {
      if (typeof original !== "string" || original.trim() === "") continue
      const canonical = normalizeSkillAliasName(original)
      if (!entries.has(canonical)) {
        entries.set(canonical, { canonical, original })
      }
    }
  }

  return { entries }
}

/**
 * Merge multiple AgentUnavailableSets (e.g. global disabled + agent-level unavailable).
 * Result is the union — monotonic: once a skill is denied it stays denied.
 *
 * @param sets - ordered from lowest to highest priority (union = all entries)
 */
export function mergeUnavailableSets(...sets: (AgentUnavailableSet | undefined)[]): AgentUnavailableSet {
  const merged = new Map<string, UnavailableSkillEntry>()
  for (const set of sets) {
    if (!set) continue
    for (const [canonical, entry] of set.entries) {
      if (!merged.has(canonical)) {
        merged.set(canonical, entry)
      }
    }
  }
  return { entries: merged }
}

/**
 * Normalize a skill name to its canonical form for availability checks.
 * Handles: case folding, shared/ prefix variants.
 *
 * @param name - skill name as configured or referenced
 * @returns normalized lowercase name without shared/ prefix
 */
export function normalizeSkillAvailabilityName(name: string): string {
  const normalized = normalizeSkillAliasName(name)
  // Strip shared/ prefix for the canonical bare name
  if (normalized.startsWith(SHARED_SKILL_PREFIX)) {
    return normalized.slice(SHARED_SKILL_PREFIX.length)
  }
  return normalized
}

/**
 * Check whether a skill is in the unavailable deny set.
 * Handles the shared/ prefix bidirectional check:
 * - "data-analysis-workflow" is denied if "data-analysis-workflow" OR "shared/data-analysis-workflow" is in deny set
 * - "shared/data-analysis-workflow" is denied if either form is in deny set
 *
 * @param skillName - skill name as loaded from skill definition
 * @param unavailableSet - effective deny set for the target agent
 */
export function isSkillUnavailable(
  skillName: string,
  unavailableSet: AgentUnavailableSet,
): boolean {
  const normalized = normalizeSkillAvailabilityName(skillName)
  if (unavailableSet.entries.has(normalized)) return true

  // Also check shared/ prefix form
  const withShared = `${SHARED_SKILL_PREFIX}${normalized}`
  if (unavailableSet.entries.has(withShared)) return true

  return false
}

export function findUnknownUnavailableSkills(
  unavailableSkills: readonly string[] | undefined,
  knownSkillNames: Iterable<string>,
): string[] {
  const knownSet = buildAgentUnavailableSet(Array.from(knownSkillNames))
  return (unavailableSkills ?? []).filter((skillName) => !isSkillUnavailable(skillName, knownSet))
}

/**
 * Check whether a skill's frontmatter `agent:` allowlist permits a given agent.
 * A skill with no agent restriction is always permitted by this check.
 *
 * @param skillAgent - value of skill definition's `agent:` frontmatter field
 * @param targetAgent - agent name requesting the skill
 */
export function isSkillAllowedByAgentRestriction(
  skillAgent: string | undefined,
  targetAgent: string,
): boolean {
  if (!skillAgent) return true
  return normalizeSkillAliasName(skillAgent) === normalizeSkillAliasName(targetAgent)
}

/**
 * Compute the effective availability of a skill for a target agent.
 * Precedence: Skill frontmatter `agent:` allowlist wins over unavailable_skills.
 * (If a skill declares `agent: ariadne`, it is available ONLY to ariadne —
 *  even if hermes marks it unavailable, hermes was never allowed to see it anyway.
 *  Conversely, ariadne can use it; hermes is filtered by the allowlist before
 *  the unavailable check is reached.)
 *
 * @param skillName - skill name as loaded from skill definition
 * @param skillAgent - value of skill definition's `agent:` frontmatter field (undefined = no restriction)
 * @param targetAgent - agent name requesting the skill
 * @param unavailableSet - effective deny set for the target agent
 */
export function isSkillEffectivelyAvailable(
  skillName: string,
  skillAgent: string | undefined,
  targetAgent: string,
  unavailableSet: AgentUnavailableSet,
): boolean {
  // Frontmatter agent allowlist: wins first
  if (!isSkillAllowedByAgentRestriction(skillAgent, targetAgent)) return false

  // Agent-level unavailable set
  if (isSkillUnavailable(skillName, unavailableSet)) return false

  return true
}
