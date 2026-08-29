import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, test } from "node:test"

const originalAgentDir = process.env["PI_CODING_AGENT_DIR"]
const agentDir = mkdtempSync(path.join(tmpdir(), "pi-rename-models-"))
process.env["PI_CODING_AGENT_DIR"] = agentDir

const { deleteModelPreference, saveModelPreference } =
  await import("../src/models.ts")

after(() => {
  if (originalAgentDir === undefined) {
    delete process.env["PI_CODING_AGENT_DIR"]
  } else {
    process.env["PI_CODING_AGENT_DIR"] = originalAgentDir
  }
  rmSync(agentDir, { recursive: true, force: true })
})

test("recovers from malformed config when saving and resetting", () => {
  const configPath = path.join(agentDir, "extensions", "pi-rename.json")
  mkdirSync(path.dirname(configPath), { recursive: true })
  writeFileSync(configPath, "{", "utf8")

  assert.doesNotThrow(() =>
    saveModelPreference({ provider: "test-provider", id: "test-model" }),
  )
  assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), {
    model: "test-provider/test-model",
  })

  writeFileSync(configPath, "{", "utf8")
  assert.doesNotThrow(deleteModelPreference)
  assert.equal(existsSync(configPath), false)
})
