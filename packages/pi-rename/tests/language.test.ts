import assert from "node:assert/strict"
import { test } from "node:test"
import { parseRenameLanguage } from "../src/language.ts"
import { sanitizeRenameText } from "../src/sanitize.ts"

test("accepts auto and canonical BCP 47 language tags", () => {
  assert.equal(parseRenameLanguage("auto"), "auto")
  assert.equal(parseRenameLanguage("zh-cn"), "zh-CN")
  assert.equal(parseRenameLanguage("ja"), "ja")
  assert.equal(parseRenameLanguage("not a language"), undefined)
})

test("keeps existing ASCII names for English", () => {
  assert.equal(sanitizeRenameText("Fix 登录 callback!", "en"), "fix-callback")
  assert.equal(sanitizeRenameText("修复登录回调", "en"), "")
})

test("preserves Unicode names for selected and automatic languages", () => {
  assert.equal(
    sanitizeRenameText("修复 登录 callback!", "zh"),
    "修复-登录-callback",
  )
  assert.equal(
    sanitizeRenameText("認証コールバックを修正", "auto"),
    "認証コールバックを修正",
  )
  assert.equal(
    sanitizeRenameText("Ajouter l’authentification", "fr"),
    "ajouter-l-authentification",
  )
})

test("truncates Unicode text without splitting code points", () => {
  const input = "𐐀".repeat(61)
  assert.equal(sanitizeRenameText(input, "auto"), "𐐨".repeat(60))
})
