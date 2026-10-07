import assert from "node:assert/strict"
import { test } from "node:test"
import { parseQuestion } from "./index.ts"

test("parses only non-empty side questions", () => {
  assert.equal(parseQuestion("  what is this?  "), "what is this?")
  assert.equal(parseQuestion("   "), undefined)
})
