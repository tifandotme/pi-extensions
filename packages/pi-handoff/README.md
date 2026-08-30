# @tifan/pi-handoff

Start a new pi session from a handoff document. The new session can use the `session_query` tool to look up decisions, files, and next steps from earlier sessions.

## Install

```bash
pi install npm:@tifan/pi-handoff
```

## Requirements

Install Matt Pocock's `handoff` skill:

```bash
npx skills add https://github.com/mattpocock/skills --global --skill handoff
```

## Usage

Add a standalone `-handoff` marker to a prompt:

```text
fix the auth flow -handoff
```

The marker is consumed before the prompt reaches the agent.

- Text around the marker becomes the next-session focus.
- The focus is used in the handoff document.
- A handoff document is written under the OS temp directory.
- A new session starts automatically from the document.
- When Pi runs inside Herdr, the handoff opens in a new tab without changing focus. The current parent session stays available in its original tab.
- The handoff session keeps the parent-session link and selected provider/model when available.
- Outside Herdr, the current session is replaced.

A prompt containing only `-handoff` continues the current work.

## Session naming

`pi-handoff` imports the shared naming code from `@tifan/pi-rename`. Installing pi-handoff installs this dependency automatically, but it does not enable pi-rename's commands.

Handoff uses the same naming logic as `/rename`:

- Uses the first user message and up to three latest user messages.
- Reads the model from `$PI_CODING_AGENT_DIR/extensions/pi-rename.json`.
- Uses `openai-codex/gpt-5.6-luna` when no config exists.
- Produces a name such as `[handoff] fix-auth-callback`.
- Keeps the generated base name under 30 characters before adding the prefix.
- Falls back to the latest user message if the naming model is unavailable.
- Uses `[handoff] handoff-session` when no usable user text exists.

The handoff artifact filename uses the unprefixed base name. If you run `/rename` in the new session, it replaces the complete name and can remove the `[handoff]` prefix.

Install `@tifan/pi-rename` separately only if you want its `/rename` and `/rename config` commands.

## `session_query`

`session_query` answers questions about a previous pi session:

- Reads the previous `.jsonl` session file.
- Uses the `openai-codex/gpt-5.6-luna` model.
- Requires that model to be available and authenticated.

Pi provides session loading and compaction-aware context reconstruction. `session_query` provides semantic answers about the previous session.

## Release notes

See [CHANGELOG.md](https://github.com/tifandotme/pi-extensions/blob/master/packages/pi-handoff/CHANGELOG.md)

## License

[MIT](https://github.com/tifandotme/pi-extensions/blob/master/LICENSE)
