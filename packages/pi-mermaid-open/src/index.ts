import { execFile, spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { diagramKind, render as renderNativeMermaid } from "grok-mermaid"
import {
  Box,
  CancellableLoader,
  deleteKittyImage,
  getCapabilities,
  Image,
  matchesKey,
  Spacer,
  Text,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui"
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type Theme,
} from "@earendil-works/pi-coding-agent"

type TextBlock = {
  type: "text"
  text: string
}

type AssistantMessage = {
  role: "assistant"
  content: unknown
}

type MessageEntry = {
  type: "message"
  id: string
  message: unknown
}

type MermaidFenceLanguage = "mermaid" | "mmd"

type NativeMermaidMode = "off" | "final" | "streaming"

type NativeStatus =
  | { kind: "rendered"; width: number }
  | { kind: "skipped"; reason: SkipReason }

type SkipReason =
  | { kind: "disabled" }
  | { kind: "mmd-fence" }
  | { kind: "unsupported" }
  | { kind: "invalid" }
  | { kind: "too-wide"; width: number; availableWidth: number }
  | { kind: "warnings" }

type MermaidDiagram = {
  source: string
  diagramType: string
  label: string
  fenceLanguage: MermaidFenceLanguage
  messageOffset: number
  discoveredIndex: number
  nativeStatus: NativeStatus
}

type NativeMermaidConfig = {
  mode: NativeMermaidMode
  availableWidth: number
}

type PiSettings = {
  outputPad?: 0 | 1
  markdown?: {
    mermaid?: NativeMermaidMode
  }
}

const execFileAsync = promisify(execFile)
const OUTPUT_DIR = path.join(getAgentDir(), "artifacts", "mermaid")
const HERDR_PLUGIN_ID = "pi-mermaid-open"
const HERDR_PLUGIN_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "herdr-plugin",
)
// Fences must open at the start of a line so that inline code spans describing a fence
// (for example `` ```mermaid ``) are not mistaken for diagram source.
const MERMAID_FENCE_PATTERN =
  /^ {0,3}(`{3,})[ \t]*(mermaid|mmd)\b[^\n]*\n([\s\S]*?)^ {0,3}\1[ \t]*$/gim

type MermaidFence = {
  fenceLanguage: MermaidFenceLanguage
  source: string
}

export function extractMermaidFences(text: string): MermaidFence[] {
  const fences: MermaidFence[] = []
  for (const match of text.matchAll(MERMAID_FENCE_PATTERN)) {
    const source = trimOuterBlankLines(match[3] ?? "")
    if (!source) continue
    fences.push({
      fenceLanguage: (
        match[2] ?? "mermaid"
      ).toLowerCase() as MermaidFenceLanguage,
      source,
    })
  }
  return fences
}

function isTextBlock(value: unknown): value is TextBlock {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "text" &&
    "text" in value &&
    typeof value.text === "string"
  )
}

function isAssistantMessage(value: unknown): value is AssistantMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "role" in value &&
    value.role === "assistant" &&
    "content" in value
  )
}

function isMessageEntry(value: unknown): value is MessageEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "message" &&
    "id" in value &&
    typeof value.id === "string" &&
    "message" in value
  )
}

function getAssistantText(message: AssistantMessage): string {
  if (!Array.isArray(message.content)) return ""
  return message.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join("\n")
}

function trimOuterBlankLines(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  while (lines.length > 0 && lines[0]?.trim() === "") lines.shift()
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop()
  return lines.join("\n")
}

function classifyDiagram(source: string): string {
  const firstMeaningfulLine = source
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("%%"))

  return firstMeaningfulLine?.split(/\s+/)[0] ?? "mermaid"
}

function extractTitle(source: string): string | undefined {
  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    const match = /^title\s+(.+)$/i.exec(trimmed)
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

function relativeMessageLabel(offset: number): string {
  if (offset === 1) return "latest assistant message"
  return `${offset} assistant messages ago`
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "unnamed"
}

function timestampForFilename(date = new Date()): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
}

function conciseError(stderr: string, stdout: string): string {
  const text = `${stderr}\n${stdout}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join("\n")
  return text || "Unknown error"
}

function getNativeMermaidMode(settings: PiSettings): NativeMermaidMode {
  const mode = settings.markdown?.mermaid
  return mode === "off" || mode === "final" ? mode : "streaming"
}

async function readNativeMermaidConfig(): Promise<NativeMermaidConfig> {
  let settings: PiSettings = {}
  try {
    settings = JSON.parse(
      await readFile(path.join(getAgentDir(), "settings.json"), "utf8"),
    ) as PiSettings
  } catch {
    // Pi's defaults are streaming Mermaid with one column of output padding.
  }

  const columns = process.stdout.columns ?? 80
  const outputPad = settings.outputPad ?? 1

  return {
    mode: getNativeMermaidMode(settings),
    availableWidth: Math.max(1, columns - outputPad * 2),
  }
}

export function getNativeStatus(
  source: string,
  fenceLanguage: MermaidFenceLanguage,
  config: NativeMermaidConfig,
): NativeStatus {
  if (config.mode === "off")
    return { kind: "skipped", reason: { kind: "disabled" } }
  if (fenceLanguage !== "mermaid") {
    return { kind: "skipped", reason: { kind: "mmd-fence" } }
  }
  if (diagramKind(source) === null) {
    return { kind: "skipped", reason: { kind: "unsupported" } }
  }

  const art = renderNativeMermaid(source)
  if (!art) return { kind: "skipped", reason: { kind: "invalid" } }
  if (art.width > config.availableWidth) {
    return {
      kind: "skipped",
      reason: {
        kind: "too-wide",
        width: art.width,
        availableWidth: config.availableWidth,
      },
    }
  }
  if (art.warnings.length > 0) {
    return { kind: "skipped", reason: { kind: "warnings" } }
  }

  return { kind: "rendered", width: art.width }
}

function discoverDiagrams(
  entries: readonly unknown[],
  nativeConfig: NativeMermaidConfig,
): MermaidDiagram[] {
  const assistantMessages = entries
    .filter(isMessageEntry)
    .map((entry) => entry.message)
    .filter(isAssistantMessage)
    .toReversed()

  const diagrams: MermaidDiagram[] = []

  assistantMessages.forEach((message, messageIndex) => {
    for (const fence of extractMermaidFences(getAssistantText(message))) {
      const { source, fenceLanguage } = fence
      const discoveredIndex = diagrams.length + 1
      const diagramType = classifyDiagram(source)
      const label = extractTitle(source) ?? `${diagramType} ${discoveredIndex}`

      diagrams.push({
        source,
        diagramType,
        label,
        fenceLanguage,
        messageOffset: messageIndex + 1,
        discoveredIndex,
        nativeStatus: getNativeStatus(source, fenceLanguage, nativeConfig),
      })
    }
  })

  return diagrams
}

export function formatNativeStatus(status: NativeStatus): string {
  if (status.kind === "rendered") return `✓ rendered · ${status.width} cols`

  switch (status.reason.kind) {
    case "disabled":
      return "✗ skipped · Mermaid disabled"
    case "mmd-fence":
      return "✗ skipped · mmd fence"
    case "unsupported":
      return "✗ skipped · unsupported"
    case "invalid":
      return "✗ skipped · invalid"
    case "too-wide":
      return `✗ skipped · too wide (${status.reason.width} > ${status.reason.availableWidth})`
    case "warnings":
      return "⚠ skipped · parser warnings"
  }
}

function pickerLabel(diagram: MermaidDiagram): string {
  return [
    formatNativeStatus(diagram.nativeStatus),
    diagram.diagramType,
    diagram.label,
    relativeMessageLabel(diagram.messageOffset),
  ].join(" · ")
}

async function createPngArtifactPath(diagram: MermaidDiagram): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const baseName = [
    timestampForFilename(),
    slugify(diagram.diagramType),
    slugify(diagram.label),
  ].join("-")
  return path.join(OUTPUT_DIR, `${baseName}.png`)
}

async function renderMermaidToPng(
  source: string,
  pngPath: string,
): Promise<{
  ok: boolean
  error?: string
}> {
  const bunx = os.platform() === "win32" ? "bunx.cmd" : "bunx"
  let command = bunx
  try {
    await execFileAsync(bunx, ["--version"])
  } catch {
    command = os.platform() === "win32" ? "npx.cmd" : "npx"
  }

  return new Promise((resolve) => {
    const child = spawn(
      command,
      [
        "-y",
        "@mermaid-js/mermaid-cli",
        "-i",
        "-",
        "-o",
        pngPath,
        "--scale",
        "4",
      ],
      {
        env: { ...process.env, PUPPETEER_CHROME_SKIP_DOWNLOAD: "true" },
      },
    )

    let stdout = ""
    let stderr = ""

    child.stdout.setEncoding("utf-8")
    child.stderr.setEncoding("utf-8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })

    child.on("error", (error) => {
      resolve({ ok: false, error: error.message })
    })

    child.on("close", (code) => {
      resolve(
        code === 0
          ? { ok: true }
          : { ok: false, error: conciseError(stderr, stdout) },
      )
    })

    child.stdin.end(source)
  })
}

class MermaidImageViewer implements Component {
  private readonly box: Box
  private readonly done: () => void
  private readonly image: Image
  private readonly tui: TUI

  constructor(
    base64Data: string,
    pngPath: string,
    diagram: MermaidDiagram,
    tui: TUI,
    theme: Theme,
    done: () => void,
  ) {
    this.done = done
    this.tui = tui
    this.box = new Box(1, 1, (text) => theme.bg("customMessageBg", text))
    this.box.addChild(new Text(theme.fg("accent", diagram.label), 0, 0))
    this.box.addChild(
      new Text(theme.fg("dim", formatNativeStatus(diagram.nativeStatus)), 0, 0),
    )
    this.box.addChild(new Spacer(1))
    this.image = new Image(
      base64Data,
      "image/png",
      { fallbackColor: (text) => theme.fg("muted", text) },
      {
        maxWidthCells: Math.max(10, tui.terminal.columns - 8),
        maxHeightCells: Math.max(4, tui.terminal.rows - 8),
        filename: pngPath,
      },
    )
    this.box.addChild(this.image)
    this.box.addChild(new Spacer(1))
    this.box.addChild(new Text(theme.fg("dim", "Esc or Enter to close"), 0, 0))
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "return")) this.done()
  }

  render(width: number): string[] {
    return this.box.render(width)
  }

  invalidate(): void {
    this.box.invalidate()
  }

  dispose(): void {
    const imageId = this.image.getImageId()
    if (imageId !== undefined) {
      this.tui.terminal.write(deleteKittyImage(imageId))
    }
  }
}

async function showPngInHerdrOverlay(pngPath: string): Promise<boolean> {
  try {
    await execFileAsync("herdr", [
      "plugin",
      "link",
      HERDR_PLUGIN_ROOT,
      "--enabled",
    ])
    await execFileAsync("herdr", [
      "plugin",
      "pane",
      "open",
      "--plugin",
      HERDR_PLUGIN_ID,
      "--entrypoint",
      "viewer",
      "--placement",
      "overlay",
      "--env",
      `PI_MERMAID_OPEN_PNG=${pngPath}`,
      "--focus",
    ])
    return true
  } catch {
    return false
  }
}

async function showPngInTerminal(
  ctx: ExtensionCommandContext,
  pngPath: string,
  diagram: MermaidDiagram,
): Promise<void> {
  const base64Data = (await readFile(pngPath)).toString("base64")
  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) =>
      new MermaidImageViewer(base64Data, pngPath, diagram, tui, theme, done),
    {
      overlay: true,
      overlayOptions: {
        width: "92%",
        maxHeight: "92%",
        margin: 2,
      },
    },
  )
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("mermaid-open", {
    description: "Open a skipped Mermaid diagram in a terminal popup",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle()

      const nativeConfig = await readNativeMermaidConfig()
      const diagrams = discoverDiagrams(
        ctx.sessionManager.getBranch(),
        nativeConfig,
      )
      const skippedDiagrams = diagrams.filter(
        (diagram) => diagram.nativeStatus.kind === "skipped",
      )

      if (diagrams.length === 0) {
        ctx.ui.notify(
          "No Mermaid diagrams found in recent assistant messages.",
          "info",
        )
        return
      }
      if (skippedDiagrams.length === 0) {
        ctx.ui.notify("No skipped Mermaid diagrams found.", "info")
        return
      }

      let selected = skippedDiagrams[0]
      if (ctx.mode === "tui" && skippedDiagrams.length > 1) {
        const labels = skippedDiagrams.map(pickerLabel)
        const choice = await ctx.ui.select(
          "Open skipped Mermaid diagram:",
          labels,
        )
        if (!choice) return
        selected = skippedDiagrams[labels.indexOf(choice)]
      }

      if (!selected) return

      const imageCapabilities = getCapabilities()
      const canDisplayInHerdr =
        ctx.mode === "tui" &&
        Boolean(process.env["HERDR_PANE_ID"]) &&
        imageCapabilities.images === "kitty"
      const canDisplayInTerminal =
        ctx.mode === "tui" && Boolean(imageCapabilities.images)
      const temporaryDirectory = canDisplayInTerminal
        ? await mkdtemp(path.join(os.tmpdir(), "pi-mermaid-open-"))
        : undefined
      const pngPath = temporaryDirectory
        ? path.join(temporaryDirectory, "diagram.png")
        : await createPngArtifactPath(selected)

      if (ctx.mode === "tui") {
        ctx.ui.setWidget("pi-mermaid-open", (tui, theme) => {
          const color = (text: string) => theme.fg("dim", text)
          return new CancellableLoader(
            tui,
            color,
            color,
            "rendering Mermaid...",
          )
        })
      }

      let handedOffToHerdr = false
      try {
        const renderResult = await renderMermaidToPng(selected.source, pngPath)
        if (!renderResult.ok) {
          ctx.ui.notify(
            `Mermaid render failed\nError: ${renderResult.error ?? "Unknown error"}`,
            "error",
          )
          return
        }

        if (canDisplayInHerdr) {
          handedOffToHerdr = await showPngInHerdrOverlay(pngPath)
          if (handedOffToHerdr) return
          ctx.ui.notify(
            "Herdr overlay unavailable; opening Mermaid in Pi instead.",
            "warning",
          )
        }

        if (ctx.mode !== "tui" || !canDisplayInTerminal) {
          ctx.ui.notify(
            canDisplayInTerminal
              ? `Rendered Mermaid PNG: ${pngPath}`
              : `Saved Mermaid PNG: ${pngPath}\nKitty graphics are unavailable.`,
            canDisplayInTerminal ? "info" : "warning",
          )
          return
        }

        await showPngInTerminal(ctx, pngPath, selected)
      } finally {
        if (ctx.mode === "tui") {
          ctx.ui.setWidget("pi-mermaid-open", undefined)
        }
        if (temporaryDirectory && !handedOffToHerdr) {
          await rm(temporaryDirectory, { recursive: true, force: true })
        }
      }
    },
  })
}
