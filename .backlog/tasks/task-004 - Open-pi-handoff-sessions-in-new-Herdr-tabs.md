---
id: TASK-004
title: Open pi-handoff sessions in new Herdr tabs
status: Done
assignee:
  - "@tifan"
created_date: "2026-08-29 15:51"
updated_date: "2026-08-29 16:07"
labels: []
dependencies: []
references:
  - packages/pi-handoff/README.md
modified_files:
  - packages/pi-handoff/src/index.ts
  - packages/pi-handoff/README.md
type: enhancement
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

When a user submits a handoff request from Pi under Herdr, keep the current parent session active and start the handoff session in a new focused Herdr tab with the same working directory. Preserve the parent-session relationship and the currently selected provider/model. Outside Herdr, retain the current replacement-session behavior. Document the behavior and the placement limitation in the package README.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 A handoff request under Herdr leaves the parent Pi session in its original tab and starts the handoff session in a new tab.
- [x] #2 The new Herdr tab receives focus and uses the same workspace and working directory as the parent.
- [x] #3 The handoff session preserves the parent-session link and uses the parent provider/model.
- [x] #4 Outside Herdr, handoffs retain the current replacement-session behavior.
- [x] #5 README documents Herdr behavior, fallback behavior, and that new tabs append when adjacent placement is unavailable.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Add a Herdr-aware launch path in packages/pi-handoff/src/index.ts that creates a fresh parent-linked session, preserves the selected provider/model, creates a focused tab in the current workspace and cwd, starts Pi in its root pane, and sends the handoff prompt.
2. Keep the existing ctx.newSession replacement path for non-Herdr runs.
3. Update packages/pi-handoff/README.md with Herdr behavior, fallback behavior, and append-only tab placement.
4. Run a focused Herdr smoke test plus bun run typecheck, bun run lint, and bun run format.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Implemented the Herdr launch path in packages/pi-handoff/src/index.ts. It bootstraps a parent-linked child session, creates a focused tab in the current workspace and cwd, starts Pi with the selected provider/model, and sends the handoff prompt. Non-Herdr runs retain ctx.newSession().

Validation passed: Herdr tab focus and Pi startup smoke test; exact Herdr Pi launch smoke test; source-level Herdr orchestration smoke test with mocked commands; non-Herdr replacement smoke test; bun run typecheck; bun run lint; bun run format:check; git diff --check.

Applied ponytail review simplifications: the child session now persists only its header and passes the session name through Pi CLI, and the Herdr launcher reuses the caller model guarantee.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Implemented and simplified Herdr-aware handoffs in packages/pi-handoff/src/index.ts. Handoffs create a parent-linked child session, open a focused tab in the current workspace and cwd, start Pi with the selected provider/model and session name, and send the handoff prompt. Non-Herdr runs keep the existing replacement behavior. Updated the README with the new behavior and append-only placement limitation. Verified with Herdr and source-level smoke tests, non-Herdr fallback smoke test, bun run typecheck, bun run lint, bun run format:check, and git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
