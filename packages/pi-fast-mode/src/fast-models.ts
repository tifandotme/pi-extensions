const OPENAI_PROVIDERS = new Set(["openai", "openai-codex"])

export function isOpenAIProvider(provider: string): boolean {
  return OPENAI_PROVIDERS.has(provider)
}
