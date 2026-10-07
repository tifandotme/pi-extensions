import assert from "node:assert/strict"
import test from "node:test"
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui"
import {
  formatModelBorderLabel,
  overlayBorderLabel,
  overlayBorderLabels,
} from "./editor-border.ts"

test("formats the model on the right side of the top border", () => {
  assert.equal(
    formatModelBorderLabel("gpt-6-luna", "openai-codex", 2, "high", "↯"),
    "↯ (openai-codex) gpt-6-luna • high",
  )
})

test("keeps footer stats on the left and the project path on the right", () => {
  const stats = "CH98.4% $0.041 36.2%/128k"
  const path = "~/projects/pi-extensions (master)"
  const line = overlayBorderLabels(stats, path, 80, (text) => text)
  const plainLine = stripTerminalSequences(line)

  assert.equal(visibleWidth(line), 80)
  assert.ok(plainLine.startsWith(`── ${stats} `))
  assert.ok(plainLine.endsWith(`${path} ──`))
})

test("overlays a label while keeping the border at terminal width", () => {
  const line = overlayBorderLabel(
    "─".repeat(40),
    "~/project (main)",
    40,
    (text) => text,
  )
  assert.equal(
    stripTerminalSequences(line),
    `${"─".repeat(20)} ~/project (main) ──`,
  )
  assert.equal(visibleWidth(line), 40)
})
