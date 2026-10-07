import assert from "node:assert/strict"
import test from "node:test"
import { parseFastConfig, resolveToggleFastShortcut } from "./fast-config.ts"

test("migrates a non-empty legacy model list to global Fast Mode", () => {
  assert.deepEqual(
    parseFastConfig({ models: ["openai-codex/gpt-6-luna"], tpsEnabled: false }),
    { enabled: true, tpsEnabled: false },
  )
})

test("uses the explicit shortcut before the Amp shortcut", () => {
  assert.equal(resolveToggleFastShortcut("opt-r", "ctrl+f").shortcut, "alt+r")
})

test("uses the Amp shortcut, then falls back to Alt+R", () => {
  assert.equal(resolveToggleFastShortcut("", "alt+x").shortcut, "alt+x")
  assert.equal(
    resolveToggleFastShortcut(undefined, undefined).shortcut,
    "alt+r",
  )
})

test("falls back when a configured shortcut is not a single Pi key", () => {
  assert.equal(
    resolveToggleFastShortcut("ctrl+x ctrl+c", undefined).shortcut,
    "alt+r",
  )
})
