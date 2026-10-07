import assert from "node:assert/strict"
import { test } from "node:test"
import { isTemporaryHerdrLabel } from "./herdr-label.ts"

test("recognizes the launcher's temporary Herdr label", () => {
  const previous = process.env["HERDR_TEMPORARY_LABEL"]
  process.env["HERDR_TEMPORARY_LABEL"] = "cmd (pi)"

  try {
    assert.equal(isTemporaryHerdrLabel("cmd (pi)"), true)
    assert.equal(isTemporaryHerdrLabel("custom label"), false)
    assert.equal(isTemporaryHerdrLabel(undefined), false)
  } finally {
    if (previous === undefined) {
      delete process.env["HERDR_TEMPORARY_LABEL"]
    } else {
      process.env["HERDR_TEMPORARY_LABEL"] = previous
    }
  }
})
