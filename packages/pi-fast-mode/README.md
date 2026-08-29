# @tifan/pi-fast-mode

Toggle OpenAI Fast Mode per model and track response TPS.

## Install

```bash
pi install npm:@tifan/pi-fast-mode
```

## Usage

Run `/fast` to toggle Fast Mode for the current model. The setting is saved per exact `provider/model` pair.

Run `/tps` to toggle response TPS. The setting is saved in the same configuration file.

When Fast Mode is enabled, the footer shows:

```text
⚡ (openai-codex) gpt-5.6-luna
```

When TPS is enabled, the status shows the latest response rate, median response rate, and median time to first token:

```text
last 58 t/s · med 44 t/s | 2.1s ttft
```

Response TPS uses Pi's provider-reported output tokens divided by the time from turn start to assistant message end. It includes reasoning tokens and response wait time. It does not include time spent executing tools.

Fast Mode adds `service_tier: "priority"` for these exact models:

```text
openai/gpt-5.4             openai-codex/gpt-5.4
openai/gpt-5.5             openai-codex/gpt-5.5
openai/gpt-5.6             openai-codex/gpt-5.6
openai/gpt-5.6-sol         openai-codex/gpt-5.6-sol
openai/gpt-5.6-terra       openai-codex/gpt-5.6-terra
openai/gpt-5.6-luna        openai-codex/gpt-5.6-luna
```

## Configuration

Preferences are stored at `$PI_CODING_AGENT_DIR/extensions/pi-fast-mode.json`:

```json
{
  "models": ["openai-codex/gpt-5.6-luna"],
  "tpsEnabled": true
}
```

`tpsEnabled` defaults to `true` when it is missing. Unsupported models cannot be enabled.

## Release notes

See [CHANGELOG.md](https://github.com/tifandotme/pi-extensions/blob/master/packages/pi-fast-mode/CHANGELOG.md)

## License

[MIT](https://github.com/tifandotme/pi-extensions/blob/master/LICENSE)
