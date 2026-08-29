export const MAX_RENAME_CHARS = 60

export function redactSecrets(text: string): string {
  return text
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
      "[redacted private key]",
    )
    .replace(/AKIA[0-9A-Z]{16}/gu, "[redacted aws key]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/gu, "[redacted api key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/giu, "Bearer [redacted]")
    .replace(
      /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*=\s*([^\s'"]+)/giu,
      "$1=[redacted]",
    )
}

export function sanitizeRenameText(raw: string, language = "en"): string {
  const allowUnicode = !/^en(?:-|$)/iu.test(language)
  const disallowedCharacters = allowUnicode
    ? /[^\p{L}\p{M}\p{N}]+/gu
    : /[^a-z0-9]+/giu

  return Array.from(
    raw
      .trim()
      .replace(/^```(?:\w+)?/u, "")
      .replace(/```$/u, "")
      .replace(/^name\s*:\s*/iu, "")
      .replace(/^title\s*:\s*/iu, "")
      .replace(/^[-*•]\s*/u, "")
      .replace(/["'`]/gu, "")
      .replace(disallowedCharacters, "-")
      .replace(/-+/gu, "-")
      .replace(/^-|-$/gu, "")
      .toLowerCase(),
  )
    .slice(0, MAX_RENAME_CHARS)
    .join("")
    .replace(/-$/u, "")
}
