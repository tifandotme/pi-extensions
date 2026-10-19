import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent"
import type { Component, TUI } from "@earendil-works/pi-tui"
import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui"
import { sanitizeRecapText } from "./sanitize.js"

const WIDGET_KEY = "pi-recap"
const MODEL_WARNING_WIDGET_KEY = "pi-recap-model-warning"
const NO_RECAP_MODEL_AUTH_MESSAGE = "no recap model authenticated"
const ICON = "※ "
const LABEL = `${ICON}recap: `
const LOADING_TEXT = "generating..."
const LOADING_FRAMES = ["⡿", "⣟", "⣯", "⣷", "⣾", "⣽", "⣻", "⢿"] as const
const LOADING_INTERVAL_MS = 70
const MIN_RECAP_WIDTH = 12

class WarningLine implements Component {
  private readonly theme: Theme
  private readonly message: string

  constructor(theme: Theme, message: string) {
    this.theme = theme
    this.message = message
  }

  invalidate(): void {}

  render(width: number): string[] {
    return [this.theme.fg("warning", truncateToWidth(this.message, width))]
  }
}

class LoadingRecapLine implements Component {
  private readonly tui: TUI
  private readonly theme: Theme
  private readonly timer: ReturnType<typeof setInterval>
  private frameIndex = 0

  constructor(tui: TUI, theme: Theme) {
    this.tui = tui
    this.theme = theme
    this.timer = setInterval(() => {
      this.frameIndex++
      this.tui.requestRender()
    }, LOADING_INTERVAL_MS)
  }

  dispose(): void {
    clearInterval(this.timer)
  }

  invalidate(): void {}

  render(width: number): string[] {
    const frame =
      LOADING_FRAMES[this.frameIndex % LOADING_FRAMES.length] ??
      LOADING_FRAMES[0]
    return [
      truncateToWidth(
        this.theme.fg("dim", `${LABEL}${frame} ${LOADING_TEXT}`),
        width,
      ),
    ]
  }
}

class PiRecapLine implements Component {
  private readonly theme: Theme
  private readonly recap: string
  private readonly color: string
  private readonly blankLineAbove: boolean

  constructor(
    theme: Theme,
    recap: string,
    color: string,
    blankLineAbove: boolean,
  ) {
    this.theme = theme
    this.recap = recap
    this.color = color
    this.blankLineAbove = blankLineAbove
  }

  invalidate(): void {}

  render(width: number): string[] {
    const labelWidth = visibleWidth(LABEL)
    const label = this.renderLabel()
    const lead = this.blankLineAbove ? [""] : []

    if (width < MIN_RECAP_WIDTH) {
      return [
        ...lead,
        truncateToWidth(
          this.theme.fg(
            this.color as Parameters<Theme["fg"]>[0],
            `${LABEL}${this.recap}`,
          ),
          width,
        ),
      ]
    }

    const contentWidth = width - labelWidth
    const wrappedLines = wrapTextWithAnsi(this.recap, contentWidth)
    const contentLines = wrappedLines.length === 0 ? [""] : wrappedLines

    const continuationIndent = " ".repeat(visibleWidth(ICON))

    return [
      ...lead,
      ...contentLines.map((line, index) => {
        const prefix = index === 0 ? label : continuationIndent
        return truncateToWidth(
          this.theme.fg(
            this.color as Parameters<Theme["fg"]>[0],
            `${prefix}${line}`,
          ),
          width,
        )
      }),
    ]
  }

  private renderLabel(): string {
    return `※ ${this.theme.bold("recap:")} `
  }
}

export function clearWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return
  ctx.ui.setWidget(WIDGET_KEY, undefined)
}

export function clearNoModelWarning(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return
  ctx.ui.setWidget(MODEL_WARNING_WIDGET_KEY, undefined)
}

export function showNoModelWarning(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return
  ctx.ui.setWidget(
    MODEL_WARNING_WIDGET_KEY,
    (_tui, theme) => new WarningLine(theme, NO_RECAP_MODEL_AUTH_MESSAGE),
    { placement: "aboveEditor" },
  )
}

export function showLoadingWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return

  ctx.ui.setWidget(WIDGET_KEY, (tui, theme) => new LoadingRecapLine(tui, theme))
}

export function showWidget(
  ctx: ExtensionContext,
  recap: string,
  options: { color: string; blankLineAbove: boolean },
): void {
  if (!ctx.hasUI) return

  const safeRecap = sanitizeRecapText(recap)
  if (!safeRecap) {
    clearWidget(ctx)
    return
  }

  ctx.ui.setWidget(
    WIDGET_KEY,
    (_tui, theme) =>
      new PiRecapLine(theme, safeRecap, options.color, options.blankLineAbove),
  )
}

export function notifyUser(
  ctx: ExtensionContext,
  message: string,
  level: "info" | "error",
): void {
  if (!ctx.hasUI) return
  ctx.ui.notify(message, level)
}
