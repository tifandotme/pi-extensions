import assert from "node:assert/strict"
import { test } from "node:test"
import {
  type Component,
  type Terminal,
  TuiMainScreen,
} from "@earendil-works/pi-tui"
import type { FixedEditorClusterRender } from "./cluster.ts"
import {
  beginSynchronizedOutput,
  buildFixedClusterPaint,
  emergencyTerminalModeReset,
  endSynchronizedOutput,
  resetScrollRegion,
  setScrollRegion,
  TerminalSplitCompositor,
  type TerminalLike,
} from "./terminal-split.ts"

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1
}

function synchronizedFrame(body: string): string {
  return beginSynchronizedOutput() + body + endSynchronizedOutput()
}

function createCompositorHarness(
  initialCluster: FixedEditorClusterRender,
  options: { showHardwareCursor?: boolean } = {},
) {
  const writes: string[] = []
  let cluster = initialCluster
  let rows = 10
  let columns = 80
  let overlayVisible = false
  const terminal: TerminalLike = {
    get columns() {
      return columns
    },
    get rows() {
      return rows
    },
    write: (data) => writes.push(data),
  }
  const tui = {
    children: [],
    cursorRow: 0,
    hardwareCursorRow: 0,
    previousViewportTop: 0,
    hasOverlay: () => overlayVisible,
  }
  const compositor = new TerminalSplitCompositor({
    tui,
    terminal,
    getShowHardwareCursor: () => options.showHardwareCursor === true,
    renderCluster: () => cluster,
  })
  compositor.install()
  writes.length = 0

  return {
    compositor,
    terminal,
    writes,
    setCluster(next: FixedEditorClusterRender) {
      cluster = next
    },
    setRows(next: number) {
      rows = next
    },
    setColumns(next: number) {
      columns = next
    },
    setOverlayVisible(next: boolean) {
      overlayVisible = next
    },
    takeWrite(): string {
      assert.equal(writes.length, 1)
      return writes.splice(0)[0] ?? ""
    },
    dispose() {
      compositor.dispose({ resetExtendedKeyboardModes: true })
    },
  }
}

test("renders terminal scroll region escape sequences", () => {
  assert.equal(setScrollRegion(1, 20), "\x1b[1;20r")
  assert.equal(resetScrollRegion(), "\x1b[r")
})

test("paints the fixed cluster at the bottom of the terminal", () => {
  const output = buildFixedClusterPaint(
    { lines: ["editor", "footer"], cursor: null },
    10,
    80,
    false,
  )

  assert.ok(output.includes("\x1b[9;1H"))
  assert.ok(output.includes("editor"))
  assert.ok(output.includes("\x1b[10;1H"))
  assert.ok(output.includes("footer"))
})

test("emergency reset restores terminal modes", () => {
  const output = emergencyTerminalModeReset()

  assert.ok(output.includes("\x1b[r"))
  assert.ok(output.includes("\x1b[?1006l"))
  assert.ok(output.includes("\x1b[?1049l"))
})

test("coalesces nested synchronized output around fixed-cluster paint", () => {
  const harness = createCompositorHarness({
    lines: ["editor", "footer"],
    cursor: null,
  })

  try {
    harness.terminal.write(synchronizedFrame("transcript"))
    const wrapped = harness.takeWrite()

    assert.equal(countOccurrences(wrapped, beginSynchronizedOutput()), 1)
    assert.equal(countOccurrences(wrapped, endSynchronizedOutput()), 1)
    assert.ok(wrapped.indexOf("transcript") < wrapped.indexOf("editor"))
    assert.ok(wrapped.indexOf("editor") < wrapped.indexOf("footer"))
    assert.ok(
      wrapped.indexOf("footer") < wrapped.indexOf(endSynchronizedOutput()),
    )

    harness.terminal.write(
      synchronizedFrame("first frame") + synchronizedFrame("second frame"),
    )
    const concatenated = harness.takeWrite()
    assert.equal(countOccurrences(concatenated, beginSynchronizedOutput()), 1)
    assert.equal(countOccurrences(concatenated, endSynchronizedOutput()), 1)
    assert.ok(concatenated.includes("first framesecond frame"))

    for (const part of [
      beginSynchronizedOutput(),
      "split frame",
      endSynchronizedOutput(),
    ]) {
      harness.terminal.write(part)
      const split = harness.takeWrite()
      assert.equal(countOccurrences(split, beginSynchronizedOutput()), 1)
      assert.equal(countOccurrences(split, endSynchronizedOutput()), 1)
    }

    harness.terminal.write("cursor-update")
    const unwrapped = harness.takeWrite()
    assert.equal(countOccurrences(unwrapped, beginSynchronizedOutput()), 1)
    assert.equal(countOccurrences(unwrapped, endSynchronizedOutput()), 1)
    assert.ok(unwrapped.includes("cursor-update"))
  } finally {
    harness.dispose()
  }
})

test("repaints only changed fixed-cluster rows", () => {
  const harness = createCompositorHarness({
    lines: ["editor", "footer"],
    cursor: null,
  })

  try {
    harness.terminal.write(synchronizedFrame("initial"))
    harness.takeWrite()

    harness.compositor.requestRepaint()
    const unchanged = harness.takeWrite()
    assert.equal(countOccurrences(unchanged, "\x1b[2K"), 0)
    assert.ok(!unchanged.includes("editor"))
    assert.ok(!unchanged.includes("footer"))
    assert.ok(unchanged.includes("\x1b[?25l"))

    harness.setCluster({ lines: ["editor", "updated footer"], cursor: null })
    harness.compositor.requestRepaint()
    const changed = harness.takeWrite()
    assert.equal(countOccurrences(changed, "\x1b[2K"), 1)
    assert.ok(!changed.includes("editor"))
    assert.ok(changed.includes("\x1b[10;1H\x1b[2Kupdated footer"))
  } finally {
    harness.dispose()
  }
})

test("clears painted rows and hides the cursor when the cluster becomes empty", () => {
  const harness = createCompositorHarness(
    { lines: ["editor", "footer"], cursor: { row: 0, col: 4 } },
    { showHardwareCursor: true },
  )

  try {
    harness.terminal.write(synchronizedFrame("initial"))
    harness.takeWrite()
    harness.setCluster({ lines: [], cursor: null })

    harness.compositor.requestRepaint()
    const output = harness.takeWrite()
    assert.equal(countOccurrences(output, "\x1b[2K"), 2)
    assert.ok(output.includes("\x1b[9;1H\x1b[2K"))
    assert.ok(output.includes("\x1b[10;1H\x1b[2K"))
    assert.ok(output.endsWith("\x1b[?2026l"))
    assert.ok(output.includes("\x1b[?25l"))
  } finally {
    harness.dispose()
  }
})

test("clears rows vacated by a shrinking cluster before transcript output", () => {
  const harness = createCompositorHarness({
    lines: ["status", "editor", "footer"],
    cursor: null,
  })

  try {
    harness.terminal.write(synchronizedFrame("initial"))
    harness.takeWrite()
    harness.setCluster({ lines: ["editor", "footer"], cursor: null })

    harness.terminal.write(synchronizedFrame("next transcript"))
    const output = harness.takeWrite()
    const clearedRow = "\x1b[8;1H\x1b[2K"

    assert.equal(countOccurrences(output, "\x1b[2K"), 1)
    assert.ok(output.includes(clearedRow))
    assert.ok(output.indexOf(clearedRow) < output.indexOf("next transcript"))
    assert.ok(!output.includes("editor"))
    assert.ok(!output.includes("footer"))
  } finally {
    harness.dispose()
  }
})

test("repaints unchanged fixed rows after display erase", () => {
  const harness = createCompositorHarness({
    lines: ["editor", "footer"],
    cursor: null,
  })

  try {
    harness.terminal.write(synchronizedFrame("initial"))
    harness.takeWrite()
    harness.terminal.write(synchronizedFrame("\x1b[2J\x1b[H\x1b[3J"))
    const output = harness.takeWrite()

    assert.equal(countOccurrences(output, beginSynchronizedOutput()), 1)
    assert.equal(countOccurrences(output, endSynchronizedOutput()), 1)
    assert.equal(countOccurrences(output, "\x1b[2K"), 2)
    assert.ok(output.includes("editor"))
    assert.ok(output.includes("footer"))
  } finally {
    harness.dispose()
  }
})

test("repaints fixed rows after alternate-screen transitions", () => {
  const harness = createCompositorHarness({
    lines: ["editor", "footer"],
    cursor: null,
  })

  try {
    harness.terminal.write(synchronizedFrame("initial"))
    harness.takeWrite()

    for (const transition of ["\x1b[?1049h", "\x1b[?1049l"]) {
      harness.terminal.write(synchronizedFrame(transition))
      const output = harness.takeWrite()
      assert.equal(countOccurrences(output, beginSynchronizedOutput()), 1)
      assert.equal(countOccurrences(output, endSynchronizedOutput()), 1)
      assert.equal(countOccurrences(output, "\x1b[2K"), 2)
      assert.ok(output.includes("editor"))
      assert.ok(output.includes("footer"))
    }
  } finally {
    harness.dispose()
  }
})

test("invalidates fixed-cluster paint state while overlays are visible", () => {
  const harness = createCompositorHarness({
    lines: ["editor", "footer"],
    cursor: null,
  })

  try {
    harness.terminal.write(synchronizedFrame("initial"))
    harness.takeWrite()
    harness.setOverlayVisible(true)
    harness.terminal.write(synchronizedFrame("overlay"))
    harness.takeWrite()
    harness.setOverlayVisible(false)

    harness.compositor.requestRepaint()
    const output = harness.takeWrite()
    assert.equal(countOccurrences(output, "\x1b[2K"), 2)
    assert.ok(output.includes("editor"))
    assert.ok(output.includes("footer"))
  } finally {
    harness.dispose()
  }
})

test("repaints moved fixed rows after terminal resize", () => {
  const harness = createCompositorHarness({
    lines: ["editor", "footer"],
    cursor: null,
  })

  try {
    harness.terminal.write(synchronizedFrame("initial"))
    harness.takeWrite()
    harness.setRows(12)

    harness.compositor.requestRepaint()
    const output = harness.takeWrite()
    assert.equal(countOccurrences(output, "\x1b[2K"), 4)
    assert.ok(output.includes("\x1b[9;1H\x1b[2K"))
    assert.ok(output.includes("\x1b[10;1H\x1b[2K"))
    assert.ok(output.includes("\x1b[11;1H\x1b[2Keditor"))
    assert.ok(output.includes("\x1b[12;1H\x1b[2Kfooter"))
  } finally {
    harness.dispose()
  }
})

test("restores a visible hardware cursor without repainting unchanged rows", () => {
  const harness = createCompositorHarness(
    { lines: ["editor", "footer"], cursor: { row: 0, col: 4 } },
    { showHardwareCursor: true },
  )

  try {
    harness.terminal.write(synchronizedFrame("initial"))
    harness.takeWrite()

    harness.compositor.requestRepaint()
    const output = harness.takeWrite()
    assert.equal(countOccurrences(output, "\x1b[2K"), 0)
    assert.ok(output.includes("\x1b[9;5H\x1b[?25h"))
  } finally {
    harness.dispose()
  }
})

test("paints the fixed cluster once per host render pass", () => {
  const writes: string[] = []
  let cluster: FixedEditorClusterRender = {
    lines: ["editor", "footer"],
    cursor: null,
  }
  let passBody = "first pass"
  const terminal: TerminalLike = {
    columns: 80,
    rows: 10,
    write: (data) => writes.push(data),
  }
  const tui = {
    children: [],
    cursorRow: 0,
    hardwareCursorRow: 0,
    previousViewportTop: 0,
    doRender: () => terminal.write(synchronizedFrame(passBody)),
    hasOverlay: () => false,
  }
  const compositor = new TerminalSplitCompositor({
    tui,
    terminal,
    renderCluster: () => cluster,
  })
  compositor.install()

  try {
    writes.length = 0
    tui.doRender()
    assert.equal(writes.length, 1)
    assert.equal(countOccurrences(writes[0] ?? "", "\x1b[2K"), 2)

    writes.length = 0
    passBody = "second pass"
    tui.doRender()
    assert.equal(writes.length, 1)
    assert.equal(countOccurrences(writes[0] ?? "", "\x1b[2K"), 0)

    writes.length = 0
    cluster = { lines: ["editor", "updated footer"], cursor: null }
    tui.doRender()
    assert.equal(writes.length, 1)
    assert.equal(countOccurrences(writes[0] ?? "", "\x1b[2K"), 1)
  } finally {
    compositor.dispose({ resetExtendedKeyboardModes: true })
  }
})

test("deletes Kitty images when rendering after scrolling", () => {
  const writes: string[] = []
  let scheduledRenders = 0
  const terminal: Terminal = {
    columns: 80,
    rows: 6,
    kittyProtocolActive: false,
    start: () => {},
    stop: () => {},
    drainInput: async () => {},
    write: (data) => writes.push(data),
    moveBy: () => {},
    hideCursor: () => {},
    showCursor: () => {},
    clearLine: () => {},
    clearFromCursor: () => {},
    clearScreen: () => {},
    setTitle: () => {},
    setProgress: () => {},
  }
  const imageId = 42
  const image = `\x1b_Ga=T,f=100,q=2,C=1,c=10,r=2,i=${imageId};AAAA\x1b\\`
  const rootLines = [
    image,
    "",
    "line 2",
    "line 3",
    "line 4",
    "line 5",
    "line 6",
    "line 7",
  ]
  const root: Component = {
    render: () => rootLines,
    invalidate: () => {},
  }
  const tui = new TuiMainScreen(terminal)
  tui.addChild(root)
  const inputListener: {
    current:
      | ((data: string) => { consume?: boolean; data?: string } | undefined)
      | undefined
  } = { current: undefined }
  const addInputListener = tui.addInputListener.bind(tui)
  tui.addInputListener = (listener) => {
    inputListener.current = listener
    return addInputListener(listener)
  }
  const compositor = new TerminalSplitCompositor({
    tui: tui as unknown as { children: Component[] },
    terminal,
    renderCluster: () => ({ lines: ["editor", "footer"], cursor: null }),
  })
  compositor.install()
  try {
    assert.equal(typeof inputListener.current, "function")
    assert.ok(writes.join("").includes("\x1b[?1049h"))
    writes.length = 0
    Reflect.get(tui, "doRender").call(tui)
    assert.equal(writes.filter((write) => write.includes("footer")).length, 1)
    tui.requestRender = () => {
      scheduledRenders += 1
    }
    writes.length = 0

    inputListener.current?.("\x1b[5~")
    assert.equal(writes.length, 0)
    assert.equal(scheduledRenders, 1)
    Reflect.get(tui, "doRender").call(tui)
    writes.length = 0

    inputListener.current?.("\x1b[6~")
    Reflect.get(tui, "doRender").call(tui)

    assert.match(
      writes.join(""),
      new RegExp(`\\x1b_Ga=d,d=I,i=${imageId},q=2\\x1b\\\\`),
    )
  } finally {
    compositor.dispose({ resetExtendedKeyboardModes: true })
  }
})

test("rapid scrolling defers full transcript rendering", () => {
  const inputListener: {
    current: ((data: string) => { consume?: boolean } | undefined) | null
  } = { current: null }
  let synchronousRenders = 0
  let renderRequests = 0
  const rootLines = Array.from({ length: 1000 }, (_, index) => `line ${index}`)
  const terminal: TerminalLike = {
    columns: 80,
    rows: 24,
    write: () => {},
  }
  const tui = {
    children: [],
    render: () => rootLines,
    doRender: () => {
      synchronousRenders += 1
      tui.render()
    },
    requestRender: () => {
      renderRequests += 1
    },
    addInputListener: (
      listener: (data: string) => { consume?: boolean } | undefined,
    ) => {
      inputListener.current = listener
      return () => {
        inputListener.current = null
      }
    },
    hasOverlay: () => false,
  }
  const compositor = new TerminalSplitCompositor({
    tui,
    terminal,
    renderCluster: () => ({ lines: ["editor", "footer"], cursor: null }),
  })

  compositor.install()
  try {
    tui.render()
    const listener = inputListener.current
    assert.ok(listener)

    for (let index = 0; index < 100; index++) {
      listener("\x1b[<64;1;1M")
    }

    assert.equal(synchronousRenders, 0)
    assert.ok(renderRequests > 0)
  } finally {
    compositor.dispose({ resetExtendedKeyboardModes: true })
  }
})

test("plain enter scrolls the transcript back to the bottom", () => {
  const inputListener: {
    current: ((data: string) => { consume?: boolean } | undefined) | null
  } = { current: null }
  let renderRequests = 0
  const rootLines = Array.from({ length: 10 }, (_, index) => `line ${index}`)
  const terminal: TerminalLike = {
    columns: 80,
    rows: 6,
    write: () => {},
  }
  const tui = {
    children: [],
    render: () => rootLines,
    requestRender: () => {
      renderRequests += 1
    },
    addInputListener: (
      listener: (data: string) => { consume?: boolean } | undefined,
    ) => {
      inputListener.current = listener
      return () => {
        inputListener.current = null
      }
    },
    hasOverlay: () => false,
  }
  const compositor = new TerminalSplitCompositor({
    tui,
    terminal,
    renderCluster: () => ({ lines: ["editor", "footer"], cursor: null }),
  })

  compositor.install()
  try {
    const listener = inputListener.current
    assert.ok(listener)
    assert.equal(listener("\x1b[5~")?.consume, true)
    assert.deepEqual(tui.render(), ["line 0", "line 1", "line 2", "line 3"])
    renderRequests = 0

    assert.equal(listener("\r"), undefined)

    assert.deepEqual(tui.render(), ["line 6", "line 7", "line 8", "line 9"])
    assert.equal(renderRequests, 1)
  } finally {
    compositor.dispose({ resetExtendedKeyboardModes: true })
  }
})
