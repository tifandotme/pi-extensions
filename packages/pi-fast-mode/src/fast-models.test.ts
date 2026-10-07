import assert from "node:assert/strict"
import test from "node:test"
import { isOpenAIProvider } from "./fast-models.ts"

test("limits Fast Mode requests to OpenAI providers", () => {
  assert.equal(isOpenAIProvider("openai"), true)
  assert.equal(isOpenAIProvider("openai-codex"), true)
  assert.equal(isOpenAIProvider("other"), false)
})
