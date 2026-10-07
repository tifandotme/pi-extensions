# @tifan/pi-minimal-footer

Show a minimal footer with model, usage, and project details.

## Install

```bash
pi install npm:@tifan/pi-minimal-footer
```

## Usage

The top editor border keeps Pi's working-status loader on the left and shows the current model on the right. The bottom border shows cache-hit rate when available, cost, context usage and window, then the working directory and Git branch. Your prompt stays between the borders. When `@tifan/pi-fast-mode` marks the current model as fast, the top border adds `↯`. Install both extensions to show the marker.

Extension statuses are hidden by default. Run `/toggle-extension-status` to show the usual extension status row. Run it again to hide the row.

![Minimal footer showing model, usage, working directory, and Git branch](https://raw.githubusercontent.com/tifandotme/pi-extensions/refs/heads/master/packages/pi-minimal-footer/assets/footer.webp)

## License

[MIT](https://github.com/tifandotme/pi-extensions/blob/master/LICENSE)
