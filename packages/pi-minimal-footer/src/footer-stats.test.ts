import assert from "node:assert/strict"
import test from "node:test"
import { formatFooterStats } from "./footer-stats.ts"

test("shows cache hit rate, cost, and context usage only", () => {
  const entries = [
    {
      type: "message",
      message: {
        role: "assistant",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 984,
          cacheWrite: 16,
          cost: { total: 0.041 },
        },
      },
    },
  ] as unknown as Parameters<typeof formatFooterStats>[0]

  assert.equal(
    formatFooterStats(
      entries,
      { tokens: 46_336, contextWindow: 128_000, percent: 36.2 },
      undefined,
      false,
    ),
    "CH98.4% $0.041 36.2%/128k",
  )
})

test("keeps the subscription marker when cost is zero", () => {
  assert.equal(
    formatFooterStats(
      [],
      { tokens: null, contextWindow: 128_000, percent: null },
      undefined,
      true,
    ),
    "$0.000 (sub) ?/128k",
  )
})
