import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import { registerTps } from "./tps.js"

type FastConfig = {
  models: string[]
  tpsEnabled: boolean
}

type Model = NonNullable<ExtensionContext["model"]>
const CONFIG_PATH = join(getAgentDir(), "extensions", "pi-fast-mode.json")
const DEFAULT_SERVICE_TIER = "priority"
const FAST_TARGETS = new Set([
  "openai/gpt-5.4",
  "openai/gpt-5.5",
  "openai/gpt-5.6",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "openai-codex/gpt-5.4",
  "openai-codex/gpt-5.5",
  "openai-codex/gpt-5.6",
  "openai-codex/gpt-5.6-sol",
  "openai-codex/gpt-5.6-terra",
  "openai-codex/gpt-5.6-luna",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function modelKey(model: Model): string {
  return `${model.provider}/${model.id}`
}

function parseConfig(value: unknown): FastConfig {
  if (
    !isRecord(value) ||
    !Array.isArray(value["models"]) ||
    value["models"].some((model) => typeof model !== "string")
  ) {
    throw new Error('expected { "models": string[] }')
  }

  const tpsEnabled = value["tpsEnabled"]
  if (tpsEnabled !== undefined && typeof tpsEnabled !== "boolean") {
    throw new Error('expected "tpsEnabled" to be boolean')
  }

  return {
    models: [...new Set(value["models"])],
    tpsEnabled: tpsEnabled ?? true,
  }
}

function readConfig(): FastConfig {
  let content: string
  try {
    content = readFileSync(CONFIG_PATH, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { models: [], tpsEnabled: true }
    }
    throw error
  }

  try {
    return parseConfig(JSON.parse(content))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid ${CONFIG_PATH}: ${reason}`, { cause: error })
  }
}

function writeConfig(models: Set<string>, tpsEnabled: boolean): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(
    CONFIG_PATH,
    `${JSON.stringify(
      { models: [...models].toSorted(), tpsEnabled },
      null,
      2,
    )}\n`,
    "utf8",
  )
}

function isFastModel(
  model: Model | undefined,
  enabledModels: Set<string>,
): boolean {
  if (!model) return false
  const key = modelKey(model)
  return FAST_TARGETS.has(key) && enabledModels.has(key)
}

function notify(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  message: string,
  type: "info" | "error" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, type)
}

export default function piFastExtension(pi: ExtensionAPI): void {
  let enabledModels = new Set<string>()
  let tpsEnabled = true
  const setTpsEnabled = registerTps(pi, (enabled) => {
    writeConfig(enabledModels, enabled)
    tpsEnabled = enabled
  })

  function loadConfig(ctx: ExtensionContext): void {
    enabledModels = new Set()
    tpsEnabled = true
    try {
      const config = readConfig()
      enabledModels = new Set(config.models)
      tpsEnabled = config.tpsEnabled
    } catch (error) {
      notify(
        ctx,
        error instanceof Error ? error.message : String(error),
        "error",
      )
    }
    setTpsEnabled(tpsEnabled, ctx)
  }

  pi.registerCommand("fast", {
    description: "Toggle Fast Mode for a model",
    handler: async (args, ctx) => {
      if (args.trim()) {
        notify(ctx, "Usage: /fast", "error")
        return
      }
      if (!ctx.hasUI) return

      const models = [...FAST_TARGETS].toSorted()
      const selected = await ctx.ui.select(
        "Toggle Fast Mode:",
        models.map(
          (model) => `${enabledModels.has(model) ? "✓" : " "} ${model}`,
        ),
      )
      if (!selected) return

      const key = selected.slice(2)
      const nextEnabledModels = new Set(enabledModels)
      const enabled = !nextEnabledModels.has(key)
      if (enabled) nextEnabledModels.add(key)
      else nextEnabledModels.delete(key)

      try {
        writeConfig(nextEnabledModels, tpsEnabled)
        enabledModels = nextEnabledModels
      } catch (error) {
        notify(
          ctx,
          error instanceof Error ? error.message : String(error),
          "error",
        )
        return
      }

      notify(ctx, `Fast Mode ${enabled ? "enabled" : "disabled"} for ${key}.`)
    },
  })

  pi.on("session_start", (_event, ctx) => {
    loadConfig(ctx)
  })

  pi.on("before_provider_request", (event, ctx) => {
    if (!isFastModel(ctx.model, enabledModels) || !isRecord(event.payload)) {
      return undefined
    }

    return { ...event.payload, service_tier: DEFAULT_SERVICE_TIER }
  })
}
