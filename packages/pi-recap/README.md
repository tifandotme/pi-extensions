# @tifan/pi-recap

Re-enter a session without rereading the transcript.

`pi-recap` shows a one-line recap on demand or after you have been away. It starts with why you opened the session, then adds the current state, important decisions, relevant files or commands, and the likely next action.

![Recap widget showing a generated session recap](https://raw.githubusercontent.com/tifandotme/pi-extensions/refs/heads/master/packages/pi-recap/assets/recap-widget.webp)

## Install

```bash
pi install npm:@tifan/pi-recap
```

This package requires Pi 0.84.2 or newer.

## How it works

- `/recap` generates a fresh, goal-first recap and shows it above the editor.
- After the agent settles, `pi-recap` waits 5 minutes. If you stay idle, it generates one automatic recap.
- On resume, `pi-recap` shows the saved recap if it is current. If it is stale or missing, it generates a fresh recap.
- The recap clears when you send a non-`/recap` message.

Recaps use pi's current session context, so they follow the active branch and respect compaction. They do not scrape the full session file or terminal history. The latest recap is stored outside LLM context.

A good recap should answer "what was I trying to do here?". For example:

> Deciding whether pi-inline-skills should switch from `$skill` to `/skill`. Recommendation is `/` only with commands winning; next decide whether leading `/skill` should expand.

## Commands

- `/recap`: Generate and show a fresh recap.
- `/recap status`: Show the selected model, active model, recap freshness, and whether the recap is visible. A recap is current when it still matches the latest session state; otherwise it is stale.
- `/recap config`: Choose a recap model.
- `/recap color <name>`: Set the recap color. Choices are `accent`, `success`, `warning`, `error`, `text`, `mdLink`, `mdHeading`, `toolTitle`, `muted`, `dim`, or `default`.
- `/recap spacing on|off`: Show or hide a blank line above the recap.
- `/recap persist on|off`: Keep the recap visible until your next message (`on`) or clear it as soon as the agent starts working again (`off`).
- `/recap help`: List recap commands.

## Configuration

Out of the box, `pi-recap` uses this default model: `openai-codex/gpt-5.6-luna`.

Run `/recap config` to choose a different model.

![Recap model selector showing available model choices](https://raw.githubusercontent.com/tifandotme/pi-extensions/refs/heads/master/packages/pi-recap/assets/recap-model-selector.webp)

After you choose a model, `pi-recap` uses only that model. Choose `Use default` in `/recap config` to return to the default.

Display options are saved alongside the model in `pi-recap.json`. Defaults match the original behavior: color `muted`, spacing off, persist off. Set `/recap color accent`, `/recap spacing on`, and `/recap persist on` for a more prominent, longer-lived recap.

You can also edit `$PI_CODING_AGENT_DIR/extensions/pi-recap.json` manually:

```json
{
  "model": "openai-codex/gpt-5.6-luna"
}
```

## Release notes

See [CHANGELOG.md](https://github.com/tifandotme/pi-extensions/blob/master/packages/pi-recap/CHANGELOG.md)

## License

[MIT](https://github.com/tifandotme/pi-extensions/blob/master/LICENSE)
