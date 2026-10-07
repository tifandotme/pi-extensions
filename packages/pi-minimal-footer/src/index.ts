import { isAbsolute, relative, resolve, sep } from "node:path"
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
  type ReadonlyFooterDataProvider,
  type Theme,
} from "@earendil-works/pi-coding-agent"
import { stripTerminalSequences, truncateToWidth } from "@earendil-works/pi-tui"
import type { EditorTheme, TUI } from "@earendil-works/pi-tui"
import { formatFooterStats } from "./footer-stats.js"
import {
  formatModelBorderLabel,
  overlayBorderLabel,
  overlayBorderLabels,
} from "./editor-border.js"

class MinimalEditor extends CustomEditor {
  override readonly embedWorkingStatus = true

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly ctx: ExtensionContext,
    private readonly getFooterData: () =>
      | ReadonlyFooterDataProvider
      | undefined,
  ) {
    super(tui, theme, keybindings)
  }

  override render(width: number): string[] {
    const isBashMode = this.getText().trimStart().startsWith("!")
    this.borderColor = isBashMode
      ? this.ctx.ui.theme.getBashModeBorderColor()
      : this.ctx.ui.theme.getThinkingBorderColor("minimal")

    const lines = super.render(width)
    const footerData = this.getFooterData()
    const model = this.ctx.model
    if (model) {
      const isFastMode =
        footerData?.getExtensionStatuses().has("fast-mode") ?? false
      const thinking = model.reasoning
        ? this.ctx.thinkingLevel || "off"
        : undefined
      const label = formatModelBorderLabel(
        model.id,
        model.provider,
        footerData?.getAvailableProviderCount() ?? 1,
        thinking,
        isFastMode ? "↯" : "",
      )
      const borderLabel = isFastMode
        ? `${this.ctx.ui.theme.fg("warning", "↯")} ${this.borderColor(label.slice(2))}`
        : this.borderColor(label)
      lines[0] = overlayBorderLabel(
        lines[0] ?? "",
        borderLabel,
        width,
        this.borderColor,
      )
    }

    const bottomBorder = lines.findLastIndex(
      (line, index) =>
        index > 0 &&
        (/^─+$/.test(stripTerminalSequences(line)) ||
          /^─── [↑↓] \d+ more ─*$/.test(stripTerminalSequences(line))),
    )
    if (bottomBorder >= 0) {
      const path = projectLocation(this.ctx, footerData)
      const stats = formatFooterStats(
        this.ctx.sessionManager.getEntries(),
        this.ctx.getContextUsage(),
        this.ctx.model?.contextWindow,
        isUsingSubscription(this.ctx),
      )
      lines[bottomBorder] = overlayBorderLabels(
        this.borderColor(stats),
        this.borderColor(path),
        width,
        this.borderColor,
      )
    }
    return lines
  }
}

export default function (pi: ExtensionAPI): void {
  let showExtensionStatus = false
  let footerData: ReadonlyFooterDataProvider | undefined

  const createFooter =
    (showStatus: boolean) =>
    (_tui: TUI, _theme: Theme, data: ReadonlyFooterDataProvider) => {
      footerData = data
      return {
        invalidate() {},
        dispose() {},
        render(width: number): string[] {
          if (!showStatus) return []
          const status = [...data.getExtensionStatuses().entries()]
            .filter(([key]) => key !== "fast-mode")
            .toSorted(([a], [b]) => a.localeCompare(b))
            .map(([, text]) => text)
            .join(" ")
          return status ? [truncateToWidth(status, width)] : []
        },
      }
    }

  pi.registerCommand("toggle-extension-status", {
    description: "show or hide the extension status row",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") return

      showExtensionStatus = !showExtensionStatus
      ctx.ui.setFooter(createFooter(showExtensionStatus))
    },
  })

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return

    showExtensionStatus = false
    ctx.ui.setFooter(createFooter(showExtensionStatus))
    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) =>
        new MinimalEditor(tui, theme, keybindings, ctx, () => footerData),
    )
  })
}

function isUsingSubscription(ctx: ExtensionContext): boolean {
  const model = ctx.model
  if (!model) return false
  if (model.provider === "kimi-coding") return true
  const provider = ctx.modelRegistry.getProvider(model.provider)
  return (
    ctx.modelRegistry.isUsingOAuth(model) &&
    provider?.auth.oauth?.isSubscription === true
  )
}

function projectLocation(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider | undefined,
): string {
  let cwd = ctx.sessionManager.getCwd()
  const home = process.env["HOME"] || process.env["USERPROFILE"]
  if (home) {
    const fromHome = relative(resolve(home), resolve(cwd))
    if (
      fromHome === "" ||
      (fromHome !== ".." &&
        !fromHome.startsWith(`..${sep}`) &&
        !isAbsolute(fromHome))
    ) {
      cwd = fromHome === "" ? "~" : `~${sep}${fromHome}`
    }
  }
  const branch = footerData?.getGitBranch()
  return branch ? `${cwd} (${branch})` : cwd
}
