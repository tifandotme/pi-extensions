# @tifan/pi-rename

Generate session names for pi and Herdr.

## Install

```bash
pi install npm:@tifan/pi-rename
```

This package requires Pi 0.84.2 or newer.

## How it works

Run `/rename` to generate a fresh hyphen-separated session name. The extension applies the name to the pi session and, when pi is running inside Herdr, to the current pane and tab when it is the tab's only pane, or to the current pane in a split tab.

When a named session starts or resumes in Herdr, the extension applies the saved pi session name when the target still has its default or temporary startup label.

`/rename` builds naming context from the first user message plus up to three latest user messages. It ignores assistant replies, tool output, and attachments. Before sending context to the rename model, it redacts common secrets.

If the rename model is unavailable, `/rename` falls back to a local name from the latest user message.

## Commands

- `/rename`: Generate and apply a session name.
- `/rename status`: Show model and rename status.
- `/rename config`: Choose a rename model.
- `/rename config language <auto|BCP-47>`: Set session-name language.
- `/rename help`: List rename commands.

Manual names are not supported. Use pi's built-in `/name` command when you want an exact name.

## Configuration

Out of the box, `pi-rename` uses this default model: `openai-codex/gpt-5.6-luna`.

Run `/rename config` to choose a different model.

After you choose a model, `pi-rename` uses only that model. Choose `Use default` in `/rename config` to return to the default.

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

Herdr tab renaming requires the `herdr` CLI. If it is unavailable, the extension still renames the pi session.

The extension uses `HERDR_PANE_ID` to find the current Herdr pane. With one pane in the tab, it renames both the pane and tab. With sibling panes, it renames only the current pane.

On session startup or resume, it does not overwrite custom Herdr labels. It replaces only Herdr's default or temporary startup labels, so saved session names still apply.

If your launcher gives Pi a temporary Herdr label, it must set `HERDR_TEMPORARY_LABEL` before starting Pi. The value must match the label shown in Herdr. In Bash, pass it to Pi inline:

```bash
HERDR_TEMPORARY_LABEL="my-project (pi)" pi
```

If you do not set this variable, `pi-rename` replaces only Herdr's default label.
On quit, the target keeps the last session name.

If pi is not running inside Herdr, only the pi session name is updated.

## Release notes

See [CHANGELOG.md](https://github.com/tifandotme/pi-extensions/blob/master/packages/pi-rename/CHANGELOG.md)

## License

[MIT](https://github.com/tifandotme/pi-extensions/blob/master/LICENSE)
