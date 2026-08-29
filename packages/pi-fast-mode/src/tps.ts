import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent"

const MAX_SAMPLES = 200

const CONTENT_START_EVENTS = new Set([
  "text_start",
  "thinking_start",
  "toolcall_start",
])

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0

  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function calculateTps(
  outputTokens: number,
  startMs: number,
  endMs: number,
): number | undefined {
  const durationMs = endMs - startMs
  if (outputTokens <= 0 || durationMs <= 0) return undefined
  return outputTokens / (durationMs / 1000)
}

function addSample(samples: number[], value: number): void {
  samples.push(value)
  if (samples.length > MAX_SAMPLES) samples.shift()
}

function formatDuration(ms: number): string {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1).replace(".", ",")}s`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function formatTps(theme: Theme, label: string, value: number): string {
  return `${theme.fg("dim", label)} ${theme.fg("text", String(Math.round(value)))} ${theme.fg("dim", "t/s")}`
}

function notify(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  message: string,
  type: "info" | "error" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, type)
}

export function registerTps(
  pi: ExtensionAPI,
  persistEnabled: (enabled: boolean) => void,
) {
  let enabled = true
  let tpsValues: number[] = []
  let ttftValues: number[] = []
  let turnStart = 0
  let streamStart = 0

  function updateStatus(ctx: ExtensionContext): void {
    if (!enabled || tpsValues.length === 0) {
      ctx.ui.setStatus("tps", undefined)
      return
    }

    const theme = ctx.ui.theme
    const latest = tpsValues.at(-1)!
    const typical = median(tpsValues)
    let status = `${formatTps(theme, "last", latest)} ${theme.fg("dim", "·")} ${formatTps(theme, "med", typical)}`

    if (ttftValues.length > 0) {
      status += ` ${theme.fg("dim", "|")} ${theme.fg("text", formatDuration(median(ttftValues)))} ${theme.fg("dim", "ttft")}`
    }

    ctx.ui.setStatus("tps", status)
  }

  function resetStats(ctx: ExtensionContext): void {
    tpsValues = []
    ttftValues = []
    turnStart = 0
    streamStart = 0
    updateStatus(ctx)
  }

  function setEnabled(next: boolean, ctx: ExtensionContext): void {
    enabled = next
    turnStart = 0
    streamStart = 0
    updateStatus(ctx)
  }

  pi.registerCommand("tps", {
    description: "Toggle response TPS status",
    handler: async (args, ctx) => {
      if (args.trim()) {
        notify(ctx, "Usage: /tps", "error")
        return
      }

      const next = !enabled
      try {
        persistEnabled(next)
      } catch (error) {
        notify(
          ctx,
          error instanceof Error ? error.message : String(error),
          "error",
        )
        return
      }

      setEnabled(next, ctx)
      notify(ctx, `TPS ${next ? "on" : "off"}.`)
    },
  })

  pi.on("session_start", (_event, ctx) => {
    resetStats(ctx)
  })

  pi.on("model_select", (_event, ctx) => {
    resetStats(ctx)
  })

  pi.on("thinking_level_select", (_event, ctx) => {
    resetStats(ctx)
  })

  pi.on("agent_start", () => {
    turnStart = 0
    streamStart = 0
  })

  pi.on("turn_start", (event) => {
    if (!enabled) return
    turnStart = event.timestamp
    streamStart = 0
  })

  pi.on("message_update", (event) => {
    if (!enabled || !turnStart || event.message.role !== "assistant") return
    if (streamStart !== 0) return
    if (CONTENT_START_EVENTS.has(event.assistantMessageEvent.type)) {
      streamStart = Date.now()
    }
  })

  pi.on("message_end", (event, ctx) => {
    if (!enabled || event.message.role !== "assistant" || !turnStart) return

    const start = turnStart
    const firstToken = streamStart
    turnStart = 0
    streamStart = 0

    const output = event.message.usage?.output
    if (typeof output !== "number" || output <= 0) return

    if (firstToken !== 0) addSample(ttftValues, firstToken - start)

    const rate = calculateTps(output, start, Date.now())
    if (rate !== undefined) addSample(tpsValues, rate)
    updateStatus(ctx)
  })

  pi.on("agent_settled", () => {
    turnStart = 0
    streamStart = 0
  })

  pi.on("session_shutdown", (_event, ctx) => {
    turnStart = 0
    streamStart = 0
    if (ctx.mode === "tui") ctx.ui.setStatus("tps", undefined)
  })

  return setEnabled
}
