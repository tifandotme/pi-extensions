import assert from "node:assert/strict"
import { test } from "node:test"
import { formatNativeStatus, getNativeStatus } from "./index.ts"

test("marks a fitting supported Mermaid diagram as rendered", () => {
  const status = getNativeStatus("flowchart LR\n  A --> B", "mermaid", {
    mode: "streaming",
    availableWidth: 20,
  })

  assert.deepEqual(status, { kind: "rendered", width: 14 })
  assert.equal(formatNativeStatus(status), "✓ rendered · 14 cols")
})

test("marks wide, unsupported, and disabled diagrams as skipped", () => {
  assert.equal(
    formatNativeStatus(
      getNativeStatus("flowchart LR\n  A --> B", "mermaid", {
        mode: "streaming",
        availableWidth: 5,
      }),
    ),
    "✗ skipped · too wide (14 > 5)",
  )
  assert.equal(
    formatNativeStatus(
      getNativeStatus('pie\n  "Dogs" : 4', "mermaid", {
        mode: "streaming",
        availableWidth: 80,
      }),
    ),
    "✗ skipped · unsupported",
  )
  assert.equal(
    formatNativeStatus(
      getNativeStatus("flowchart LR\n  A --> B", "mermaid", {
        mode: "off",
        availableWidth: 80,
      }),
    ),
    "✗ skipped · Mermaid disabled",
  )
})
