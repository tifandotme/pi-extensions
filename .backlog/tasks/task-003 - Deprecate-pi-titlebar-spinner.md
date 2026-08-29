---
id: TASK-003
title: Deprecate pi-titlebar-spinner
status: Done
assignee: []
created_date: "2026-08-29 11:26"
updated_date: "2026-08-29 11:31"
labels: []
dependencies: []
modified_files:
  - README.md
  - packages/pi-titlebar-spinner/README.md
  - packages/pi-titlebar-spinner/package.json
  - .changeset/retire-titlebar-spinner.md
type: chore
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Mark @tifan/pi-titlebar-spinner as deprecated and freeze support. Keep the package source and existing behavior available for current users, and list the package under the repository's deprecated extensions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 The package README clearly marks the extension as deprecated and says that support is frozen.
- [x] #2 The package metadata description identifies the package as legacy without changing its package name or extension entry point.
- [x] #3 The root package catalog moves pi-titlebar-spinner from Packages to Deprecated and keeps its description.
- [x] #4 A release changeset records the deprecation at the appropriate semver level for @tifan/pi-titlebar-spinner.
- [x] #5 Existing source remains available and the documented legacy behavior is unchanged.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Update package metadata and README with the deprecation and frozen-support wording.
2. Move the package to the root Deprecated catalog while keeping its existing description.
3. Add a minor changeset; keep the extension source unchanged.
4. Run repository typecheck, lint, and format checks, then verify the diff.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Validation passed: bun run typecheck, bun run format:check, targeted oxfmt check, and git diff --check. bun run lint passed with existing no-await-in-loop warnings in packages/pi-review. The extension source was verified unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Marked pi-titlebar-spinner as deprecated, froze support in its README and metadata, moved it to the root Deprecated catalog, and added a minor changeset. Verified with bun run typecheck, bun run lint, bun run format:check, targeted formatting, and git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
