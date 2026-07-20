/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const workflowPath = new URL("../.github/workflows/publish-openbio.yml", import.meta.url)

describe("publish-openbio workflow", () => {
  test("publishes only the openbio wrapper package from the owner fork", () => {
    const workflow = readFileSync(workflowPath, "utf8")

    expect(workflow).toContain("name: publish-openbio")
    expect(workflow).toContain("version:")
    expect(workflow).toContain("dist_tag:")
    expect(workflow).toContain("github.repository == 'GilbertHan1011/oh-my-openbio'")
    expect(workflow).toContain('"https://registry.npmjs.org/oh-my-openbio/${VERSION}"')
    expect(workflow).toContain('.name = "oh-my-openbio" | .version = $VERSION')
    expect(workflow).toContain("npm publish --ignore-scripts --access public --provenance")
    expect(workflow).toContain('npm view "oh-my-openbio@${VERSION}" version')
    expect(workflow).not.toContain('"oh-my-opencode" |')
    expect(workflow).not.toContain('"oh-my-openagent" |')
  })
})
