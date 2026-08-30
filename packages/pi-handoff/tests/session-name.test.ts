import assert from "node:assert/strict"
import { test } from "node:test"
import { formatHandoffSessionName } from "../src/index.ts"

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
