# @tifan/pi-fast-mode

Toggle OpenAI Fast Mode globally and track response TPS.

## Install

```bash
pi install npm:@tifan/pi-fast-mode
```

## Usage

Run `/fast` or press the configured shortcut to toggle Fast Mode globally. The shortcut defaults to Amp's `speed.toggleFast` keybinding. When that setting is empty or missing, the shortcut defaults to `alt+r`.

Fast Mode adds `service_tier: "priority"` to requests from supported `openai` and `openai-codex` models while enabled. When paired with `@tifan/pi-minimal-footer`, the active model shows a `↯` marker.

Run `/tps` to toggle response TPS.

When TPS is enabled, the status shows the latest response rate, median response rate, and median time to first token:

```text
last 58 t/s · med 44 t/s | 2.1s ttft
```

Response TPS uses Pi's provider-reported output tokens divided by the time from turn start to assistant message end. It includes reasoning tokens and response wait time. It does not include time spent executing tools.

## Configuration

Preferences are stored at `$PI_CODING_AGENT_DIR/extensions/pi-fast-mode.json`:

```json
{
  "enabled": false,
  "toggleFast": "",
  "tpsEnabled": true
}
```

A non-empty `toggleFast` value overrides Amp's keybinding. Pi key syntax uses `alt+r`; the Amp-style spelling `opt-r` also works. If both settings are empty, Fast Mode uses `alt+r`.

Pi reads Amp's keybinding from `amp.keymap["speed.toggleFast"]` in `~/.config/amp/settings.json`.

`tpsEnabled` defaults to `true`. Legacy `models` settings migrate to global mode based on whether the list was empty.

## Release notes

See [CHANGELOG.md](https://github.com/tifandotme/pi-extensions/blob/master/packages/pi-fast-mode/CHANGELOG.md)

## License

[MIT](https://github.com/tifandotme/pi-extensions/blob/master/LICENSE)
