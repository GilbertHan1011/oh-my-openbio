import type { AgentOverrides, OhMyOpenCodeConfig } from "../config";
import { deepMerge, mergeUniqueStrings, mergeUniqueStringsCaseInsensitive } from "@oh-my-opencode/utils";
import { AGENT_DISPLAY_NAMES, getAgentConfigKey } from "../shared/agent-display-names";

/**
 * Agent config keys whose original casing must survive the merge.
 *
 * `OpenCode-Builder` is NOT in `AGENT_DISPLAY_NAMES` (it has no display-name
 * suffix), but it IS an overridable config key in
 * `OverridableAgentNameSchema`. We must not lowercase it to `opencode-builder`
 * because the rest of the pipeline (filterProtectedAgentOverrides,
 * agentConfig["OpenCode-Builder"], pluginConfig.agents?.["OpenCode-Builder"])
 * looks it up by its canonical camel-case form.
 */
const PRESERVED_CASE_AGENT_KEYS: ReadonlySet<string> = new Set([
  "opencode-builder",
  "OpenCode-Builder",
  "OPENCODE-BUILDER",
]);

function getAgentMergeKey(name: string): string {
  if (PRESERVED_CASE_AGENT_KEYS.has(name) || name.toLowerCase() === "opencode-builder") {
    return "OpenCode-Builder"
  }
  const configKey = getAgentConfigKey(name);
  return Object.hasOwn(AGENT_DISPLAY_NAMES, configKey) ? configKey : name.toLowerCase();
}

function mergeAgentOverrides(
  base: AgentOverrides | undefined,
  override: AgentOverrides | undefined,
): AgentOverrides {
  const merged: AgentOverrides = {};
  const canonicalNames = new Set([
    ...Object.keys(base ?? {}).map(getAgentMergeKey),
    ...Object.keys(override ?? {}).map(getAgentMergeKey),
  ]);

  for (const agentName of canonicalNames) {
    const baseEntries = Object.entries(base ?? {})
      .filter(([name]) => getAgentMergeKey(name) === agentName)
      .map(([, entry]) => entry);
    const overrideEntries = Object.entries(override ?? {})
      .filter(([name]) => getAgentMergeKey(name) === agentName)
      .map(([, entry]) => entry);
    const baseEntry = baseEntries.reduce<AgentOverrides[string] | undefined>(
      (current, entry) => deepMerge(current, entry),
      undefined,
    );
    const overrideEntry = overrideEntries.reduce<AgentOverrides[string] | undefined>(
      (current, entry) => deepMerge(current, entry),
      undefined,
    );
    const entry = deepMerge(baseEntry, overrideEntry);
    if (entry === undefined) continue;

    const unavailableSkills = [...baseEntries, ...overrideEntries]
      .map((item) => item?.unavailable_skills)
      .reduce<string[]>((skills, entrySkills) => mergeUniqueStrings(skills, entrySkills), []);
    merged[agentName] = unavailableSkills.length > 0
      ? { ...entry, unavailable_skills: unavailableSkills }
      : entry;
  }

  return merged;
}

export function mergeConfigs(
  base: OhMyOpenCodeConfig,
  override: Partial<OhMyOpenCodeConfig>
): OhMyOpenCodeConfig {
  return {
    ...base,
    ...override,
    agents: mergeAgentOverrides(base.agents, override.agents),
    categories: deepMerge(base.categories, override.categories),
    team_mode: deepMerge(base.team_mode, override.team_mode),
    agent_definitions: mergeUniqueStrings(base.agent_definitions, override.agent_definitions),
    disabled_agents: mergeUniqueStrings(base.disabled_agents, override.disabled_agents),
    disabled_mcps: mergeUniqueStrings(base.disabled_mcps, override.disabled_mcps),
    disabled_hooks: mergeUniqueStrings(base.disabled_hooks, override.disabled_hooks),
    disabled_commands: mergeUniqueStrings(base.disabled_commands, override.disabled_commands),
    disabled_skills: mergeUniqueStrings(base.disabled_skills, override.disabled_skills),
    disabled_tools: mergeUniqueStrings(base.disabled_tools, override.disabled_tools),
    disabled_providers: mergeUniqueStringsCaseInsensitive(base.disabled_providers, override.disabled_providers),
    mcp_env_allowlist: override.mcp_env_allowlist ?? base.mcp_env_allowlist,
    claude_code: deepMerge(base.claude_code, override.claude_code),
  };
}
