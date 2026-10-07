import type { KeyId } from "@earendil-works/pi-tui"

export type FastConfig = {
  enabled: boolean
  tpsEnabled: boolean
  toggleFast?: string
}

const DEFAULT_TOGGLE_FAST: KeyId = "alt+r"
const MODIFIERS = new Set(["ctrl", "shift", "alt", "super"])
const SPECIAL_KEYS = new Set([
  "escape",
  "esc",
  "enter",
  "return",
  "tab",
  "space",
  "backspace",
  "delete",
  "insert",
  "clear",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
])
const SYMBOL_KEYS = new Set(Array.from("`-=[]\\;',./!@#$%^&*()_|~{}:<>?"))

export function parseFastConfig(value: unknown): FastConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error('expected a JSON object for "pi-fast-mode.json"')
  }

  const config = value as Record<string, unknown>
  const models = config["models"]
  if (
    models !== undefined &&
    (!Array.isArray(models) ||
      models.some((model) => typeof model !== "string"))
  ) {
    throw new Error('expected "models" to be a string array')
  }

  const enabled = config["enabled"]
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new Error('expected "enabled" to be a boolean')
  }
  const tpsEnabled = config["tpsEnabled"]
  if (tpsEnabled !== undefined && typeof tpsEnabled !== "boolean") {
    throw new Error('expected "tpsEnabled" to be a boolean')
  }
  const toggleFast = config["toggleFast"]
  if (
    toggleFast !== undefined &&
    toggleFast !== null &&
    typeof toggleFast !== "string"
  ) {
    throw new Error('expected "toggleFast" to be a string')
  }

  return {
    enabled: enabled ?? (Array.isArray(models) && models.length > 0),
    tpsEnabled: tpsEnabled ?? true,
    ...(typeof toggleFast === "string" ? { toggleFast } : {}),
  }
}

export function parseShortcut(value: string | undefined): KeyId | undefined {
  if (!value?.trim()) return undefined

  let shortcut = value.trim().toLowerCase()
  shortcut = shortcut
    .replace(/^(?:option|opt)-/, "alt+")
    .replace(/^(?:option|opt)\+/, "alt+")
    .replace(/^alt-/, "alt+")
  if (/\s/.test(shortcut)) return undefined

  const parts = shortcut.split("+")
  const key = parts.pop() ?? ""
  if (
    parts.some((part) => !MODIFIERS.has(part)) ||
    new Set(parts).size !== parts.length
  ) {
    return undefined
  }

  const normalizedKey =
    key === "pageup" ? "pageUp" : key === "pagedown" ? "pageDown" : key
  if (
    !/^[a-z0-9]$/.test(key) &&
    !/^f(?:[1-9]|1[0-2])$/.test(key) &&
    !SPECIAL_KEYS.has(key) &&
    !SYMBOL_KEYS.has(key)
  ) {
    return undefined
  }
  return [...parts, normalizedKey].join("+") as KeyId
}

export function resolveToggleFastShortcut(
  piShortcut: string | undefined,
  ampShortcut: string | undefined,
): { shortcut: KeyId; warning?: string } {
  const warnings: string[] = []
  for (const [value, source] of [
    [piShortcut, "pi-fast-mode.json"],
    [ampShortcut, "amp/settings.json"],
  ] as const) {
    if (!value?.trim()) continue
    const shortcut = parseShortcut(value)
    if (shortcut) {
      return {
        shortcut,
        ...(warnings.length > 0 ? { warning: warnings.join(" ") } : {}),
      }
    }
    warnings.push(`Ignoring invalid toggleFast shortcut in ${source}.`)
  }
  return {
    shortcut: DEFAULT_TOGGLE_FAST,
    ...(warnings.length > 0 ? { warning: warnings.join(" ") } : {}),
  }
}
