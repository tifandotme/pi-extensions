# @tifan/pi-fixed-editor

## 0.3.0

### Minor Changes

- [`ebc3f6a`](https://github.com/tifandotme/pi-extensions/commit/ebc3f6a7ab82db5f80385e7f788a43d8b8df0efc) Thanks [@tifandotme](https://github.com/tifandotme)! - Deprecate the extension in favor of Pi's native fullscreen mode while preserving frozen support for Pi versions before 0.84.

## 0.2.7

### Patch Changes

- [#26](https://github.com/tifandotme/pi-extensions/pull/26) [`fb21134`](https://github.com/tifandotme/pi-extensions/commit/fb21134c861e75f0951500387a6d6698379a7209) Thanks [@libin](https://github.com/libin)! - Fix an infinite render loop on Pi 0.84+, which wraps the TUI in a re-resolving proxy. The compositor now captures the real underlying `render`, `doRender`, and `compositeLineAt` methods instead of the proxy's per-call wrappers, so the fixed editor loads and scrolls again.

## 0.2.6

### Patch Changes

- [#24](https://github.com/tifandotme/pi-extensions/pull/24) [`c2478b3`](https://github.com/tifandotme/pi-extensions/commit/c2478b340498d45206f3dc3917bb3bc6eeed78dd) Thanks [@HerbertGao](https://github.com/HerbertGao)! - Reduce editor flicker while Pi streams responses.

## 0.2.5

### Patch Changes

- [`e954834`](https://github.com/tifandotme/pi-extensions/commit/e954834a8949b05671acafff7dd55e39fcd21c8b) Thanks [@tifandotme](https://github.com/tifandotme)! - Prevent footer flicker and freezes when rapidly scrolling long transcripts.

## 0.2.4

### Patch Changes

- [`1664d2d`](https://github.com/tifandotme/pi-extensions/commit/1664d2d03b5518186e903002052ec1bdd8d50e6d) Thanks [@tifandotme](https://github.com/tifandotme)! - Fix Kitty image cleanup when scrolling the transcript.

## 0.2.3

### Patch Changes

- [`37641b9`](https://github.com/tifandotme/pi-extensions/commit/37641b9cb235e49dbef84d8271ac106695a94924) Thanks [@tifandotme](https://github.com/tifandotme)! - Avoid an extra render request when plain Enter scrolls the transcript back to the bottom.

## 0.2.2

### Patch Changes

- [`2d7393e`](https://github.com/tifandotme/pi-extensions/commit/2d7393e6451851237d2f37fc3b29ba5545b62a4f) Thanks [@tifandotme](https://github.com/tifandotme)! - Scroll the transcript back to the bottom when submitting a query with Enter.

## 0.2.1

### Patch Changes

- [`f0090c2`](https://github.com/tifandotme/pi-extensions/commit/f0090c2a5c648febc7281f88c25634414af22b99) Thanks [@tifandotme](https://github.com/tifandotme)! - Use Pi 0.78.1's new `ctx.mode` field to skip the fixed-editor terminal compositor outside interactive TUI mode.

## 0.2.0

### Minor Changes

- [`ad31a8d`](https://github.com/tifandotme/pi-extensions/commit/ad31a8de63fa055d60a31e06175c3606f3501e0b) Thanks [@tifandotme](https://github.com/tifandotme)! - Add a fixed editor extension that keeps Pi's editor, footer, and editor-adjacent widgets visible while the transcript scrolls.
