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
import {
  DEFAULT_RENAME_LANGUAGE,
  parseRenameLanguage,
  type RenameLanguage,
} from "./language.js"

const CONFIG_PATH = path.join(getAgentDir(), "extensions", "pi-rename.json")
const CONFIG_DIR = path.dirname(CONFIG_PATH)

export interface RenameModelPreference {
  readonly provider: string
  readonly id: string
}

export interface RenameModelAuth {
  readonly model: Model<Api>
}

export type RenameModelConfig =
  | { readonly kind: "missing" }
  | { readonly kind: "invalid" }
  | { readonly kind: "configured"; readonly model: RenameModelPreference }

export type ResolvedRenameModelAuth =
  | {
      readonly status: "ok"
      readonly auth: RenameModelAuth
      readonly source: "configured" | "default"
    }
  | { readonly status: "invalid-config" }
  | {
      readonly status: "unauthenticated"
      readonly model: RenameModelPreference | undefined
      readonly source: "configured" | "default"
    }

export const DEFAULT_RENAME_MODEL: RenameModelPreference = {
  provider: "openai-codex",
  id: "gpt-5.6-luna",
}

interface RenameConfig extends Record<string, unknown> {
  model?: unknown
  language?: unknown
}

export interface InitialRenameConfig {
  readonly modelConfig: RenameModelConfig
  readonly language: RenameLanguage
}

export function formatModelPreference(config: RenameModelConfig): string {
  if (config.kind === "configured") return formatRenameModelKey(config.model)
  if (config.kind === "invalid") return "invalid"
  return "default"
}

export function formatRenameModelKey({
  provider,
  id,
}: RenameModelPreference): string {
  return `${provider}/${id}`
}

export function formatAuthModelKey(auth: RenameModelAuth): string {
  return `${auth.model.provider}/${auth.model.id}`
}

export function parseModelSpec(
  value: string,
): RenameModelPreference | undefined {
  const trimmed = value.trim()
  const separator = trimmed.indexOf("/")
  if (separator <= 0 || separator === trimmed.length - 1) return undefined

  return {
    provider: trimmed.slice(0, separator),
    id: trimmed.slice(separator + 1),
  }
}

function readConfig(): RenameConfig {
  const content = readFileSync(CONFIG_PATH, "utf-8")
  const config = JSON.parse(content) as unknown
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as RenameConfig)
    : {}
}

function writeConfig(config: RenameConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
}

function readConfigForUpdate(): RenameConfig {
  if (!existsSync(CONFIG_PATH)) return {}

  try {
    return readConfig()
  } catch (error) {
    if (error instanceof SyntaxError) return {}
    throw error
  }
}

function updateConfig(update: Partial<RenameConfig>): void {
  writeConfig({ ...readConfigForUpdate(), ...update })
}

export function saveModelPreference(
  modelPreference: RenameModelPreference,
): void {
  updateConfig({ model: formatRenameModelKey(modelPreference) })
}

export function saveRenameLanguage(language: RenameLanguage): void {
  updateConfig({ language })
}

export function deleteModelPreference(): void {
  if (!existsSync(CONFIG_PATH)) return

  const config = readConfigForUpdate()
  delete config.model
  if (Object.keys(config).length === 0) {
    rmSync(CONFIG_PATH)
    return
  }

  writeConfig(config)
}

function resolveModelConfig(config: RenameConfig): RenameModelConfig {
  if (config.model === undefined) return { kind: "missing" }
  if (typeof config.model !== "string") return { kind: "invalid" }

  const model = parseModelSpec(config.model)
  return model ? { kind: "configured", model } : { kind: "invalid" }
}

export function resolveInitialRenameConfig(): InitialRenameConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {
      modelConfig: { kind: "missing" },
      language: DEFAULT_RENAME_LANGUAGE,
    }
  }

  try {
    const config = readConfig()
    return {
      modelConfig: resolveModelConfig(config),
      language: parseRenameLanguage(config.language) ?? DEFAULT_RENAME_LANGUAGE,
    }
  } catch {
    return {
      modelConfig: { kind: "invalid" },
      language: DEFAULT_RENAME_LANGUAGE,
    }
  }
}

async function getModelAuth(
  ctx: ExtensionContext,
  modelPreference: RenameModelPreference,
): Promise<RenameModelAuth | undefined> {
  const model = ctx.modelRegistry.find(
    modelPreference.provider,
    modelPreference.id,
  )
  if (!model) return undefined

  const auth = await ctx.modelRegistry.getProviderAuth(model.provider)
  return auth?.auth.apiKey ? { model } : undefined
}

export async function getRenameModelAuth(
  ctx: ExtensionContext,
  config: RenameModelConfig,
): Promise<ResolvedRenameModelAuth> {
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

  const defaultAuth = await getModelAuth(ctx, DEFAULT_RENAME_MODEL)
  if (defaultAuth) {
    return { status: "ok", auth: defaultAuth, source: "default" }
  }

  return {
    status: "unauthenticated",
    model: DEFAULT_RENAME_MODEL,
    source: "default",
  }
}

export async function getAuthenticatedTextModelPreferences(
  ctx: ExtensionContext,
): Promise<RenameModelPreference[]> {
  const models = ctx.modelRegistry
    .getAll()
    .filter((model) => model.input.includes("text"))
  const authenticatedModels = await Promise.all(
    models.map(async (model) => {
      const auth = await ctx.modelRegistry.getProviderAuth(model.provider)
      return auth?.auth.apiKey ? toModelPreference(model) : undefined
    }),
  )

  return authenticatedModels
    .filter((model): model is RenameModelPreference => model !== undefined)
    .toSorted((left, right) =>
      formatRenameModelKey(left).localeCompare(formatRenameModelKey(right)),
    )
}

function toModelPreference(model: Model<Api>): RenameModelPreference {
  return { provider: model.provider, id: model.id }
}
