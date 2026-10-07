import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import { isOpenAIProvider } from "./fast-models.js"
import {
  parseFastConfig,
  resolveToggleFastShortcut,
  type FastConfig,
} from "./fast-config.js"
import { registerTps } from "./tps.js"

const CONFIG_PATH = join(getAgentDir(), "extensions", "pi-fast-mode.json")
const AMP_SETTINGS_PATH = join(homedir(), ".config", "amp", "settings.json")
const DEFAULT_SERVICE_TIER = "priority"
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function readConfig(): FastConfig {
  let content: string
  try {
    content = readFileSync(CONFIG_PATH, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { enabled: false, tpsEnabled: true }
    }
    throw error
  }

  try {
    return parseFastConfig(JSON.parse(content))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid ${CONFIG_PATH}: ${reason}`, { cause: error })
  }
}

function readAmpToggleFast(): string | undefined {
  let content: string
  try {
    content = readFileSync(AMP_SETTINGS_PATH, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }

  const settings: unknown = JSON.parse(content)
  if (!isRecord(settings) || !isRecord(settings["amp.keymap"])) {
    return undefined
  }
  const shortcut = settings["amp.keymap"]["speed.toggleFast"]
  return typeof shortcut === "string" ? shortcut : undefined
}

function writeConfig(
  enabled: boolean,
  tpsEnabled: boolean,
  toggleFast: string | undefined,
): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(
    CONFIG_PATH,
    `${JSON.stringify(
      {
        enabled,
        tpsEnabled,
        ...(toggleFast !== undefined ? { toggleFast } : {}),
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
}

function isFastModelEnabled(
  model: ExtensionContext["model"],
  enabled: boolean,
): boolean {
  return Boolean(enabled && model && isOpenAIProvider(model.provider))
}

function notify(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  message: string,
  type: "info" | "warning" | "error" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, type)
}

export default function piFastExtension(pi: ExtensionAPI): void {
  let fastModeEnabled = false
  let tpsEnabled = true
  let toggleFast: string | undefined
  let startupConfig: FastConfig = { enabled: false, tpsEnabled: true }
  let startupConfigError: string | undefined
  try {
    startupConfig = readConfig()
  } catch (error) {
    startupConfigError = error instanceof Error ? error.message : String(error)
  }
  fastModeEnabled = startupConfig.enabled
  tpsEnabled = startupConfig.tpsEnabled
  toggleFast = startupConfig.toggleFast

  let ampToggleFast: string | undefined
  let shortcutWarning: string | undefined
  try {
    ampToggleFast = readAmpToggleFast()
  } catch (error) {
    shortcutWarning = `Could not read ${AMP_SETTINGS_PATH}: ${error instanceof Error ? error.message : String(error)}`
  }
  const shortcutResolution = resolveToggleFastShortcut(
    toggleFast,
    ampToggleFast,
  )
  shortcutWarning ??= shortcutResolution.warning

  const setTpsEnabled = registerTps(pi, (enabled) => {
    writeConfig(fastModeEnabled, enabled, toggleFast)
    tpsEnabled = enabled
  })

  function updateFastStatus(ctx: ExtensionContext): void {
    ctx.ui.setStatus(
      "fast-mode",
      isFastModelEnabled(ctx.model, fastModeEnabled) ? "↯" : undefined,
    )
  }

  function loadConfig(ctx: ExtensionContext): void {
    if (startupConfigError) notify(ctx, startupConfigError, "error")
    if (shortcutWarning) notify(ctx, shortcutWarning, "warning")
    setTpsEnabled(tpsEnabled, ctx)
    updateFastStatus(ctx)
  }

  function toggleFastMode(ctx: ExtensionContext): void {
    const nextEnabled = !fastModeEnabled
    try {
      writeConfig(nextEnabled, tpsEnabled, toggleFast)
    } catch (error) {
      notify(
        ctx,
        error instanceof Error ? error.message : String(error),
        "error",
      )
      return
    }

    fastModeEnabled = nextEnabled
    updateFastStatus(ctx)
    notify(ctx, `Fast Mode ${nextEnabled ? "enabled" : "disabled"}.`)
  }

  pi.registerShortcut(shortcutResolution.shortcut, {
    description: "Toggle Fast Mode",
    handler: toggleFastMode,
  })

  pi.registerCommand("fast", {
    description: "Toggle Fast Mode",
    handler: async (args, ctx) => {
      if (args.trim()) {
        notify(ctx, "Usage: /fast", "error")
        return
      }
      toggleFastMode(ctx)
    },
  })

  pi.on("session_start", (_event, ctx) => {
    loadConfig(ctx)
  })

  pi.on("model_select", (_event, ctx) => {
    updateFastStatus(ctx)
  })

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode === "tui") ctx.ui.setStatus("fast-mode", undefined)
  })

  pi.on("before_provider_request", (event, ctx) => {
    if (
      !isFastModelEnabled(ctx.model, fastModeEnabled) ||
      !isRecord(event.payload)
    ) {
      return undefined
    }

    return { ...event.payload, service_tier: DEFAULT_SERVICE_TIER }
  })
}
