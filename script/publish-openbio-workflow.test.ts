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
    expect(workflow).toContain("bootstrap:")
    expect(workflow).toContain('description: "Use NPM_TOKEN only to bootstrap the first beta publication"')
    expect(workflow).toContain("github.repository == 'GilbertHan1011/oh-my-openbio'")
    expect(workflow).toContain('"https://registry.npmjs.org/oh-my-openbio/${VERSION}"')
    expect(workflow).toContain('.name = "oh-my-openbio"')
    expect(workflow).toContain('| .version = $version')
    expect(workflow).toContain('git+https://github.com/GilbertHan1011/oh-my-openbio.git')
    expect(workflow).toContain('https://github.com/GilbertHan1011/oh-my-openbio/issues')
    expect(workflow).toContain('https://github.com/GilbertHan1011/oh-my-openbio#readme')
    expect(workflow).toContain('npm install -g npm@11.18.0')
    expect(workflow).toContain('if: inputs.bootstrap != true')
    expect(workflow).toContain('if: inputs.bootstrap == true')
    expect(workflow).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}')
    expect(workflow).toContain('Bootstrap publishing is limited to beta prereleases.')
    expect(workflow).toContain('for attempt in {1..6}')
    expect(workflow).toContain('run: bun test bin/platform.test.ts script/publish-openbio-workflow.test.ts')
    expect(workflow).toContain("npm publish --ignore-scripts --access public --provenance")
    expect(workflow).toContain('npm view "oh-my-openbio@${VERSION}" version')
    expect(workflow).not.toContain('"oh-my-opencode" |')
    expect(workflow).toContain('permissions:\n  contents: read\n\njobs:')
    expect(workflow).not.toContain('permissions:\n  contents: read\n  id-token: write')
    expect(workflow).toContain('publish:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      id-token: write')
    expect(workflow).not.toContain('"oh-my-openagent" |')
  })
})
