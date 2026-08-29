import assert from "node:assert/strict"
import test from "node:test"
import { calculateTps, median } from "./src/tps.ts"

test("calculates response TPS from output tokens and elapsed time", () => {
  assert.equal(calculateTps(120, 1_000, 4_000), 40)
  assert.equal(calculateTps(0, 1_000, 4_000), undefined)
  assert.equal(calculateTps(120, 4_000, 1_000), undefined)
})

test("uses the middle sample instead of an outlier", () => {
  assert.equal(median([10, 20, 40, 50, 1_000]), 40)
  assert.equal(median([10, 20, 40, 50]), 30)
  assert.equal(median([]), 0)
})
