import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import type { Api, Model } from "@earendil-works/pi-ai"
import {
  getAgentDir,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent"

const CONFIG_PATH = path.join(getAgentDir(), "extensions", "pi-recap.json")
const CONFIG_DIR = path.dirname(CONFIG_PATH)

export interface RecapModelPreference {
  readonly provider: string
  readonly id: string
}

export type RecapModelConfig =
  | { readonly kind: "missing" }
  | { readonly kind: "invalid" }
  | { readonly kind: "configured"; readonly model: RecapModelPreference }

export type ResolvedRecapModelAuth =
  | {
      readonly status: "ok"
      readonly auth: Model<Api>
      readonly source: "configured" | "default"
    }
  | { readonly status: "invalid-config" }
  | {
      readonly status: "unauthenticated"
      readonly model: RecapModelPreference | undefined
      readonly source: "configured" | "default"
    }

export const DEFAULT_RECAP_MODEL: RecapModelPreference = {
  provider: "openai-codex",
  id: "gpt-5.6-luna",
}

interface RecapConfig extends Record<string, unknown> {
  model?: unknown
  color?: unknown
  blankLineAbove?: unknown
  persist?: unknown
}

export interface RecapDisplaySettings {
  readonly color: string
  readonly blankLineAbove: boolean
  readonly persist: boolean
}

// Colors are theme foreground keys. This allowlist keeps the recap readable
// across themes while offering prominent and subtle choices.
export const RECAP_COLORS = [
  "accent",
  "success",
  "warning",
  "error",
  "text",
  "mdLink",
  "mdHeading",
  "toolTitle",
  "muted",
  "dim",
] as const

export type RecapColor = (typeof RECAP_COLORS)[number]

export const DEFAULT_RECAP_DISPLAY: RecapDisplaySettings = {
  color: "muted",
  blankLineAbove: false,
  persist: false,
}

export function isRecapColor(value: string): value is RecapColor {
  return (RECAP_COLORS as readonly string[]).includes(value)
}

export function formatModelPreference(config: RecapModelConfig): string {
  if (config.kind === "configured") return formatRecapModelKey(config.model)
  if (config.kind === "invalid") return "invalid"
  return "default"
}

export function formatRecapModelKey({
  provider,
  id,
}: RecapModelPreference): string {
  return `${provider}/${id}`
}

export function formatAuthModelKey(auth: Model<Api>): string {
  return `${auth.provider}/${auth.id}`
}

export function parseModelSpec(
  value: string,
): RecapModelPreference | undefined {
  const trimmed = value.trim()
  const separator = trimmed.indexOf("/")
  if (separator <= 0 || separator === trimmed.length - 1) return undefined

  return {
    provider: trimmed.slice(0, separator),
    id: trimmed.slice(separator + 1),
  }
}

function readConfig(): RecapConfig {
  const content = readFileSync(CONFIG_PATH, "utf-8")
  const config = JSON.parse(content) as unknown
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as RecapConfig)
    : {}
}

function readConfigSafe(): RecapConfig {
  if (!existsSync(CONFIG_PATH)) return {}
  try {
    return readConfig()
  } catch {
    return {}
  }
}

function writeConfig(config: RecapConfig): void {
  const entries = Object.entries(config).filter(
    ([, value]) => value !== undefined,
  )
  if (entries.length === 0) {
    rmSync(CONFIG_PATH, { force: true })
    return
  }
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(
    CONFIG_PATH,
    `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`,
    "utf-8",
  )
}

export function saveModelPreference(
  modelPreference: RecapModelPreference,
): void {
  const config = readConfigSafe()
  config.model = formatRecapModelKey(modelPreference)
  writeConfig(config)
}

export function deleteRecapConfig(): void {
  // Reset only the model preference; preserve display settings.
  const config = readConfigSafe()
  delete config.model
  writeConfig(config)
}

export function saveDisplaySetting<K extends keyof RecapDisplaySettings>(
  key: K,
  value: RecapDisplaySettings[K] | undefined,
): void {
  const config = readConfigSafe()
  if (value === undefined) {
    delete config[key]
  } else {
    config[key] = value
  }
  writeConfig(config)
}

export function resolveDisplaySettings(): RecapDisplaySettings {
  const config = readConfigSafe()
  const color =
    typeof config.color === "string" && isRecapColor(config.color)
      ? config.color
      : DEFAULT_RECAP_DISPLAY.color
  const blankLineAbove =
    typeof config.blankLineAbove === "boolean"
      ? config.blankLineAbove
      : DEFAULT_RECAP_DISPLAY.blankLineAbove
  const persist =
    typeof config.persist === "boolean"
      ? config.persist
      : DEFAULT_RECAP_DISPLAY.persist
  return { color, blankLineAbove, persist }
}

export function resolveInitialModelConfig(): RecapModelConfig {
  if (!existsSync(CONFIG_PATH)) return { kind: "missing" }

  try {
    const config = readConfig()
    if (typeof config.model !== "string") return { kind: "invalid" }

    const model = parseModelSpec(config.model)
    return model ? { kind: "configured", model } : { kind: "invalid" }
  } catch {
    return { kind: "invalid" }
  }
}

async function hasModelApiKey(
  ctx: ExtensionContext,
  model: Model<Api>,
): Promise<boolean> {
  const registry = ctx.modelRegistry as unknown as {
    getProviderAuth?: (
      provider: string,
    ) => Promise<{ auth?: { apiKey?: string } } | undefined>
    getApiKeyForProvider?: (provider: string) => Promise<string | undefined>
    getApiKey?: (model: Model<Api>) => Promise<string | undefined>
  }

  if (typeof registry.getProviderAuth === "function") {
    try {
      const auth = await registry.getProviderAuth(model.provider)
      if (auth?.auth?.apiKey) return true
    } catch {
      // Fall through if getProviderAuth fails
    }
  }

  if (typeof registry.getApiKeyForProvider === "function") {
    try {
      const apiKey = await registry.getApiKeyForProvider(model.provider)
      if (apiKey) return true
    } catch {
      // Fall through
    }
  }

  if (typeof registry.getApiKey === "function") {
    try {
      const apiKey = await registry.getApiKey(model)
      if (apiKey) return true
    } catch {
      // Ignore
    }
  }

  return false
}

async function getModelAuth(
  ctx: ExtensionContext,
  modelPreference: RecapModelPreference,
): Promise<Model<Api> | undefined> {
  const model = ctx.modelRegistry.find(
    modelPreference.provider,
    modelPreference.id,
  )
  if (!model) return undefined

  const hasAuth = await hasModelApiKey(ctx, model)
  return hasAuth ? model : undefined
}

export async function getRecapModelAuth(
  ctx: ExtensionContext,
  config: RecapModelConfig,
): Promise<ResolvedRecapModelAuth> {
  if (config.kind === "invalid") return { status: "invalid-config" }

  if (config.kind === "configured") {
    const auth = await getModelAuth(ctx, config.model)
    return auth
      ? { status: "ok", auth, source: "configured" }
      : {
          status: "unauthenticated",
          model: config.model,
          source: "configured",
        }
  }

  const defaultAuth = await getModelAuth(ctx, DEFAULT_RECAP_MODEL)
  if (defaultAuth) {
    return { status: "ok", auth: defaultAuth, source: "default" }
  }

  return {
    status: "unauthenticated",
    model: DEFAULT_RECAP_MODEL,
    source: "default",
  }
}

export async function getAuthenticatedTextModelPreferences(
  ctx: ExtensionContext,
): Promise<RecapModelPreference[]> {
  const models = ctx.modelRegistry
    .getAll()
    .filter((model) => model.input.includes("text"))
  const authenticatedModels = await Promise.all(
    models.map(async (model) => {
      const hasAuth = await hasModelApiKey(ctx, model)
      return hasAuth ? toModelPreference(model) : undefined
    }),
  )

  return authenticatedModels
    .filter((model): model is RecapModelPreference => model !== undefined)
    .toSorted((left, right) =>
      formatRecapModelKey(left).localeCompare(formatRecapModelKey(right)),
    )
}

function toModelPreference(model: Model<Api>): RecapModelPreference {
  return { provider: model.provider, id: model.id }
}
