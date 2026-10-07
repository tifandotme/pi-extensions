import assert from "node:assert/strict"
import { test } from "node:test"
import { formatHandoffSessionName, startHerdrAgentWithRetry } from "./index.ts"

test("prefixes generated handoff names", () => {
  assert.equal(
    formatHandoffSessionName("fix-auth-callback"),
    "[handoff] fix-auth-callback",
  )
  assert.equal(
    formatHandoffSessionName("handoff-session"),
    "[handoff] handoff-session",
  )
})

test("retries Herdr startup while the pane becomes a shell", async () => {
  let attempts = 0

  await startHerdrAgentWithRetry(async () => {
    attempts += 1
    return attempts === 1
      ? {
          code: 1,
          stdout: "",
          stderr: '{"error":{"code":"agent_pane_busy"}}',
        }
      : { code: 0, stdout: "", stderr: "" }
  })

  assert.equal(attempts, 2)
})
