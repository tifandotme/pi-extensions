# pi-extensions

A collection of [pi coding agent](https://pi.dev) extensions.

Wondering which packages I use myself? See my [current pi settings](https://github.com/tifandotme/dotfiles/blob/master/dot_config/pi/private_settings.json).

## Packages

| Package                                                          | Downloads                                                                            | Description                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [`@tifan/pi-rename`](packages/pi-rename)                         | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-rename)             | Generate session names and sync Herdr tab labels.                       |
| [`@tifan/pi-copy-response`](packages/pi-copy-response)           | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-copy-response)      | Pick and copy an assistant response from the current pi session.        |
| [`@tifan/pi-fast-mode`](packages/pi-fast-mode)                   | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-fast-mode)          | Toggle OpenAI Fast Mode per model and track response TPS.               |
| [`@tifan/pi-handoff`](packages/pi-handoff)                       | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-handoff)            | Transfer pi session context to a new session and query past sessions.   |
| [`@tifan/pi-inline-skills`](packages/pi-inline-skills)           | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-inline-skills)      | Inline `/skill` autocomplete in the pi editor.                          |
| [`@tifan/pi-mermaid-open`](packages/pi-mermaid-open)             | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-mermaid-open)       | Find skipped Mermaid diagrams and show them in a terminal image viewer. |
| [`@tifan/pi-preferred-thinking`](packages/pi-preferred-thinking) | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-preferred-thinking) | Set and apply per-model thinking levels from Pi's native settings.      |
| [`@tifan/pi-recap`](packages/pi-recap)                           | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-recap)              | One-line session recap on demand or after you have been away.           |
| [`@tifan/pi-stash`](packages/pi-stash)                           | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-stash)              | Stash one draft and restore it after the next message.                  |

## Deprecated

| Package                                                      | Downloads                                                                          | Description                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`@tifan/pi-fixed-editor`](packages/pi-fixed-editor)         | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-fixed-editor)     | Keep the pi editor and footer fixed while the transcript scrolls. |
| [`@tifan/pi-titlebar-spinner`](packages/pi-titlebar-spinner) | ![npm monthly downloads](https://img.shields.io/npm/dm/@tifan/pi-titlebar-spinner) | Show a spinner in the Herdr tab title while the agent runs.       |

## Install

```bash
pi install npm:@tifan/pi-<name>
```
