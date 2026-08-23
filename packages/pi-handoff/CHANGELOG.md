# @tifan/pi-handoff

## 2.0.0

### Major Changes

- [`297e825`](https://github.com/tifandotme/pi-extensions/commit/297e825ba42eeed32814a34cd4fe5bdbe935b11c) Thanks [@tifandotme](https://github.com/tifandotme)! - Replace `/handoff-session` with the `-handoff` prompt marker and automatically start the new session from the generated handoff.

### Patch Changes

- Updated dependencies [[`e8709bc`](https://github.com/tifandotme/pi-extensions/commit/e8709bc388aa8e094918ec465cfab511358f18ff)]:
  - @tifan/pi-rename@0.4.3

## 1.1.2

### Patch Changes

- [`edf72a2`](https://github.com/tifandotme/pi-extensions/commit/edf72a238757bfd71d32ebe9f0d3f14653e21d87) Thanks [@tifandotme](https://github.com/tifandotme)! - Use gpt-5.6-luna as the default model for naming handoff sessions.

- Updated dependencies [[`b27ba8a`](https://github.com/tifandotme/pi-extensions/commit/b27ba8aef49ea00879cec87d913840f39e02b19e)]:
  - @tifan/pi-rename@0.4.2

## 1.1.1

### Patch Changes

- [`ba259a0`](https://github.com/tifandotme/pi-extensions/commit/ba259a0c990563e4dad3443371cc2ed31d122cd0) Thanks [@tifandotme](https://github.com/tifandotme)! - Keep model-powered handoffs and session names compatible with Pi 0.80.

- Updated dependencies [[`ba259a0`](https://github.com/tifandotme/pi-extensions/commit/ba259a0c990563e4dad3443371cc2ed31d122cd0)]:
  - @tifan/pi-rename@0.4.1

## 1.1.0

### Minor Changes

- [`38bebf2`](https://github.com/tifandotme/pi-extensions/commit/38bebf2827c37f1fcefe7de585c9d03dd0a7edee) Thanks [@tifandotme](https://github.com/tifandotme)! - Name new handoff sessions from the current conversation using pi-rename-style rules, with a local fallback when model naming is unavailable.

### Patch Changes

- Updated dependencies [[`416ac2f`](https://github.com/tifandotme/pi-extensions/commit/416ac2fecc6aa731c23ae895220bac87317152e4)]:
  - @tifan/pi-rename@0.4.0

## 1.0.1

### Patch Changes

- [`f0090c2`](https://github.com/tifandotme/pi-extensions/commit/f0090c2a5c648febc7281f88c25634414af22b99) Thanks [@tifandotme](https://github.com/tifandotme)! - Use Pi 0.78.1's new extension context APIs so `/handoff-session` records loaded skills and context file paths from system prompt options, and gates its custom UI with `ctx.mode`.

## 1.0.0

### Major Changes

- [`a049f90`](https://github.com/tifandotme/pi-extensions/commit/a049f90a485de7b893574600d0aec4dbfe678999) Thanks [@tifandotme](https://github.com/tifandotme)! - Replace `/handoff` with `/handoff-session`, which generates a temp handoff document from the installed `handoff` skill, starts a clean parent-linked session, and leaves the continuation prompt in the editor for manual submit.

## 0.1.1

### Patch Changes

- [`48e1167`](https://github.com/tifandotme/pi-extensions/commit/48e11674378fd22b74a319d8fd3ce6c7919e47df) Thanks [@tifandotme](https://github.com/tifandotme)! - update readme, fix type error in inline-skills package

## 0.1.0

### Minor Changes

- [`de412e0`](https://github.com/tifandotme/pi-extensions/commit/de412e0957517c926c69962fe7ccef36495491e5) Thanks [@tifandotme](https://github.com/tifandotme)! - initial release
