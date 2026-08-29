# @tifan/pi-rename

Generate short pi session names and rename the current Herdr pane or tab to match.

## Install

```bash
pi install npm:@tifan/pi-rename
```

Requires Pi 0.84.2 or newer.

## Usage

Run:

```text
/rename
```

The extension:

- Builds context from the first user message and up to three latest user messages.
- Ignores assistant replies, tool output, and attachments.
- Redacts common secrets before sending context to the model.
- Creates a lowercase, hyphen-separated name of up to 30 characters.
- Falls back to the latest user message when the naming model is unavailable.

## Commands

- `/rename`: Generate and apply a session name.
- `/rename status`: Show model and rename status.
- `/rename config`: Choose a rename model.
- `/rename config language <auto|BCP-47>`: Set session-name language.
- `/rename help`: List rename commands.

Use pi's built-in `/name` command when you want to set an exact name.

## Configuration

Default model:

```text
openai-codex/gpt-5.6-luna
```

Use `/rename config` to choose another model or reset to the default.

To preserve existing behavior, names use ASCII when no language is configured. Set an output language with a BCP 47 tag, or use `auto` to follow latest user message language:

```bash
/rename config language <BCP-47-tag>
/rename config language auto
```

`auto` and non-`en` tags preserve Unicode letters and numbers. If rename model is unavailable, fallback uses latest user message and does not translate it.

You can also edit `$PI_CODING_AGENT_DIR/extensions/pi-rename.json` manually:

```json
{
  "model": "openai-codex/gpt-5.6-luna",
  "language": "auto"
}
```

Use `"language": "en"` for ASCII compatibility mode. Missing or invalid language values also fall back to `en`.

## Herdr behavior

- Requires the `herdr` CLI.
- With one pane, renames both the pane and tab.
- In a split tab, renames only the current pane.
- Does not replace custom labels on startup or resume.
- Replaces default or temporary startup labels.
- Keeps the last name when pi exits.

For temporary launcher labels, set `HERDR_TEMPORARY_LABEL`:

```bash
HERDR_TEMPORARY_LABEL="my-project (pi)" pi
```

Without it, only Herdr's default label is replaced.

Outside Herdr, only the pi session is renamed.

## Release notes

See [CHANGELOG.md](https://github.com/tifandotme/pi-extensions/blob/master/packages/pi-rename/CHANGELOG.md)

## License

[MIT](https://github.com/tifandotme/pi-extensions/blob/master/LICENSE)
