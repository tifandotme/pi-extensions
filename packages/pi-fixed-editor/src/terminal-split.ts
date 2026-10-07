/* eslint-disable no-control-regex */
import {
  isKeyRelease,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui"
import type { Component } from "@earendil-works/pi-tui"
import type { FixedEditorClusterRender } from "./cluster.ts"

export interface TerminalLike {
  columns: number
  rows: number
  kittyProtocolActive?: boolean
  write(data: string): void
}

interface TuiLike {
  children: Component[]
  requestRender?: (force?: boolean) => void
  doRender?: () => void
  render?: (width: number) => string[]
  compositeLineAt?: CompositeLineAt
  hardwareCursorRow?: number
  cursorRow?: number
  previousViewportTop?: number
  addInputListener?: (
    listener: (
      data: string,
    ) => { consume?: boolean; data?: string } | undefined,
  ) => () => void
  hasOverlay?: () => boolean
  overlayStack?: { hidden?: boolean }[]
}

interface TerminalSplitCompositorOptions {
  tui: TuiLike
  terminal: TerminalLike
  renderCluster: (
    width: number,
    terminalRows: number,
  ) => FixedEditorClusterRender
  getShowHardwareCursor?: () => boolean
  mouseScroll?: boolean
  onCopySelection?: (text: string) => void
}

interface PatchedRenderable {
  render(width: number): string[]
}

interface RenderPatch {
  target: PatchedRenderable
  originalRender: (width: number) => string[]
}

interface RenderPassCluster {
  width: number
  terminalRows: number
  cluster: FixedEditorClusterRender
}

type CompositeLineAt = (
  baseLine: string,
  overlayLine: string,
  startCol: number,
  overlayWidth: number,
  totalWidth: number,
) => string

interface SgrMousePacket {
  code: number
  col: number
  row: number
  final: "M" | "m"
}

interface SelectionPoint {
  line: number
  col: number
}

type SelectionArea = "root" | "cluster"

interface SelectionLocation {
  area: SelectionArea
  point: SelectionPoint
}

interface DisposeOptions {
  resetExtendedKeyboardModes?: boolean
}

type ExtendedKeyboardMode = "kitty" | "modifyOtherKeys"

interface FixedClusterPaintSnapshot {
  terminalRows: number
  width: number
  startRow: number
  lines: string[]
}

interface FixedClusterPaintDelta {
  clearBefore: string
  paintAfter: string
  snapshot: FixedClusterPaintSnapshot | null
}

const SYNCHRONIZED_OUTPUT_BEGIN = "\x1b[?2026h"
const SYNCHRONIZED_OUTPUT_END = "\x1b[?2026l"
const SCREEN_INVALIDATION_PATTERN =
  /(?:\u001bc|\u001b\[[0-?]*[ -/]*J|\u001b\[\?(?:47|1047|1049)[hl])/

const PAGE_UP_PATTERN =
  /^\u001b\[(?:5;9(?::[12])?~|1;6(?::[12])?A|57421;9(?::[12])?u|57419;6(?::[12])?u)$/
const PAGE_DOWN_PATTERN =
  /^\u001b\[(?:6;9(?::[12])?~|1;6(?::[12])?B|57422;9(?::[12])?u|57420;6(?::[12])?u)$/
const SGR_MOUSE_PATTERN = /\u001b\[<(\d+);(\d+);(\d+)([Mm])/g
const OSC_PATTERN = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

const CONTEXT_MENU_MOUSE_REPORTING_PAUSE_MS = 1200
const CONTEXT_MENU_SELECTION_RESTORE_WINDOW_MS = 5000
const CONTEXT_MENU_CLIPBOARD_RESTORE_INTERVAL_MS = 100
const DOUBLE_CLICK_MS = 500

export function beginSynchronizedOutput(): string {
  return SYNCHRONIZED_OUTPUT_BEGIN
}

export function endSynchronizedOutput(): string {
  return SYNCHRONIZED_OUTPUT_END
}

function stripSynchronizedOutputMarkers(data: string): string {
  return data
    .replaceAll(SYNCHRONIZED_OUTPUT_BEGIN, "")
    .replaceAll(SYNCHRONIZED_OUTPUT_END, "")
}

export function setScrollRegion(top: number, bottom: number): string {
  return `\x1b[${top};${bottom}r`
}

export function resetScrollRegion(): string {
  return "\x1b[r"
}

export function moveCursor(row: number, col: number): string {
  return `\x1b[${row};${col}H`
}

function clearLine(): string {
  return "\x1b[2K"
}

function hideCursor(): string {
  return "\x1b[?25l"
}

function showCursor(): string {
  return "\x1b[?25h"
}

function enterAlternateScreen(): string {
  return "\x1b[?1049h"
}

function exitAlternateScreen(): string {
  return "\x1b[?1049l"
}

function enableAlternateScrollMode(): string {
  return "\x1b[?1007h"
}

function disableAlternateScrollMode(): string {
  return "\x1b[?1007l"
}

function disableAutoWrap(): string {
  return "\x1b[?7l"
}

function enableAutoWrap(): string {
  return "\x1b[?7h"
}

function enableMouseReporting(): string {
  return "\x1b[?1002h\x1b[?1006h"
}

function disableMouseReporting(): string {
  return "\x1b[?1006l\x1b[?1002l\x1b[?1000l"
}

function enableExtendedKeyboardMode(mode: ExtendedKeyboardMode): string {
  return mode === "kitty" ? "\x1b[>7u" : "\x1b[>4;2m"
}

function disableExtendedKeyboardMode(mode: ExtendedKeyboardMode): string {
  return mode === "kitty" ? "\x1b[<u" : "\x1b[>4;0m"
}

function resetExtendedKeyboardModes(): string {
  return "\x1b[<999u\x1b[>4;0m"
}

export function emergencyTerminalModeReset(): string {
  return (
    beginSynchronizedOutput() +
    resetScrollRegion() +
    disableMouseReporting() +
    enableAlternateScrollMode() +
    exitAlternateScreen() +
    resetExtendedKeyboardModes() +
    endSynchronizedOutput()
  )
}

function isRootSubmitInput(data: string): boolean {
  return (
    !isKeyRelease(data) &&
    (matchesKey(data, "enter") || matchesKey(data, "return"))
  )
}

function parseKeyboardScrollDelta(data: string): number {
  if (isKeyRelease(data)) return 0

  if (
    matchesKey(data, "pageUp") ||
    matchesKey(data, "ctrl+shift+up") ||
    PAGE_UP_PATTERN.test(data)
  )
    return 10
  if (
    matchesKey(data, "pageDown") ||
    matchesKey(data, "ctrl+shift+down") ||
    PAGE_DOWN_PATTERN.test(data)
  )
    return -10
  return 0
}

function parseSgrMousePackets(data: string): SgrMousePacket[] | null {
  SGR_MOUSE_PATTERN.lastIndex = 0
  const packets: SgrMousePacket[] = []
  let offset = 0

  for (const match of data.matchAll(SGR_MOUSE_PATTERN)) {
    if (match.index !== offset) return null
    offset = match.index + match[0].length
    packets.push({
      code: Number(match[1]),
      col: Number(match[2]),
      row: Number(match[3]),
      final: match[4] as "M" | "m",
    })
  }

  return packets.length > 0 && offset === data.length ? packets : null
}

function mouseBaseButton(code: number): number {
  return code & ~(4 | 8 | 16 | 32)
}

function mouseScrollDelta(packet: SgrMousePacket): number {
  if (packet.final !== "M") return 0
  const baseButton = mouseBaseButton(packet.code)
  if (baseButton === 64) return 3
  if (baseButton === 65) return -3
  return 0
}

function isLeftPress(packet: SgrMousePacket): boolean {
  return (
    packet.final === "M" &&
    mouseBaseButton(packet.code) === 0 &&
    (packet.code & 32) === 0
  )
}

function isLeftDrag(packet: SgrMousePacket): boolean {
  return (
    packet.final === "M" &&
    mouseBaseButton(packet.code) === 0 &&
    (packet.code & 32) !== 0
  )
}

function isRightPress(packet: SgrMousePacket): boolean {
  return (
    packet.final === "M" &&
    mouseBaseButton(packet.code) === 2 &&
    (packet.code & 32) === 0
  )
}

function isMouseRelease(packet: SgrMousePacket): boolean {
  return packet.final === "m"
}

function stripOscSequences(line: string): string {
  return line.replace(OSC_PATTERN, "")
}

function stripAnsi(line: string): string {
  return stripOscSequences(line).replace(ANSI_PATTERN, "")
}

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
})

function sliceColumns(text: string, startCol: number, endCol: number): string {
  let col = 0
  let result = ""
  for (const { segment } of graphemeSegmenter.segment(text)) {
    const width = Math.max(0, visibleWidth(segment))
    if (col >= startCol && col < endCol) {
      result += segment
    }
    col += width
  }
  return result
}

function compareSelectionPoints(a: SelectionPoint, b: SelectionPoint): number {
  return a.line === b.line ? a.col - b.col : a.line - b.line
}

function descriptorForRows(
  terminal: TerminalLike,
): PropertyDescriptor | undefined {
  let target: object | null = terminal
  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, "rows")
    if (descriptor) return descriptor
    target = Object.getPrototypeOf(target)
  }

  return undefined
}

function readRows(
  terminal: TerminalLike,
  descriptor: PropertyDescriptor | undefined,
): number {
  if (descriptor?.get) {
    const value = descriptor.get.call(terminal)
    return typeof value === "number" && Number.isFinite(value) ? value : 24
  }
  if (descriptor && "value" in descriptor) {
    const value = descriptor.value
    return typeof value === "number" && Number.isFinite(value) ? value : 24
  }

  const value = Reflect.get(terminal, "rows")
  return typeof value === "number" && Number.isFinite(value) ? value : 24
}

function sanitizeLine(line: string, width: number): string {
  return visibleWidth(line) > width
    ? truncateToWidth(line, width, "", true)
    : line
}

function createFixedClusterPaintSnapshot(
  cluster: FixedEditorClusterRender,
  terminalRows: number,
  width: number,
): FixedClusterPaintSnapshot | null {
  if (cluster.lines.length === 0) return null

  return {
    terminalRows,
    width,
    startRow: Math.max(1, terminalRows - cluster.lines.length + 1),
    lines: cluster.lines.map((line) => sanitizeLine(line, width)),
  }
}

function fixedClusterRows(
  snapshot: FixedClusterPaintSnapshot | null,
): Map<number, string> {
  const rows = new Map<number, string>()
  if (!snapshot) return rows

  for (let index = 0; index < snapshot.lines.length; index++) {
    rows.set(snapshot.startRow + index, snapshot.lines[index] ?? "")
  }
  return rows
}

function buildFixedClusterPaintDelta(
  previous: FixedClusterPaintSnapshot | null,
  cluster: FixedEditorClusterRender,
  terminalRows: number,
  width: number,
  showHardwareCursor: boolean,
  forcePaint = false,
): FixedClusterPaintDelta {
  const snapshot = createFixedClusterPaintSnapshot(cluster, terminalRows, width)
  const previousRows = fixedClusterRows(previous)
  const currentRows = fixedClusterRows(snapshot)
  const geometryChanged =
    previous !== null &&
    (previous.terminalRows !== terminalRows || previous.width !== width)
  const repaintAll = forcePaint || previous === null || geometryChanged

  let clearBefore = ""
  for (const row of previousRows.keys()) {
    if (row > terminalRows || currentRows.has(row)) continue
    if (clearBefore.length === 0) clearBefore = resetScrollRegion()
    clearBefore += moveCursor(row, 1) + clearLine()
  }

  let paintAfter = resetScrollRegion()
  for (const [row, line] of currentRows) {
    if (!repaintAll && previousRows.get(row) === line) continue
    paintAfter += moveCursor(row, 1) + clearLine() + line
  }

  if (snapshot && cluster.cursor && showHardwareCursor) {
    paintAfter += moveCursor(
      snapshot.startRow + cluster.cursor.row,
      Math.max(1, cluster.cursor.col + 1),
    )
    paintAfter += showCursor()
  } else if (snapshot || previous) {
    paintAfter += hideCursor()
  }

  return { clearBefore, paintAfter, snapshot }
}

function sanitizeOverlayBaseLine(line: string, width: number): string {
  return sanitizeLine(stripOscSequences(line), width)
}

function normalizeOverlayCompositionLine(line: string): string {
  return line.includes("\t") ? line.replace(/\t/g, "   ") : line
}

export function buildFixedClusterPaint(
  cluster: FixedEditorClusterRender,
  terminalRows: number,
  width: number,
  showHardwareCursor: boolean,
): string {
  if (cluster.lines.length === 0) return ""

  return buildFixedClusterPaintDelta(
    null,
    cluster,
    terminalRows,
    width,
    showHardwareCursor,
    true,
  ).paintAfter
}

export class TerminalSplitCompositor {
  private readonly tui: TuiLike
  private readonly terminal: TerminalLike
  private readonly renderCluster: (
    width: number,
    terminalRows: number,
  ) => FixedEditorClusterRender
  private readonly getShowHardwareCursor: () => boolean
  private readonly mouseScroll: boolean
  private readonly onCopySelection: ((text: string) => void) | null
  private extendedKeyboardMode: ExtendedKeyboardMode | null = null
  private readonly rowsDescriptor: PropertyDescriptor | undefined
  private readonly originalWrite: (data: string) => void
  private readonly originalDoRender: (() => void) | null
  private readonly originalRender: ((width: number) => string[]) | null
  private originalCompositeLineAt: CompositeLineAt | null = null
  private readonly patchedRenders: RenderPatch[] = []
  private removeInputListener: (() => void) | null = null
  private emergencyCleanup: (() => void) | null = null
  private mouseReportingResumeTimer: ReturnType<typeof setTimeout> | null = null
  private clipboardRestoreTimer: ReturnType<typeof setTimeout> | null = null
  private installed = false
  private disposed = false
  private writing = false
  private renderPassActive = false
  private renderPassPaintedCluster = false
  private renderPassCluster: RenderPassCluster | null = null
  private paintedFixedCluster: FixedClusterPaintSnapshot | null = null
  private renderingCluster = false
  private renderingScrollableRoot = false
  private checkingOverlay = false
  private scrollOffset = 0
  private maxScrollOffset = 0
  private lastRootLineCount = 0
  private rootLines: string[] = []
  private visibleRootStart = 0
  private visibleScrollableRows = 0
  private visibleRootLines: string[] = []
  private visibleClusterLines: string[] = []
  private selectionArea: SelectionArea | null = null
  private selectionAnchor: SelectionPoint | null = null
  private selectionFocus: SelectionPoint | null = null
  private selectionDragging = false
  private preserveSelectionFocusOnRelease = false
  private lastLeftPress: {
    area: SelectionArea
    line: number
    at: number
  } | null = null

  constructor(options: TerminalSplitCompositorOptions) {
    this.tui = options.tui
    this.terminal = options.terminal
    this.renderCluster = options.renderCluster
    this.getShowHardwareCursor = options.getShowHardwareCursor ?? (() => false)
    this.mouseScroll = options.mouseScroll !== false
    this.onCopySelection = options.onCopySelection ?? null
    this.rowsDescriptor = descriptorForRows(options.terminal)
    this.originalWrite = options.terminal.write.bind(options.terminal)
    this.originalDoRender =
      typeof options.tui.doRender === "function"
        ? options.tui.doRender.bind(options.tui)
        : null
    this.originalRender =
      typeof options.tui.render === "function"
        ? options.tui.render.bind(options.tui)
        : null
  }

  install(): void {
    if (this.installed) return
    if (typeof this.terminal.write !== "function") {
      throw new Error(
        "[pi-fixed-editor] expected terminal.write(data) to exist",
      )
    }

    this.originalWrite(
      beginSynchronizedOutput() +
        enterAlternateScreen() +
        this.enableAlternateScreenKeyboardMode() +
        disableAlternateScrollMode() +
        this.mouseReportingStateGuard() +
        endSynchronizedOutput(),
    )
    this.emergencyCleanup = () => {
      if (!this.disposed) {
        this.restoreTerminalStateForExit()
      }
    }
    process.once("exit", this.emergencyCleanup)

    Object.defineProperty(this.terminal, "rows", {
      configurable: true,
      get: () => this.getScrollableRows(),
    })

    if (this.originalRender) {
      this.tui.render = (width: number) => this.renderScrollableRoot(width)
    }

    if (typeof this.tui.addInputListener === "function") {
      this.removeInputListener = this.tui.addInputListener((data: string) =>
        this.handleInput(data),
      )
    }

    this.terminal.write = (data: string) => this.write(data)
    if (this.originalDoRender) {
      this.tui.doRender = () => {
        this.renderPassActive = true
        this.renderPassPaintedCluster = false
        this.renderPassCluster = null
        try {
          this.originalDoRender?.()
          if (!this.renderPassPaintedCluster) this.requestRepaint()
        } finally {
          this.renderPassActive = false
          this.renderPassCluster = null
        }
      }
    }
    if (typeof this.tui.compositeLineAt === "function") {
      this.originalCompositeLineAt = this.tui.compositeLineAt.bind(
        this.tui,
      ) as CompositeLineAt
      this.tui.compositeLineAt = (
        baseLine: string,
        overlayLine: string,
        startCol: number,
        overlayWidth: number,
        totalWidth: number,
      ) =>
        this.originalCompositeLineAt?.(
          normalizeOverlayCompositionLine(baseLine),
          normalizeOverlayCompositionLine(overlayLine),
          startCol,
          overlayWidth,
          totalWidth,
        ) ?? ""
    }
    this.installed = true
  }

  hideRenderable(target: PatchedRenderable): void {
    if (this.patchedRenders.some((patch) => patch.target === target)) return
    const originalRender = target.render.bind(target)
    this.patchedRenders.push({ target, originalRender })
    target.render = () => []
  }

  renderHidden(target: PatchedRenderable, width: number): string[] {
    const patch = this.patchedRenders.find(
      (candidate) => candidate.target === target,
    )
    const render = patch?.originalRender ?? target.render.bind(target)
    return render(width)
  }

  jumpToPreviousRootTarget(targetLines: readonly number[]): boolean {
    return this.jumpToRootTarget(targetLines, "previous")
  }

  jumpToNextRootTarget(targetLines: readonly number[]): boolean {
    return this.jumpToRootTarget(targetLines, "next")
  }

  jumpToRootBottom(): boolean {
    if (this.disposed || this.hasVisibleOverlay() || this.scrollOffset === 0)
      return false

    this.clearSelection()
    this.lastLeftPress = null
    this.scrollOffset = 0
    this.requestRender()
    return true
  }

  private jumpToRootTarget(
    targetLines: readonly number[],
    direction: "previous" | "next",
  ): boolean {
    if (this.disposed || targetLines.length === 0 || this.hasVisibleOverlay())
      return false

    const start = this.visibleRootStart
    const candidates =
      direction === "previous"
        ? targetLines.filter((line) => line < start).toSorted((a, b) => b - a)
        : targetLines.filter((line) => line > start).toSorted((a, b) => a - b)

    for (const target of candidates) {
      const nextOffset = Math.max(
        0,
        Math.min(
          this.lastRootLineCount -
            Math.max(1, this.visibleScrollableRows) -
            target,
          this.maxScrollOffset,
        ),
      )
      if (nextOffset === this.scrollOffset) continue

      this.clearSelection()
      this.lastLeftPress = null
      this.scrollOffset = nextOffset
      this.requestRender()
      return true
    }

    return false
  }

  requestRepaint(): void {
    if (this.disposed || this.hasVisibleOverlay()) return
    const rawRows = this.getRawRows()
    const width = Math.max(1, this.terminal.columns || 80)
    const cluster = this.decorateCluster(this.getCluster(width, rawRows))
    if (cluster.lines.length === 0 && !this.paintedFixedCluster) return

    const delta = buildFixedClusterPaintDelta(
      this.paintedFixedCluster,
      cluster,
      rawRows,
      width,
      this.getShowHardwareCursor(),
    )
    this.originalWrite(
      beginSynchronizedOutput() +
        disableAutoWrap() +
        delta.clearBefore +
        delta.paintAfter +
        enableAutoWrap() +
        this.mouseReportingStateGuard() +
        endSynchronizedOutput(),
    )
    this.paintedFixedCluster = delta.snapshot
  }

  dispose(options: DisposeOptions = {}): void {
    if (this.disposed) return
    this.disposed = true

    for (const patch of this.patchedRenders.splice(0)) {
      patch.target.render = patch.originalRender
    }

    this.removeInputListener?.()
    this.removeInputListener = null
    if (this.emergencyCleanup) {
      process.removeListener("exit", this.emergencyCleanup)
      this.emergencyCleanup = null
    }
    if (this.mouseReportingResumeTimer) {
      clearTimeout(this.mouseReportingResumeTimer)
      this.mouseReportingResumeTimer = null
    }
    if (this.clipboardRestoreTimer) {
      clearTimeout(this.clipboardRestoreTimer)
      this.clipboardRestoreTimer = null
    }

    this.terminal.write = this.originalWrite
    if (this.originalDoRender) {
      this.tui.doRender = this.originalDoRender
    }
    if (this.originalRender) {
      this.tui.render = this.originalRender
    }
    if (this.originalCompositeLineAt) {
      this.tui.compositeLineAt = this.originalCompositeLineAt
      this.originalCompositeLineAt = null
    }
    if (this.rowsDescriptor) {
      Object.defineProperty(this.terminal, "rows", this.rowsDescriptor)
    } else {
      Reflect.deleteProperty(this.terminal, "rows")
    }

    this.restoreTerminalState(options)
  }

  private getRawRows(): number {
    return Math.max(2, readRows(this.terminal, this.rowsDescriptor))
  }

  private getScrollableRows(): number {
    if (
      this.disposed ||
      this.writing ||
      this.renderingCluster ||
      this.checkingOverlay ||
      this.hasVisibleOverlay()
    ) {
      return this.getRawRows()
    }

    const rawRows = this.getRawRows()
    const width = Math.max(1, this.terminal.columns || 80)
    const cluster = this.getCluster(width, rawRows)
    return Math.max(1, rawRows - cluster.lines.length)
  }

  private renderScrollableRoot(width: number): string[] {
    if (!this.originalRender || this.disposed || this.renderingScrollableRoot) {
      return this.originalRender?.(width) ?? []
    }

    if (this.hasVisibleOverlay()) {
      return this.originalRender(width).map((line) =>
        sanitizeOverlayBaseLine(line, Math.max(1, width)),
      )
    }

    this.renderingScrollableRoot = true
    try {
      const start = this.refreshRootWindow(width)
      return this.visibleRootLines.map((line, index) => {
        return this.renderSelectionHighlight(line, start + index, "root")
      })
    } finally {
      this.renderingScrollableRoot = false
    }
  }

  private refreshRootWindow(width: number): number {
    if (!this.originalRender) return this.updateVisibleRootWindow()

    const rawRows = this.getRawRows()
    const renderWidth = Math.max(1, width)
    const cluster = this.getCluster(renderWidth, rawRows)
    const scrollableRows = Math.max(1, rawRows - cluster.lines.length)
    const lines = this.originalRender(renderWidth)
    this.rootLines = lines
    if (
      this.scrollOffset > 0 &&
      this.lastRootLineCount > 0 &&
      lines.length > this.lastRootLineCount
    ) {
      this.scrollOffset += lines.length - this.lastRootLineCount
    }
    this.lastRootLineCount = lines.length
    this.maxScrollOffset = Math.max(0, lines.length - scrollableRows)
    this.scrollOffset = Math.max(
      0,
      Math.min(this.scrollOffset, this.maxScrollOffset),
    )

    return this.updateVisibleRootWindow(scrollableRows)
  }

  private handleInput(
    data: string,
  ): { consume?: boolean; data?: string } | undefined {
    if (this.disposed || this.hasVisibleOverlay()) return undefined

    const mousePackets = this.mouseScroll ? parseSgrMousePackets(data) : null
    if (mousePackets) {
      for (const packet of mousePackets) {
        this.handleMousePacket(packet)
      }
      return { consume: true }
    }

    if (isRootSubmitInput(data)) {
      this.jumpToRootBottom()
      return undefined
    }

    const keyboardDelta = parseKeyboardScrollDelta(data)
    if (keyboardDelta === 0) return undefined

    this.scrollBy(keyboardDelta)
    return { consume: true }
  }

  private handleMousePacket(packet: SgrMousePacket): void {
    const delta = mouseScrollDelta(packet)
    if (delta !== 0) {
      this.selectionDragging = false
      this.scrollBy(delta)
      return
    }

    const location = this.selectionLocationForPacket(packet)

    if (isRightPress(packet)) {
      this.selectionDragging = false
      this.preserveSelectionFocusOnRelease = false
      const selectedText = this.isLocationInsideSelection(location)
        ? this.getSelectedText()
        : ""
      if (selectedText) {
        this.onCopySelection?.(selectedText)
        this.lastLeftPress = null
        this.pauseMouseReportingForContextMenu(selectedText)
        return
      }

      this.clearSelection()
      this.lastLeftPress = null
      this.pauseMouseReportingForContextMenu()
      return
    }

    if (this.scrollSelectionAtViewportEdge(packet)) return
    if (this.selectionDragging && isMouseRelease(packet)) {
      this.finishSelection(packet, location)
      return
    }

    if (!location) return

    if (isLeftPress(packet)) {
      this.startSelection(location)
      return
    }

    if (
      this.selectionDragging &&
      isLeftDrag(packet) &&
      location.area === this.selectionArea
    ) {
      this.lastLeftPress = null
      this.preserveSelectionFocusOnRelease = false
      this.selectionFocus = location.point
      this.requestRender()
      return
    }
  }

  private updateVisibleRootWindow(
    scrollableRows = this.visibleScrollableRows,
  ): number {
    const rows = Math.max(1, scrollableRows)
    const start = Math.max(0, this.rootLines.length - rows - this.scrollOffset)
    const visibleLines = this.rootLines.slice(start, start + rows)
    while (visibleLines.length < rows) {
      visibleLines.push("")
    }

    this.visibleRootStart = start
    this.visibleScrollableRows = rows
    this.visibleRootLines = visibleLines
    return start
  }

  private finishSelection(
    packet: SgrMousePacket,
    location: SelectionLocation | null,
  ): void {
    if (!this.preserveSelectionFocusOnRelease) {
      this.selectionFocus =
        location?.area === this.selectionArea
          ? location.point
          : this.clampedSelectionPointForPacket(packet, this.selectionArea)
    }

    this.preserveSelectionFocusOnRelease = false
    this.selectionDragging = false
    const selectedText = this.getSelectedText()
    if (selectedText) {
      this.lastLeftPress = null
      this.onCopySelection?.(selectedText)
    } else {
      this.clearSelection()
    }
    this.requestRender()
  }

  private startSelection(location: SelectionLocation): void {
    const now = Date.now()
    const line = location.point.line
    if (
      this.lastLeftPress &&
      this.lastLeftPress.area === location.area &&
      this.lastLeftPress.line === line &&
      now - this.lastLeftPress.at <= DOUBLE_CLICK_MS
    ) {
      this.selectionArea = location.area
      this.selectionAnchor = { line, col: 0 }
      this.selectionFocus = {
        line,
        col: this.selectionLineWidth(location.area, line),
      }
      this.selectionDragging = true
      this.preserveSelectionFocusOnRelease = true
      this.lastLeftPress = null
      this.requestRender()
      return
    }

    this.selectionArea = location.area
    this.selectionAnchor = location.point
    this.selectionFocus = location.point
    this.selectionDragging = true
    this.preserveSelectionFocusOnRelease = false
    this.lastLeftPress = { area: location.area, line, at: now }
    this.requestRender()
  }

  private selectionLocationForPacket(
    packet: SgrMousePacket,
  ): SelectionLocation | null {
    if (packet.row < 1) return null

    const col = Math.max(0, packet.col - 1)
    if (packet.row <= this.visibleScrollableRows) {
      return {
        area: "root",
        point: { line: this.visibleRootStart + packet.row - 1, col },
      }
    }

    const clusterLine = packet.row - this.visibleScrollableRows - 1
    if (clusterLine >= this.visibleClusterLines.length) return null

    return {
      area: "cluster",
      point: { line: clusterLine, col },
    }
  }

  private scrollSelectionAtViewportEdge(packet: SgrMousePacket): boolean {
    if (
      !this.selectionDragging ||
      this.selectionArea !== "root" ||
      !isLeftDrag(packet)
    )
      return false

    const delta =
      packet.row <= 1 ? 1 : packet.row >= this.visibleScrollableRows ? -1 : 0
    if (delta === 0) return false

    const nextOffset = Math.max(
      0,
      Math.min(this.scrollOffset + delta, this.maxScrollOffset),
    )
    if (nextOffset === this.scrollOffset) return false

    this.lastLeftPress = null
    this.preserveSelectionFocusOnRelease = true
    this.scrollOffset = nextOffset
    const start = this.updateVisibleRootWindow()
    const edgeLine =
      delta > 0 ? start : start + Math.max(0, this.visibleScrollableRows - 1)
    this.selectionFocus = {
      line: edgeLine,
      col: Math.max(0, packet.col - 1),
    }
    this.requestRender()
    return true
  }

  private clampedSelectionPointForPacket(
    packet: SgrMousePacket,
    area: SelectionArea | null,
  ): SelectionPoint {
    if (area === "cluster") {
      return {
        line: Math.max(
          0,
          Math.min(
            packet.row - this.visibleScrollableRows - 1,
            this.visibleClusterLines.length - 1,
          ),
        ),
        col: Math.max(0, packet.col - 1),
      }
    }

    const row = Math.max(1, Math.min(packet.row, this.visibleScrollableRows))
    return {
      line: this.visibleRootStart + row - 1,
      col: Math.max(0, packet.col - 1),
    }
  }

  private renderSelectionHighlight(
    line: string,
    lineIndex: number,
    area: SelectionArea,
  ): string {
    const range = this.getSelectionRangeForLine(lineIndex, area)
    if (!range) return line

    const plain = stripAnsi(line)
    const startCol = Math.max(0, Math.min(range.startCol, visibleWidth(plain)))
    const endCol = Math.max(
      startCol,
      Math.min(range.endCol, visibleWidth(plain)),
    )
    if (startCol === endCol) return line

    const before = sliceColumns(plain, 0, startCol)
    const selected = sliceColumns(plain, startCol, endCol)
    const after = sliceColumns(plain, endCol, Number.POSITIVE_INFINITY)
    return `${before}\x1b[7m${selected}\x1b[27m${after}`
  }

  private selectionLineWidth(area: SelectionArea, lineIndex: number): number {
    const lines =
      area === "root" ? this.visibleRootLines : this.visibleClusterLines
    const firstLine = area === "root" ? this.visibleRootStart : 0
    return visibleWidth(stripAnsi(lines[lineIndex - firstLine] ?? ""))
  }

  private getSelectedText(): string {
    if (!this.selectionArea || !this.selectionAnchor || !this.selectionFocus)
      return ""

    const start =
      compareSelectionPoints(this.selectionAnchor, this.selectionFocus) <= 0
        ? this.selectionAnchor
        : this.selectionFocus
    const end =
      start === this.selectionAnchor
        ? this.selectionFocus
        : this.selectionAnchor
    if (start.line === end.line && start.col === end.col) return ""

    const lines =
      this.selectionArea === "root" ? this.rootLines : this.visibleClusterLines
    const selected: string[] = []
    for (let lineIndex = start.line; lineIndex <= end.line; lineIndex++) {
      const line = stripAnsi(lines[lineIndex] ?? "")
      const startCol = lineIndex === start.line ? start.col : 0
      const endCol = lineIndex === end.line ? end.col : Number.POSITIVE_INFINITY
      selected.push(sliceColumns(line, startCol, endCol))
    }

    return selected
      .join("\n")
      .replace(/[ \t]+$/gm, "")
      .trimEnd()
  }

  private getSelectionRangeForLine(
    lineIndex: number,
    area: SelectionArea,
  ): { startCol: number; endCol: number } | null {
    if (
      this.selectionArea !== area ||
      !this.selectionAnchor ||
      !this.selectionFocus
    )
      return null

    const start =
      compareSelectionPoints(this.selectionAnchor, this.selectionFocus) <= 0
        ? this.selectionAnchor
        : this.selectionFocus
    const end =
      start === this.selectionAnchor
        ? this.selectionFocus
        : this.selectionAnchor
    if (lineIndex < start.line || lineIndex > end.line) return null

    return {
      startCol: lineIndex === start.line ? start.col : 0,
      endCol: lineIndex === end.line ? end.col : Number.POSITIVE_INFINITY,
    }
  }

  private isLocationInsideSelection(
    location: SelectionLocation | null,
  ): boolean {
    if (!location || location.area !== this.selectionArea) return false
    const range = this.getSelectionRangeForLine(
      location.point.line,
      location.area,
    )
    return Boolean(
      range &&
      location.point.col >= range.startCol &&
      location.point.col < range.endCol,
    )
  }

  private scrollBy(delta: number): void {
    if (this.lastRootLineCount === 0) {
      this.refreshRootWindow(Math.max(1, this.terminal.columns || 80))
    }

    const nextOffset = Math.max(
      0,
      Math.min(this.scrollOffset + delta, this.maxScrollOffset),
    )
    if (nextOffset === this.scrollOffset) return

    this.clearSelection()
    this.lastLeftPress = null
    this.scrollOffset = nextOffset
    this.requestRender()
  }

  private requestRender(): void {
    if (typeof this.tui.requestRender === "function") {
      this.tui.requestRender()
    }
  }

  private pauseMouseReportingForContextMenu(
    textToRestoreToClipboard: string | null = null,
  ): void {
    if (this.mouseReportingResumeTimer) {
      clearTimeout(this.mouseReportingResumeTimer)
    }
    if (this.clipboardRestoreTimer) {
      clearTimeout(this.clipboardRestoreTimer)
      this.clipboardRestoreTimer = null
    }

    this.originalWrite(
      beginSynchronizedOutput() +
        disableMouseReporting() +
        endSynchronizedOutput(),
    )
    this.mouseReportingResumeTimer = setTimeout(() => {
      this.mouseReportingResumeTimer = null
      if (!this.disposed) {
        this.originalWrite(
          beginSynchronizedOutput() +
            enableMouseReporting() +
            endSynchronizedOutput(),
        )
      }
    }, CONTEXT_MENU_MOUSE_REPORTING_PAUSE_MS)

    if (
      typeof this.mouseReportingResumeTimer === "object" &&
      "unref" in this.mouseReportingResumeTimer
    ) {
      this.mouseReportingResumeTimer.unref()
    }

    const restoreClipboard = this.onCopySelection
    if (!textToRestoreToClipboard || !restoreClipboard) return

    let remainingRestores = Math.ceil(
      CONTEXT_MENU_SELECTION_RESTORE_WINDOW_MS /
        CONTEXT_MENU_CLIPBOARD_RESTORE_INTERVAL_MS,
    )
    const scheduleClipboardRestore = () => {
      this.clipboardRestoreTimer = setTimeout(() => {
        this.clipboardRestoreTimer = null
        if (this.disposed) return

        remainingRestores -= 1
        if (this.getSelectedText() !== textToRestoreToClipboard) return

        restoreClipboard(textToRestoreToClipboard)
        if (remainingRestores > 0) {
          scheduleClipboardRestore()
        }
      }, CONTEXT_MENU_CLIPBOARD_RESTORE_INTERVAL_MS)

      if (
        typeof this.clipboardRestoreTimer === "object" &&
        "unref" in this.clipboardRestoreTimer
      ) {
        this.clipboardRestoreTimer.unref()
      }
    }

    scheduleClipboardRestore()
  }

  private clearSelection(): void {
    this.selectionArea = null
    this.selectionAnchor = null
    this.selectionFocus = null
    this.selectionDragging = false
    this.preserveSelectionFocusOnRelease = false
  }

  private activeExtendedKeyboardMode(): ExtendedKeyboardMode | null {
    if (this.terminal.kittyProtocolActive === true) return "kitty"
    if (Reflect.get(this.terminal, "_modifyOtherKeysActive") === true)
      return "modifyOtherKeys"
    return null
  }

  private enableAlternateScreenKeyboardMode(): string {
    this.extendedKeyboardMode = this.activeExtendedKeyboardMode()
    return this.extendedKeyboardMode
      ? enableExtendedKeyboardMode(this.extendedKeyboardMode)
      : ""
  }

  private restoreTerminalState(options: DisposeOptions = {}): void {
    const activeMode =
      this.extendedKeyboardMode ?? this.activeExtendedKeyboardMode()
    const restoreMainScreenMode =
      !options.resetExtendedKeyboardModes &&
      this.extendedKeyboardMode === null &&
      activeMode !== null

    this.originalWrite(
      beginSynchronizedOutput() +
        resetScrollRegion() +
        (this.mouseScroll ? disableMouseReporting() : "") +
        (activeMode ? disableExtendedKeyboardMode(activeMode) : "") +
        enableAlternateScrollMode() +
        exitAlternateScreen() +
        (restoreMainScreenMode && activeMode
          ? enableExtendedKeyboardMode(activeMode)
          : "") +
        (options.resetExtendedKeyboardModes
          ? resetExtendedKeyboardModes()
          : "") +
        endSynchronizedOutput(),
    )
  }

  private restoreTerminalStateForExit(): void {
    try {
      this.restoreTerminalState({ resetExtendedKeyboardModes: true })
    } catch {
      // Process-exit cleanup cannot report useful errors and must not throw.
    }
  }

  private write(data: string): void {
    if (this.disposed || this.writing) {
      this.originalWrite(data)
      return
    }
    if (this.hasVisibleOverlay()) {
      this.paintedFixedCluster = null
      this.originalWrite(data)
      return
    }

    this.writing = true
    try {
      const rawRows = this.getRawRows()
      const width = Math.max(1, this.terminal.columns || 80)
      const cluster = this.decorateCluster(this.getCluster(width, rawRows))
      const reservedRows = cluster.lines.length

      if (rawRows <= 2) {
        this.paintedFixedCluster = null
        this.originalWrite(data)
        return
      }
      if (reservedRows === 0 && !this.paintedFixedCluster) {
        this.originalWrite(data)
        return
      }

      const body = stripSynchronizedOutputMarkers(data)
      const delta = buildFixedClusterPaintDelta(
        this.paintedFixedCluster,
        cluster,
        rawRows,
        width,
        this.getShowHardwareCursor(),
        SCREEN_INVALIDATION_PATTERN.test(body),
      )
      const scrollBottom = Math.max(1, rawRows - reservedRows)
      const hardwareCursorRow =
        typeof this.tui.hardwareCursorRow === "number"
          ? this.tui.hardwareCursorRow
          : typeof this.tui.cursorRow === "number"
            ? this.tui.cursorRow
            : 0
      const viewportTop =
        typeof this.tui.previousViewportTop === "number"
          ? this.tui.previousViewportTop
          : 0
      const screenRow = Math.max(
        1,
        Math.min(scrollBottom, hardwareCursorRow - viewportTop + 1),
      )
      const buffer =
        beginSynchronizedOutput() +
        disableAutoWrap() +
        delta.clearBefore +
        setScrollRegion(1, scrollBottom) +
        moveCursor(screenRow, 1) +
        body +
        delta.paintAfter +
        enableAutoWrap() +
        this.mouseReportingStateGuard() +
        endSynchronizedOutput()

      this.originalWrite(buffer)
      this.paintedFixedCluster = delta.snapshot
      if (this.renderPassActive) this.renderPassPaintedCluster = true
    } finally {
      this.writing = false
    }
  }

  private mouseReportingStateGuard(): string {
    return this.mouseScroll && !this.mouseReportingResumeTimer
      ? enableMouseReporting()
      : ""
  }

  private getCluster(
    width: number,
    terminalRows: number,
  ): FixedEditorClusterRender {
    if (
      this.renderPassActive &&
      this.renderPassCluster?.width === width &&
      this.renderPassCluster.terminalRows === terminalRows
    ) {
      return this.renderPassCluster.cluster
    }

    const cluster = this.withClusterRender(() =>
      this.renderCluster(width, terminalRows),
    )
    this.visibleClusterLines = cluster.lines
    if (this.renderPassActive) {
      this.renderPassCluster = { width, terminalRows, cluster }
    }
    return cluster
  }

  private decorateCluster(
    cluster: FixedEditorClusterRender,
  ): FixedEditorClusterRender {
    if (this.selectionArea !== "cluster") return cluster

    return {
      ...cluster,
      lines: cluster.lines.map((line, index) =>
        this.renderSelectionHighlight(line, index, "cluster"),
      ),
    }
  }

  private withClusterRender<T>(render: () => T): T {
    const wasRenderingCluster = this.renderingCluster
    this.renderingCluster = true
    try {
      return render()
    } finally {
      this.renderingCluster = wasRenderingCluster
    }
  }

  private hasVisibleOverlay(): boolean {
    if (this.checkingOverlay) return false

    this.checkingOverlay = true
    try {
      if (typeof this.tui.hasOverlay === "function" && this.tui.hasOverlay()) {
        return true
      }

      const overlayStack = Reflect.get(this.tui, "overlayStack")
      if (!Array.isArray(overlayStack)) {
        return false
      }

      return overlayStack.some((entry) => entry && entry.hidden !== true)
    } finally {
      this.checkingOverlay = false
    }
  }
}
