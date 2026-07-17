import type { OhMyOpenCodeConfig } from "../config"
import { getAgentConfigKey } from "../shared/agent-display-names"

export function isAgentCommandAvailable(
  pluginConfig: OhMyOpenCodeConfig,
  agentName: string | undefined,
  command: string,
): boolean {
  if (!agentName) return true

  return !pluginConfig.agents?.[getAgentConfigKey(agentName)]?.unavailable_commands
    ?.some((configuredCommand) => configuredCommand === command)
}
