import type { SkillScope, LoadedSkill } from "../../features/opencode-skill-loader/types"
import type { SkillMcpManager } from "../../features/skill-mcp-manager"
import type { BrowserAutomationProvider, GitMasterConfig } from "../../config/schema"
import type { CommandInfo } from "../slashcommand/types"

export interface SkillArgs {
  name: string
  user_message?: string
}

export interface SkillInfo {
  name: string
  description: string
  location?: string
  scope: SkillScope
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string[]
}

export interface SkillLoadOptions {
  /** When true, only load from OpenCode paths (.opencode/skills/, ~/.config/opencode/skills/) */
  opencodeOnly?: boolean
  /** Pre-merged skills to use instead of discovering */
  skills?: LoadedSkill[]
  getLoadedSkills?: () => Promise<LoadedSkill[]>
  /** Pre-discovered commands to use instead of discovering */
  commands?: CommandInfo[]
  /** MCP manager for querying skill-embedded MCP servers */
  mcpManager?: SkillMcpManager
  /** Session ID getter for MCP client identification */
  getSessionID?: () => string | undefined
  /** Git master configuration for watermark/co-author settings */
  gitMasterConfig?: GitMasterConfig
  disabledSkills?: Set<string>
  /** Project directory for skill discovery and base directory resolution. Must be ctx.directory from PluginContext — process.cwd() is unsafe in OpenCode. */
  directory: string
  /** Browser automation provider for provider-gated skill filtering */
  browserProvider?: BrowserAutomationProvider
  /** Whether team mode built-in docs should be exposed */
  teamModeEnabled?: boolean
  /** Include Claude marketplace plugin commands in discovery (default: true) */
  pluginsEnabled?: boolean
  /** Override plugin enablement from Claude settings by plugin key */
  enabledPluginsOverride?: Record<string, boolean>
  /** Native skill accessor from PluginInput for discovering skills registered via config.skills.paths */
  nativeSkills?: {
    all(): { name: string; description: string; location: string; content: string }[] | Promise<{ name: string; description: string; location: string; content: string }[]>
    get(name: string): { name: string; description: string; location: string; content: string } | undefined | Promise<{ name: string; description: string; location: string; content: string } | undefined>
    dirs(): string[] | Promise<string[]>
  }
  includeSkillsInDescription?: boolean
  /**
   * Agent-scoped denylist of skill names. Skills whose name (or `shared/<name>`
   * alias) matches an entry here are filtered out of the tool description and
   * rejected at execution time. This is a monotonic Agent denylist and is
   * applied AFTER the existing Skill `agent:` allowlist.
   */
  unavailableSkills?: readonly string[]
  /**
   * Resolver that maps the currently-active agent name (from `ToolContext.agent`)
   * to its `unavailable_skills` denylist. Used when the same `skill` tool is
   * shared across multiple agents and the denylist must be evaluated at call
   * time. Takes precedence over the static `unavailableSkills` field.
   */
  unavailableSkillsResolver?: (agentName: string | undefined) => readonly string[] | undefined
  /** Synchronous agent lookup used when OpenCode reads the shared tool description. */
  getDescriptionAgent?: () => string | undefined
}
