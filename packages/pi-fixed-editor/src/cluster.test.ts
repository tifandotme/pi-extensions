import assert from "node:assert/strict"
import { test } from "node:test"
import { CURSOR_MARKER } from "@earendil-works/pi-tui"
import { renderFixedEditorCluster } from "./cluster.ts"

test("renders the fixed input cluster in Pi order", () => {
  const result = renderFixedEditorCluster({
    width: 80,
    terminalRows: 24,
    statusLines: ["status"],
    aboveWidgetLines: ["above"],
    editorLines: ["editor"],
    belowWidgetLines: ["below"],
    footerLines: ["footer"],
  })

  assert.deepEqual(result.lines, [
    "status",
    "above",
    "editor",
    "below",
    "footer",
  ])
})

test("prioritizes editor lines when the cluster is taller than the terminal", () => {
  const result = renderFixedEditorCluster({
    width: 80,
    terminalRows: 4,
    statusLines: ["status"],
    aboveWidgetLines: ["above"],
    editorLines: ["editor 1", "editor 2", "editor 3"],
    belowWidgetLines: ["below"],
    footerLines: ["footer"],
  })

  assert.deepEqual(result.lines, ["editor 1", "editor 2", "editor 3"])
})

test("keeps the cursor row visible when capping editor lines", () => {
  const result = renderFixedEditorCluster({
    width: 80,
    terminalRows: 3,
    editorLines: ["editor 1", `editor ${CURSOR_MARKER}2`, "editor 3"],
  })

  assert.deepEqual(result.lines, ["editor 1", "editor 2"])
  assert.deepEqual(result.cursor, { row: 1, col: 7 })
})
