import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
  type ReadonlyFooterDataProvider,
  type Theme,
} from "@earendil-works/pi-coding-agent"
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui"
import { registerTps } from "./tps.js"

type FastConfig = {
  models: string[]
  tpsEnabled: boolean
}

type Model = NonNullable<ExtensionContext["model"]>
type Usage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: { total: number }
}
type UsageTotals = Omit<Usage, "cost"> & { cost: number }

const CONFIG_PATH = join(getAgentDir(), "extensions", "pi-fast-mode.json")
const FAST_ICON = "⚡"
const DEFAULT_SERVICE_TIER = "priority"
const FAST_TARGETS = new Set([
  "openai/gpt-5.4",
  "openai/gpt-5.5",
  "openai/gpt-5.6",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "openai-codex/gpt-5.4",
  "openai-codex/gpt-5.5",
  "openai-codex/gpt-5.6",
  "openai-codex/gpt-5.6-sol",
  "openai-codex/gpt-5.6-terra",
  "openai-codex/gpt-5.6-luna",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function modelKey(model: Model): string {
  return `${model.provider}/${model.id}`
}

function parseConfig(value: unknown): FastConfig {
  if (
    !isRecord(value) ||
    !Array.isArray(value["models"]) ||
    value["models"].some((model) => typeof model !== "string")
  ) {
    throw new Error('expected { "models": string[] }')
  }

  const tpsEnabled = value["tpsEnabled"]
  if (tpsEnabled !== undefined && typeof tpsEnabled !== "boolean") {
    throw new Error('expected "tpsEnabled" to be boolean')
  }

  return {
    models: [...new Set(value["models"])],
    tpsEnabled: tpsEnabled ?? true,
  }
}

function readConfig(): FastConfig {
  let content: string
  try {
    content = readFileSync(CONFIG_PATH, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { models: [], tpsEnabled: true }
    }
    throw error
  }

  try {
    return parseConfig(JSON.parse(content))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid ${CONFIG_PATH}: ${reason}`, { cause: error })
  }
}

function writeConfig(models: Set<string>, tpsEnabled: boolean): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(
    CONFIG_PATH,
    `${JSON.stringify(
      { models: [...models].toSorted(), tpsEnabled },
      null,
      2,
    )}\n`,
    "utf8",
  )
}

function isFastModel(
  model: Model | undefined,
  enabledModels: Set<string>,
): boolean {
  if (!model) return false
  const key = modelKey(model)
  return FAST_TARGETS.has(key) && enabledModels.has(key)
}

function notify(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  message: string,
  type: "info" | "error" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, type)
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString()
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1000000) return `${Math.round(count / 1000)}k`
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`
  return `${Math.round(count / 1000000)}M`
}

function formatCwd(cwd: string, home: string | undefined): string {
  if (!home) return cwd

  const relativeToHome = relative(resolve(home), resolve(cwd))
  const isInsideHome =
    relativeToHome === "" ||
    (relativeToHome !== ".." &&
      !relativeToHome.startsWith(`..${sep}`) &&
      !isAbsolute(relativeToHome))

  if (!isInsideHome) return cwd
  return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`
}

function addUsage(totals: UsageTotals, usage: Usage): void {
  totals.input += usage.input
  totals.output += usage.output
  totals.cacheRead += usage.cacheRead
  totals.cacheWrite += usage.cacheWrite
  totals.cost += usage.cost.total
}

function getUsageTotals(ctx: ExtensionContext): {
  totals: UsageTotals
  latestCacheHitRate: number | undefined
} {
  const totals: UsageTotals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  }
  let latestCacheHitRate: number | undefined

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message") {
      if (entry.message.role === "assistant") {
        addUsage(totals, entry.message.usage)
        const promptTokens =
          entry.message.usage.input +
          entry.message.usage.cacheRead +
          entry.message.usage.cacheWrite
        latestCacheHitRate =
          promptTokens > 0
            ? (entry.message.usage.cacheRead / promptTokens) * 100
            : undefined
      } else if (entry.message.role === "toolResult" && entry.message.usage) {
        addUsage(totals, entry.message.usage)
      }
    } else if (
      (entry.type === "branch_summary" || entry.type === "compaction") &&
      entry.usage
    ) {
      addUsage(totals, entry.usage)
    }
  }

  return { totals, latestCacheHitRate }
}

function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim()
}

function styleModelText(theme: Theme, text: string): string {
  if (!text.startsWith(FAST_ICON)) return theme.fg("dim", text)
  return (
    theme.fg("accent", FAST_ICON) +
    theme.fg("dim", text.slice(FAST_ICON.length))
  )
}

function renderFooter(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  theme: Theme,
  width: number,
): string[] {
  const safeWidth = Math.max(0, Math.floor(width))
  const model = ctx.model
  const { totals, latestCacheHitRate } = getUsageTotals(ctx)
  const contextUsage = ctx.getContextUsage()
  const contextWindow = contextUsage?.contextWindow ?? model?.contextWindow ?? 0
  const contextPercentValue = contextUsage?.percent ?? 0
  const contextPercent =
    contextUsage?.percent === null ? "?" : contextPercentValue.toFixed(1)

  let pwd = formatCwd(
    ctx.sessionManager.getCwd(),
    process.env["HOME"] || process.env["USERPROFILE"],
  )
  const branch = footerData.getGitBranch()
  if (branch) pwd = `${pwd} (${branch})`
  const sessionName = ctx.sessionManager.getSessionName()
  if (sessionName) pwd = `${pwd} • ${sessionName}`

  const statsParts: string[] = []
  if (totals.input) statsParts.push(`↑${formatTokens(totals.input)}`)
  if (totals.output) statsParts.push(`↓${formatTokens(totals.output)}`)
  if (totals.cacheRead) statsParts.push(`R${formatTokens(totals.cacheRead)}`)
  if (totals.cacheWrite) statsParts.push(`W${formatTokens(totals.cacheWrite)}`)
  if (
    (totals.cacheRead > 0 || totals.cacheWrite > 0) &&
    latestCacheHitRate !== undefined
  ) {
    statsParts.push(`CH${latestCacheHitRate.toFixed(1)}%`)
  }
  if (totals.cost) statsParts.push(`$${totals.cost.toFixed(3)}`)

  let contextPercentText: string
  if (contextPercentValue > 90) {
    contextPercentText = theme.fg(
      "error",
      `${contextPercent}%/${formatTokens(contextWindow)}`,
    )
  } else if (contextPercentValue > 70) {
    contextPercentText = theme.fg(
      "warning",
      `${contextPercent}%/${formatTokens(contextWindow)}`,
    )
  } else {
    contextPercentText = `${contextPercent}%/${formatTokens(contextWindow)}`
  }
  statsParts.push(contextPercentText)

  let statsLeft = statsParts.join(" ")
  let statsLeftWidth = visibleWidth(statsLeft)
  if (statsLeftWidth > safeWidth) {
    statsLeft = truncateToWidth(statsLeft, safeWidth, "...")
    statsLeftWidth = visibleWidth(statsLeft)
  }

  const modelName = model?.id || "no-model"
  let rightText = model?.reasoning
    ? `${modelName} • ${ctx.thinkingLevel || "off"}`
    : modelName
  if (model && footerData.getAvailableProviderCount() > 1) {
    const withProvider = `(${model.provider}) ${rightText}`
    if (
      statsLeftWidth + 2 + visibleWidth(`${FAST_ICON} ${withProvider}`) <=
      safeWidth
    ) {
      rightText = withProvider
    }
  }
  rightText = `${FAST_ICON} ${rightText}`

  const minPadding = 2
  const totalNeeded = statsLeftWidth + minPadding + visibleWidth(rightText)
  let statsLine: string
  if (totalNeeded <= safeWidth) {
    const padding = " ".repeat(
      safeWidth - statsLeftWidth - visibleWidth(rightText),
    )
    statsLine =
      theme.fg("dim", statsLeft) +
      theme.fg("dim", padding) +
      styleModelText(theme, rightText)
  } else {
    const availableForRight = safeWidth - statsLeftWidth - minPadding
    if (availableForRight > 0) {
      const truncatedRight = truncateToWidth(rightText, availableForRight, "")
      const padding = " ".repeat(
        Math.max(0, safeWidth - statsLeftWidth - visibleWidth(truncatedRight)),
      )
      statsLine =
        theme.fg("dim", statsLeft) +
        theme.fg("dim", padding) +
        styleModelText(theme, truncatedRight)
    } else {
      statsLine = theme.fg("dim", statsLeft)
    }
  }

  const lines = [
    truncateToWidth(theme.fg("dim", pwd), safeWidth, theme.fg("dim", "...")),
    statsLine,
  ]
  const statuses = [...footerData.getExtensionStatuses().values()]
    .map(sanitizeStatusText)
    .filter(Boolean)
  if (statuses.length > 0) {
    lines.push(
      truncateToWidth(statuses.join(" "), safeWidth, theme.fg("dim", "...")),
    )
  }
  return lines
}

export default function piFastExtension(pi: ExtensionAPI): void {
  let enabledModels = new Set<string>()
  let tpsEnabled = true
  let ownsFooter = false
  const setTpsEnabled = registerTps(pi, (enabled) => {
    writeConfig(enabledModels, enabled)
    tpsEnabled = enabled
  })

  function updateFooter(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") return

    if (isFastModel(ctx.model, enabledModels)) {
      ctx.ui.setFooter((tui, theme, footerData) => {
        const dispose = footerData.onBranchChange(() => tui.requestRender())
        return {
          dispose,
          invalidate() {},
          render: (width) => renderFooter(ctx, footerData, theme, width),
        }
      })
      ownsFooter = true
    } else if (ownsFooter) {
      ctx.ui.setFooter(undefined)
      ownsFooter = false
    }
  }

  function loadConfig(ctx: ExtensionContext): void {
    enabledModels = new Set()
    tpsEnabled = true
    try {
      const config = readConfig()
      enabledModels = new Set(config.models)
      tpsEnabled = config.tpsEnabled
    } catch (error) {
      notify(
        ctx,
        error instanceof Error ? error.message : String(error),
        "error",
      )
    }
    setTpsEnabled(tpsEnabled, ctx)
  }

  pi.registerCommand("fast", {
    description: "Toggle Fast Mode for the current model",
    handler: async (args, ctx) => {
      if (args.trim()) {
        notify(ctx, "Usage: /fast", "error")
        return
      }

      const model = ctx.model
      if (!model) {
        notify(ctx, "No current model selected.", "error")
        return
      }

      const key = modelKey(model)
      if (!FAST_TARGETS.has(key)) {
        notify(ctx, `Fast Mode is not supported for ${key}.`, "error")
        return
      }

      if (enabledModels.has(key)) enabledModels.delete(key)
      else enabledModels.add(key)

      try {
        writeConfig(enabledModels, tpsEnabled)
      } catch (error) {
        notify(
          ctx,
          error instanceof Error ? error.message : String(error),
          "error",
        )
        return
      }

      updateFooter(ctx)
      notify(
        ctx,
        enabledModels.has(key) ? "Fast Mode enabled." : "Fast Mode disabled.",
      )
    },
  })

  pi.on("session_start", (_event, ctx) => {
    loadConfig(ctx)
    updateFooter(ctx)
  })

  pi.on("model_select", (_event, ctx) => {
    updateFooter(ctx)
  })

  pi.on("agent_start", (_event, ctx) => {
    updateFooter(ctx)
  })

  pi.on("before_provider_request", (event, ctx) => {
    if (!isFastModel(ctx.model, enabledModels) || !isRecord(event.payload)) {
      return undefined
    }

    return { ...event.payload, service_tier: DEFAULT_SERVICE_TIER }
  })

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode === "tui" && ownsFooter) {
      ctx.ui.setFooter(undefined)
      ownsFooter = false
    }
  })
}
