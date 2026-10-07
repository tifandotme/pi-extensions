import type { ExtensionContext } from "@earendil-works/pi-coding-agent"

type SessionEntry = ReturnType<
  ExtensionContext["sessionManager"]["getEntries"]
>[number]

type Usage = {
  input: number
  cacheRead: number
  cacheWrite: number
  cost: { total: number }
}

function formatTokens(count: number): string {
  if (count < 1_000) return String(count)
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  return `${Math.round(count / 1_000_000)}M`
}

export function formatFooterStats(
  entries: SessionEntry[],
  contextUsage: ReturnType<ExtensionContext["getContextUsage"]>,
  modelContextWindow: number | undefined,
  isSubscription: boolean,
): string {
  let cost = 0
  let cacheRead = 0
  let cacheWrite = 0
  let latestCacheHitRate: number | undefined

  function addUsage(usage: Usage): void {
    cost += usage.cost.total
    cacheRead += usage.cacheRead
    cacheWrite += usage.cacheWrite
  }

  for (const entry of entries) {
    if (entry.type === "usage") {
      addUsage(entry.usage)
    } else if (entry.type === "message" && entry.message.role === "assistant") {
      const usage = entry.message.usage
      addUsage(usage)
      const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite
      latestCacheHitRate =
        promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : undefined
    } else if (
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.usage
    ) {
      addUsage(entry.message.usage)
    } else if (
      (entry.type === "branch_summary" || entry.type === "compaction") &&
      entry.usage
    ) {
      addUsage(entry.usage)
    }
  }

  const stats: string[] = []
  if ((cacheRead > 0 || cacheWrite > 0) && latestCacheHitRate !== undefined) {
    stats.push(`CH${latestCacheHitRate.toFixed(1)}%`)
  }
  if (cost || isSubscription) {
    stats.push(`$${cost.toFixed(3)}${isSubscription ? " (sub)" : ""}`)
  }

  const contextWindow = contextUsage?.contextWindow ?? modelContextWindow ?? 0
  const percent = contextUsage?.percent
  stats.push(
    `${percent == null ? "?" : `${percent.toFixed(1)}%`}/${formatTokens(contextWindow)}`,
  )
  return stats.join(" ")
}
