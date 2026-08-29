# @tifan/pi-titlebar-spinner

> [!WARNING]
> This package is deprecated. Support is frozen.

Show a spinner in the Herdr tab title while the agent runs.

The spinner starts on `agent_start` and stops when the agent settles or the session shuts down. It pauses while an extension waits for user input. When it stops, the extension restores the original Herdr tab label.

## Legacy support

The extension continues to update the Herdr tab title when `HERDR_TAB_ID` is available. No further fixes are planned.

## Install

```bash
pi install npm:@tifan/pi-titlebar-spinner
```

## Requirements

- Pi `>=0.84.4`.
- Run pi inside a Herdr tab. Herdr provides the required `HERDR_TAB_ID` environment variable.

## Release notes

See [CHANGELOG.md](https://github.com/tifandotme/pi-extensions/blob/master/packages/pi-titlebar-spinner/CHANGELOG.md)

## License

[MIT](https://github.com/tifandotme/pi-extensions/blob/master/LICENSE)
