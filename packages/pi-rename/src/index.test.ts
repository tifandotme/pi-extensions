import assert from "node:assert/strict"
import { test } from "node:test"
import { CancellableLoader, type TUI } from "@earendil-works/pi-tui"

test("renders and disposes the built-in loading component", () => {
  const loader = new CancellableLoader(
    { requestRender() {} } as TUI,
    (text) => text,
    (text) => text,
    "working...",
  )

  assert.ok(loader.render(24).some((line) => line.includes("working...")))
  loader.dispose()
})
