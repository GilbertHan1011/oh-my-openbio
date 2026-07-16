/// <reference types="bun-types" />
import { describe, expect, it } from "bun:test"
import { ARIADNE_PROMPT_METADATA, createAriadneAgent } from "./ariadne"
import { HERMES_PROMPT_METADATA, createHermesAgent } from "./hermes"
import { AGENT_MODEL_REQUIREMENTS } from "@oh-my-opencode/model-core"
import { resolveMultipleSkillsAsync } from "../features/opencode-skill-loader/skill-content"
import { resolveAgentSkills, resolveAgentSkillsAsync } from "./agent-skill-resolution"

describe("createAriadneAgent", () => {
  it("#given any model #when created #then returns primary mode config", () => {
    // given
    const model = "anthropic/claude-sonnet-4-6"

    // when
    const config = createAriadneAgent(model)

    // then
    expect(config.mode).toBe("primary")
    expect(config.model).toBe(model)
    expect(config.description).toContain("Ariadne")
    expect(config.description).toContain("data-analysis")
    expect(config.color).toBe("#2563EB")
    expect(config.temperature).toBe(0.1)
  })

  it("#given the default policy #when created #then autoloads both workflow skills", () => {
    // when
    const config = createAriadneAgent("anthropic/claude-sonnet-4-6")

    // then
    expect(config.skills).toEqual(["data-analysis-workflow", "planning-with-files"])
  })

  it("#given packaged shared workflows #when static skills resolve #then injects both and strips policy metadata", async () => {
    // given
    const config = createAriadneAgent("anthropic/claude-sonnet-4-6")
    const skillNames = [...(config.skills ?? [])]
    const expected = await resolveMultipleSkillsAsync(skillNames)

    // when
    const resolved = await resolveAgentSkillsAsync(config)

    // then
    expect(expected.notFound).toEqual([])
    expect(expected.resolved.size).toBe(2)
    expect("skills" in resolved).toBe(false)
    expect("unavailable_skills" in resolved).toBe(false)
    expect(resolved.prompt).toBe(
      `${Array.from(expected.resolved.values()).join("\n\n")}\n\n${config.prompt}`,
    )
  })

  it("exposes a static mode property for pre-instantiation access", () => {
    // when / then
    expect(createAriadneAgent.mode).toBe("primary")
  })

  it("exposes prompt metadata used by Sisyphus prompt sections", () => {
    // then
    expect(ARIADNE_PROMPT_METADATA.category).toBe("specialist")
    expect(ARIADNE_PROMPT_METADATA.promptAlias).toBe("Ariadne")
    expect(ARIADNE_PROMPT_METADATA.cost).toBeDefined()
    expect(ARIADNE_PROMPT_METADATA.triggers.length).toBeGreaterThan(0)
  })
})

describe("createHermesAgent", () => {
  it("#given any model #when created #then returns primary mode config", () => {
    // given
    const model = "openai/gpt-5.4-mini-fast"

    // when
    const config = createHermesAgent(model)

    // then
    expect(config.mode).toBe("primary")
    expect(config.model).toBe(model)
    expect(config.description).toContain("Hermes")
    expect(config.description).toContain("general-purpose")
    expect(config.color).toBe("#F59E0B")
    expect(config.temperature).toBe(0.1)
  })

  it("#given the default policy #when created #then denies both workflow skills", () => {
    // when
    const config = createHermesAgent("openai/gpt-5.4-mini-fast")

    // then
    expect(config.unavailable_skills).toEqual([
      "data-analysis-workflow",
      "planning-with-files",
    ])
  })

  it("exposes a static mode property for pre-instantiation access", () => {
    // when / then
    expect(createHermesAgent.mode).toBe("primary")
  })

  it("exposes prompt metadata used by Sisyphus prompt sections", () => {
    // then
    expect(HERMES_PROMPT_METADATA.category).toBe("specialist")
    expect(HERMES_PROMPT_METADATA.promptAlias).toBe("Hermes")
    expect(HERMES_PROMPT_METADATA.cost).toBeDefined()
    expect(HERMES_PROMPT_METADATA.triggers.length).toBeGreaterThan(0)
  })
})

describe("Agent model requirements registry", () => {
  it("includes ariadne and hermes fallback chains", () => {
    // then
    expect(AGENT_MODEL_REQUIREMENTS["ariadne"]).toBeDefined()
    expect(AGENT_MODEL_REQUIREMENTS["ariadne"].fallbackChain.length).toBeGreaterThan(0)
    expect(AGENT_MODEL_REQUIREMENTS["hermes"]).toBeDefined()
    expect(AGENT_MODEL_REQUIREMENTS["hermes"].fallbackChain.length).toBeGreaterThan(0)
  })

  it("includes existing agents without modification", () => {
    // then: existing 11 agents still present
    expect(AGENT_MODEL_REQUIREMENTS["sisyphus"]).toBeDefined()
    expect(AGENT_MODEL_REQUIREMENTS["hephaestus"]).toBeDefined()
    expect(AGENT_MODEL_REQUIREMENTS["oracle"]).toBeDefined()
    expect(AGENT_MODEL_REQUIREMENTS["atlas"]).toBeDefined()
    expect(AGENT_MODEL_REQUIREMENTS["sisyphus-junior"]).toBeDefined()
  })
})

describe("resolveAgentSkills", () => {
  it("#given a static skill denied by the same agent #when resolved #then fails actionably", () => {
    const config = createHermesAgent("openai/gpt-5.4-mini-fast")
    config.skills = ["data-analysis-workflow"]

    expect(() => resolveAgentSkills(config)).toThrow(
      "Agent static skills conflict with unavailable_skills: data-analysis-workflow",
    )
  })
})
