/// <reference types="bun-types" />
import { describe, expect, it } from "bun:test"
import {
  buildAgentUnavailableSet,
  findUnknownUnavailableSkills,
  resolveAgentUnavailableSkills,
  mergeUnavailableSets,
  normalizeSkillAvailabilityName,
  isSkillUnavailable,
  isSkillAllowedByAgentRestriction,
  isSkillEffectivelyAvailable,
} from "./agent-skill-availability"

describe("findUnknownUnavailableSkills", () => {
  it("#given aliases and an unknown name #when compared with known skills #then retains only the unknown entry", () => {
    expect(findUnknownUnavailableSkills(
      ["shared/Data-Analysis-Workflow", "future-skill"],
      ["data-analysis-workflow"],
    )).toEqual(["future-skill"])
  })
})

describe("resolveAgentUnavailableSkills", () => {
  it("#given Hermes defaults and configured entries #when resolved #then unions both monotonically", () => {
    expect(resolveAgentUnavailableSkills("Hermes", ["custom-skill"])).toEqual([
      "data-analysis-workflow",
      "planning-with-files",
      "custom-skill",
    ])
  })
})

describe("normalizeSkillAvailabilityName", () => {
  it("#given a bare lowercase name #when normalized #then returns as-is", () => {
    expect(normalizeSkillAvailabilityName("data-analysis-workflow")).toBe("data-analysis-workflow")
  })

  it("#given a mixed-case name #when normalized #then lowercases", () => {
    expect(normalizeSkillAvailabilityName("Data-Analysis-Workflow")).toBe("data-analysis-workflow")
  })

  it("#given a shared/ prefixed name #when normalized #then strips the prefix", () => {
    expect(normalizeSkillAvailabilityName("shared/data-analysis-workflow")).toBe("data-analysis-workflow")
  })

  it("#given a SHARED/ uppercase prefix #when normalized #then strips prefix and lowercases", () => {
    expect(normalizeSkillAvailabilityName("SHARED/DATA-ANALYSIS-WORKFLOW")).toBe("data-analysis-workflow")
  })

  it("#given a shared/ prefix with bare name #when normalized #then strips prefix", () => {
    expect(normalizeSkillAvailabilityName("shared/planning-with-files")).toBe("planning-with-files")
  })
})

describe("buildAgentUnavailableSet", () => {
  it("#given undefined #when built #then returns empty entries", () => {
    const set = buildAgentUnavailableSet(undefined)
    expect(set.entries.size).toBe(0)
  })

  it("#given an empty array #when built #then returns empty entries", () => {
    const set = buildAgentUnavailableSet([])
    expect(set.entries.size).toBe(0)
  })

  it("#given a single skill name #when built #then stores canonical form", () => {
    const set = buildAgentUnavailableSet(["data-analysis-workflow"])
    expect(set.entries.has("data-analysis-workflow")).toBe(true)
    expect(set.entries.get("data-analysis-workflow")?.original).toBe("data-analysis-workflow")
  })

  it("#given a mixed-case name #when built #then lowercases to canonical", () => {
    const set = buildAgentUnavailableSet(["Data-Analysis-Workflow"])
    expect(set.entries.has("data-analysis-workflow")).toBe(true)
    expect(set.entries.get("data-analysis-workflow")?.original).toBe("Data-Analysis-Workflow")
  })

  it("#given a shared/ prefixed name #when built #then stores canonical with prefix", () => {
    const set = buildAgentUnavailableSet(["shared/data-analysis-workflow"])
    expect(set.entries.has("shared/data-analysis-workflow")).toBe(true)
    expect(set.entries.get("shared/data-analysis-workflow")?.original).toBe("shared/data-analysis-workflow")
  })

  it("#given the same name twice (different case) #when built #then keeps first entry", () => {
    const set = buildAgentUnavailableSet(["data-analysis-workflow", "Data-Analysis-Workflow"])
    expect(set.entries.size).toBe(1)
    expect(set.entries.get("data-analysis-workflow")?.original).toBe("data-analysis-workflow")
  })

  it("#given empty string entries #when built #then skips them", () => {
    const set = buildAgentUnavailableSet(["data-analysis-workflow", "", "  ", "planning-with-files"])
    expect(set.entries.size).toBe(2)
    expect(set.entries.has("data-analysis-workflow")).toBe(true)
    expect(set.entries.has("planning-with-files")).toBe(true)
  })
})

describe("mergeUnavailableSets", () => {
  it("#given two empty sets #when merged #then returns empty", () => {
    const result = mergeUnavailableSets(
      buildAgentUnavailableSet(undefined),
      buildAgentUnavailableSet(undefined),
    )
    expect(result.entries.size).toBe(0)
  })

  it("#given two disjoint sets #when merged #then union contains both", () => {
    const a = buildAgentUnavailableSet(["skill-a"])
    const b = buildAgentUnavailableSet(["skill-b"])
    const result = mergeUnavailableSets(a, b)
    expect(result.entries.size).toBe(2)
    expect(result.entries.has("skill-a")).toBe(true)
    expect(result.entries.has("skill-b")).toBe(true)
  })

  it("#given overlapping sets #when merged #then union deduplicates", () => {
    const a = buildAgentUnavailableSet(["skill-a", "shared/skill-b"])
    const b = buildAgentUnavailableSet(["skill-a", "skill-c"])
    const result = mergeUnavailableSets(a, b)
    expect(result.entries.size).toBe(3)
    expect(result.entries.has("skill-a")).toBe(true)
    expect(result.entries.has("shared/skill-b")).toBe(true)
    expect(result.entries.has("skill-c")).toBe(true)
  })

  it("#given undefined sets #when merged #then ignores them", () => {
    const a = buildAgentUnavailableSet(["skill-a"])
    const result = mergeUnavailableSets(a, undefined, buildAgentUnavailableSet(["skill-b"]))
    expect(result.entries.size).toBe(2)
  })
})

describe("isSkillUnavailable", () => {
  const denySet = buildAgentUnavailableSet(["data-analysis-workflow", "SHARED/planning-with-files"])

  it("#given a denied bare name #when checked #then returns true", () => {
    expect(isSkillUnavailable("data-analysis-workflow", denySet)).toBe(true)
  })

  it("#given a denied name in different case #when checked #then returns true", () => {
    expect(isSkillUnavailable("DATA-ANALYSIS-WORKFLOW", denySet)).toBe(true)
  })

  it("#given a denied shared/ prefix form #when checked #then returns true", () => {
    expect(isSkillUnavailable("shared/planning-with-files", denySet)).toBe(true)
  })

  it("#given a bare name whose shared/ form is denied #when checked #then returns true", () => {
    expect(isSkillUnavailable("planning-with-files", denySet)).toBe(true)
  })

  it("#given an allowed name #when checked #then returns false", () => {
    expect(isSkillUnavailable("not-denied", denySet)).toBe(false)
  })

  it("#given an empty deny set #when checked #then returns false for any name", () => {
    const empty = buildAgentUnavailableSet(undefined)
    expect(isSkillUnavailable("any-skill", empty)).toBe(false)
  })
})

describe("isSkillAllowedByAgentRestriction", () => {
  it("#given no agent restriction (undefined) #when checked for any agent #then returns true", () => {
    expect(isSkillAllowedByAgentRestriction(undefined, "hermes")).toBe(true)
    expect(isSkillAllowedByAgentRestriction(undefined, "ariadne")).toBe(true)
  })

  it("#given agent restriction matching target #when checked #then returns true", () => {
    expect(isSkillAllowedByAgentRestriction("ariadne", "ariadne")).toBe(true)
  })

  it("#given agent restriction matching target in different case #when checked #then returns true", () => {
    expect(isSkillAllowedByAgentRestriction("Ariadne", "ariadne")).toBe(true)
    expect(isSkillAllowedByAgentRestriction("HERMES", "hermes")).toBe(true)
  })

  it("#given agent restriction not matching target #when checked #then returns false", () => {
    expect(isSkillAllowedByAgentRestriction("ariadne", "hermes")).toBe(false)
    expect(isSkillAllowedByAgentRestriction("hermes", "ariadne")).toBe(false)
  })
})

describe("isSkillEffectivelyAvailable", () => {
  const ariadneDenied = buildAgentUnavailableSet(["data-analysis-workflow", "planning-with-files"])
  const hermesDenied = buildAgentUnavailableSet([]) // hermes has no unavailable_skills

  it("#given a skill with no restriction and hermes has empty denylist #when checked #then returns true", () => {
    expect(isSkillEffectivelyAvailable("any-skill", undefined, "hermes", hermesDenied)).toBe(true)
  })

  it("#given a skill with no restriction and ariadne denies it #when checked #then returns false", () => {
    expect(isSkillEffectivelyAvailable("data-analysis-workflow", undefined, "ariadne", ariadneDenied)).toBe(false)
  })

  it("#given a skill restricted to ariadne and hermes checks it #when checked #then returns false (allowlist wins)", () => {
    expect(isSkillEffectivelyAvailable("restricted-skill", "ariadne", "hermes", hermesDenied)).toBe(false)
  })

  it("#given a skill restricted to ariadne and ariadne checks it #when checked #then returns true (in allowlist)", () => {
    expect(isSkillEffectivelyAvailable("restricted-skill", "ariadne", "ariadne", ariadneDenied)).toBe(true)
  })

  it("#given a skill restricted to ariadne and ariadne has it in deny set #when checked #then returns false (deny wins)", () => {
    const denySet = buildAgentUnavailableSet(["restricted-skill"])
    expect(isSkillEffectivelyAvailable("restricted-skill", "ariadne", "ariadne", denySet)).toBe(false)
  })

  it("#given a public skill (no agent restriction) and hermes checks it #when checked #then returns true", () => {
    expect(isSkillEffectivelyAvailable("playwright", undefined, "hermes", hermesDenied)).toBe(true)
  })

  it("#given a shared/ prefix deny entry and bare name is checked #when checked #then returns false", () => {
    expect(isSkillEffectivelyAvailable("data-analysis-workflow", undefined, "ariadne", ariadneDenied)).toBe(false)
  })
})

describe("global disabled + agent unavailable precedence", () => {
  it("#given global disabled and agent unavailable both include the same skill #then merged set contains it once", () => {
    const globalDisabled = buildAgentUnavailableSet(["playwright"])
    const agentUnavailable = buildAgentUnavailableSet(["playwright", "restricted-skill"])
    const merged = mergeUnavailableSets(globalDisabled, agentUnavailable)
    expect(merged.entries.size).toBe(2)
    expect(merged.entries.has("playwright")).toBe(true)
    expect(merged.entries.has("restricted-skill")).toBe(true)
  })

  it("#given skill restricted to one agent and another agent's denylist includes it #then allowlist blocks first", () => {
    const hermesSet = buildAgentUnavailableSet(["oracle-only-skill"])
    expect(isSkillEffectivelyAvailable("oracle-only-skill", "sisyphus", "hermes", hermesSet)).toBe(false)
  })

  it("#given skill with no restriction and global disabled includes it #then agent cannot use it regardless of denylist", () => {
    const globalDisabled = buildAgentUnavailableSet(["playwright"])
    expect(isSkillUnavailable("playwright", globalDisabled)).toBe(true)
  })
})
