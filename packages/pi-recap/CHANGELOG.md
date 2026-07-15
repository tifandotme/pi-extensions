# @tifan/pi-recap

## 0.4.4

### Patch Changes

- [`18847c3`](https://github.com/tifandotme/pi-extensions/commit/18847c311929d81fb8f993b2277c9e122398dc84) Thanks [@tifandotme](https://github.com/tifandotme)! - Use gpt-5.6-luna as the default recap model.

## 0.4.3

### Patch Changes

- [`ba259a0`](https://github.com/tifandotme/pi-extensions/commit/ba259a0c990563e4dad3443371cc2ed31d122cd0) Thanks [@tifandotme](https://github.com/tifandotme)! - Wait for Pi to settle before scheduling recaps or clearing the titlebar spinner.

## 0.4.2

### Patch Changes

- [`92437ac`](https://github.com/tifandotme/pi-extensions/commit/92437ac85738ce15f69e33119492536e8fb25bee) Thanks [@tifandotme](https://github.com/tifandotme)! - Refine the recap widget to look more like Claude Code's and show progress while manual recap generation runs.

## 0.4.1

### Patch Changes

- [`3df7dfd`](https://github.com/tifandotme/pi-extensions/commit/3df7dfdd1cbc76f3e0d4bb56fe8b31d6b006270f) Thanks [@tifandotme](https://github.com/tifandotme)! - Prevent repeated recaps from drifting by ignoring prior recap state when choosing the session context to summarize.

- [`3370df5`](https://github.com/tifandotme/pi-extensions/commit/3370df5b3514673d6f7ca702e3af06466129d800) Thanks [@tifandotme](https://github.com/tifandotme)! - Hide the footer while choosing a recap model and omit "authenticated" from the picker.

## 0.4.0

### Minor Changes

- [`f27adfc`](https://github.com/tifandotme/pi-extensions/commit/f27adfcefe4706133b9648295859a928a985e55b) Thanks [@tifandotme](https://github.com/tifandotme)! - Simplify: Remove auto, picker now show all available models and searchable, default now set to gpt-5.4-mini instead of multiple fallback

### Patch Changes

- [`cc6d5c8`](https://github.com/tifandotme/pi-extensions/commit/cc6d5c877df4fdf3e7291f287a2a9ef54f223050) Thanks [@tifandotme](https://github.com/tifandotme)! - Update README

## 0.3.4

### Patch Changes

- [`7766c8a`](https://github.com/tifandotme/pi-extensions/commit/7766c8a22c5f0574390451b9249e960b3049ab28) Thanks [@tifandotme](https://github.com/tifandotme)! - Make generated recaps start with the user's session goal before current state or next action.

## 0.3.3

### Patch Changes

- [`313f5f9`](https://github.com/tifandotme/pi-extensions/commit/313f5f96aa29cf0566b9b8ca5d0c5d0b1ef18b62) Thanks [@tifandotme](https://github.com/tifandotme)! - Update readme to fix image rendering. Adjust author in package.json

## 0.3.2

### Patch Changes

- [`e5567f3`](https://github.com/tifandotme/pi-extensions/commit/e5567f35167c64bee8c28c14d4a578d740d93b17) Thanks [@tifandotme](https://github.com/tifandotme)! - Update README.md to use remote images

## 0.3.1

### Patch Changes

- [`24371e3`](https://github.com/tifandotme/pi-extensions/commit/24371e3cb7ef3186e1c9f5003a3c17bc56c99bd9) Thanks [@tifandotme](https://github.com/tifandotme)! - update readme

## 0.3.0

### Minor Changes

- [`fc010bd`](https://github.com/tifandotme/pi-extensions/commit/fc010bd7ca4c88c8560c00fa2d299dfab7bcdc0f) Thanks [@tifandotme](https://github.com/tifandotme)! - Add `/preferred-thinking` for model-specific thinking preferences and `/recap config` for choosing the recap model.

- [`0c3bfd7`](https://github.com/tifandotme/pi-extensions/commit/0c3bfd7b93855ed49d5072693e68bc2c54ec895a) Thanks [@tifandotme](https://github.com/tifandotme)! - store settings in <agent dir>/extensions/<extension name>.json

## 0.2.0

### Minor Changes

- [`b94b3db`](https://github.com/tifandotme/pi-extensions/commit/b94b3db3a834217cdb7af9e20fc3610d63903745) Thanks [@tifandotme](https://github.com/tifandotme)! - recap should behaves similarly to Claude Code. it now works on-demmand and away-aware

## 0.1.1

### Patch Changes

- [`8128641`](https://github.com/tifandotme/pi-extensions/commit/8128641df92aac2050dfedc1f92c14f9a7d4c848) Thanks [@tifandotme](https://github.com/tifandotme)! - fix lint errors

- [`48e1167`](https://github.com/tifandotme/pi-extensions/commit/48e11674378fd22b74a319d8fd3ce6c7919e47df) Thanks [@tifandotme](https://github.com/tifandotme)! - update readme, fix type error in inline-skills package

## 0.1.0

### Minor Changes

- [`de412e0`](https://github.com/tifandotme/pi-extensions/commit/de412e0957517c926c69962fe7ccef36495491e5) Thanks [@tifandotme](https://github.com/tifandotme)! - initial release
