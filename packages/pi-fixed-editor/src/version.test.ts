import assert from "node:assert/strict"
import { test } from "node:test"
import { getPiSupport } from "./version.ts"

test("selects legacy, upgrade, and native Pi support", () => {
  assert.equal(getPiSupport("0.83.9"), "legacy")
  assert.equal(getPiSupport("0.84.0"), "upgrade")
  assert.equal(getPiSupport("0.84.0-beta.1"), "upgrade")
  assert.equal(getPiSupport("0.84.1"), "native")
  assert.equal(getPiSupport("1.0.0"), "native")
  assert.equal(getPiSupport("unknown"), "native")
})
