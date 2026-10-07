import assert from "node:assert/strict"
import { test } from "node:test"
import type { SessionEntry } from "@earendil-works/pi-coding-agent"
import {
  getPendingDraft,
  getShortcutAction,
  shouldAutoRestore,
  STASH_ENTRY_TYPE,
} from "./index.ts"

test("maps Ctrl+S to one-slot stash actions without losing text", () => {
  assert.deepEqual(getShortcutAction("draft A", null), {
    type: "stash",
    draft: "draft A",
  })
  assert.deepEqual(getShortcutAction("", "draft A"), {
    type: "restore",
    draft: "draft A",
  })
  assert.deepEqual(getShortcutAction("draft B", "draft A"), {
    type: "reject",
  })
  assert.deepEqual(getShortcutAction("   ", null), { type: "none" })
})

test("restores only after interactive agent messages", () => {
  assert.equal(shouldAutoRestore("interactive", "check this function"), true)
  assert.equal(shouldAutoRestore("interactive", "/model"), false)
  assert.equal(shouldAutoRestore("rpc", "check this function"), false)
  assert.equal(shouldAutoRestore("extension", "check this function"), false)
})

test("replays the latest draft state from the current session branch", () => {
  const entries = [
    {
      type: "custom",
      customType: STASH_ENTRY_TYPE,
      data: { draft: "draft A" },
    },
    {
      type: "custom",
      customType: "another-extension",
      data: { draft: "ignored" },
    },
    {
      type: "custom",
      customType: STASH_ENTRY_TYPE,
      data: { draft: null },
    },
  ] as SessionEntry[]

  assert.equal(getPendingDraft(entries.slice(0, 2)), "draft A")
  assert.equal(getPendingDraft(entries), null)
})
