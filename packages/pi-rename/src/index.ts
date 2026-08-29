import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { AgentMessage } from "@earendil-works/pi-agent-core"
import {
  CancellableLoader,
  type AutocompleteItem,
} from "@earendil-works/pi-tui"
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import { buildSessionContext } from "@earendil-works/pi-coding-agent"
import { pickRenameModel } from "./model-picker.js"
import {
  DEFAULT_RENAME_LANGUAGE,
  parseRenameLanguage,
  type RenameLanguage,
} from "./language.js"
import {
  deleteModelPreference,
  formatAuthModelKey,
  formatModelPreference,
  formatRenameModelKey,
  getAuthenticatedTextModelPreferences,
  getRenameModelAuth,
  resolveInitialRenameConfig,
  saveModelPreference,
  saveRenameLanguage,
  type RenameModelConfig,
} from "./models.js"
import { isTemporaryHerdrLabel } from "./herdr-label.js"
import { generateRename, getUserMessageContext } from "./naming.js"

const execFileAsync = promisify(execFile)
interface SessionContextReader {
  buildSessionContext(): { messages: AgentMessage[] }
}

interface RenameState {
  modelConfig: RenameModelConfig
  language: RenameLanguage
}

const RENAME_SUBCOMMANDS: AutocompleteItem[] = [
  {
    value: "status",
    label: "status",
    description: "Show model and rename status",
  },
  {
    value: "config",
    label: "config",
    description: "Choose the rename model",
  },
  {
    value: "help",
    label: "help",
    description: "List rename commands",
  },
]

function createRenameState(): RenameState {
  return {
    modelConfig: { kind: "missing" },
    language: DEFAULT_RENAME_LANGUAGE,
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

interface HerdrPaneInfo {
  readonly id: string
  readonly label?: string
  readonly tabId: string
}

interface HerdrTabInfo {
  readonly id: string
  readonly label?: string
  readonly number?: number
  readonly paneCount?: number
}

interface HerdrContext {
  readonly pane: HerdrPaneInfo
  readonly tab: HerdrTabInfo
}

function extractPaneInfo(stdout: string): HerdrPaneInfo | undefined {
  const parsed = asRecord(JSON.parse(stdout) as unknown)
  const result = asRecord(parsed?.["result"])
  const pane = asRecord(result?.["pane"])
  const paneId = pane?.["pane_id"]
  const tabId = pane?.["tab_id"]

  if (
    typeof paneId !== "string" ||
    !paneId.trim() ||
    typeof tabId !== "string" ||
    !tabId.trim()
  ) {
    return undefined
  }

  const label = pane?.["label"]
  return {
    id: paneId,
    tabId,
    ...(typeof label === "string" ? { label } : {}),
  }
}

function extractTabInfo(stdout: string): HerdrTabInfo | undefined {
  const parsed = asRecord(JSON.parse(stdout) as unknown)
  const result = asRecord(parsed?.["result"])
  const tab = asRecord(result?.["tab"])
  const tabId = tab?.["tab_id"]

  if (typeof tabId !== "string" || !tabId.trim()) return undefined

  const label = tab?.["label"]
  const number = tab?.["number"]
  const paneCount = tab?.["pane_count"]

  return {
    id: tabId,
    ...(typeof label === "string" ? { label } : {}),
    ...(typeof number === "number" ? { number } : {}),
    ...(typeof paneCount === "number" ? { paneCount } : {}),
  }
}

async function getCurrentHerdrContext(): Promise<HerdrContext | undefined> {
  const paneId = process.env["HERDR_PANE_ID"]?.trim()
  if (!paneId) return undefined

  const { stdout: paneStdout } = await execFileAsync("herdr", [
    "pane",
    "get",
    paneId,
  ])
  const pane = extractPaneInfo(paneStdout)
  if (!pane) return undefined

  const { stdout: tabStdout } = await execFileAsync("herdr", [
    "tab",
    "get",
    pane.tabId,
  ])
  const tab = extractTabInfo(tabStdout)
  return tab ? { pane, tab } : undefined
}

function isDefaultHerdrTabLabel(tab: HerdrTabInfo): boolean {
  const label = tab.label?.trim()
  if (!label) return true

  return typeof tab.number === "number" && label === String(tab.number)
}

function canRenameSessionStart(context: HerdrContext): boolean {
  const singlePane = context.tab.paneCount === 1
  const label = singlePane ? context.tab.label : context.pane.label
  return (
    (singlePane ? isDefaultHerdrTabLabel(context.tab) : !label?.trim()) ||
    isTemporaryHerdrLabel(label)
  )
}

async function renameHerdrTarget(
  context: HerdrContext,
  name: string,
): Promise<boolean> {
  await execFileAsync("herdr", ["pane", "rename", context.pane.id, name])
  if (context.tab.paneCount === 1) {
    await execFileAsync("herdr", ["tab", "rename", context.tab.id, name])
  }
  return true
}

async function renameCurrentHerdrTarget(name: string): Promise<boolean> {
  const context = await getCurrentHerdrContext()
  return context ? renameHerdrTarget(context, name) : false
}

async function renameCurrentHerdrTargetIfDefault(
  name: string,
): Promise<boolean> {
  const context = await getCurrentHerdrContext()
  if (
    !context ||
    !canRenameSessionStart(context) ||
    context.tab.label?.trim() === name ||
    context.pane.label?.trim() === name
  ) {
    return false
  }

  return renameHerdrTarget(context, name)
}

function hasSessionContextReader(
  value: unknown,
): value is SessionContextReader {
  return (
    typeof value === "object" &&
    value !== null &&
    "buildSessionContext" in value &&
    typeof value.buildSessionContext === "function"
  )
}

function getCurrentSessionMessages(ctx: ExtensionContext): AgentMessage[] {
  if (hasSessionContextReader(ctx.sessionManager)) {
    return ctx.sessionManager.buildSessionContext().messages
  }

  return buildSessionContext(
    ctx.sessionManager.getEntries(),
    ctx.sessionManager.getLeafId(),
  ).messages
}

async function applyRename(pi: ExtensionAPI, name: string): Promise<boolean> {
  pi.setSessionName(name)
  return renameCurrentHerdrTarget(name)
}

async function runRenameCommand(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: RenameState,
): Promise<void> {
  const context = getUserMessageContext(getCurrentSessionMessages(ctx))
  if (!context) {
    ctx.ui.notify("No conversation to rename yet.", "warning")
    return
  }

  if (ctx.mode === "tui") {
    ctx.ui.setWidget("pi-rename", (tui, theme) => {
      const color = (text: string) => theme.fg("dim", text)
      return new CancellableLoader(tui, color, color, "renaming session...")
    })
  }
  try {
    const result = await generateRename(
      ctx,
      state.modelConfig,
      context,
      state.language,
    )
    if (!result) {
      ctx.ui.notify("Could not generate a session name.", "error")
      return
    }

    let renamedHerdr = false
    let herdrError: string | undefined

    try {
      renamedHerdr = await applyRename(pi, result.name)
    } catch (error) {
      herdrError = error instanceof Error ? error.message : String(error)
    }

    if (result.source === "fallback") {
      ctx.ui.notify(
        [
          `Session renamed with fallback: ${result.name}`,
          `Could not use rename model: ${result.reason}`,
          ...(herdrError ? [`Herdr label rename failed: ${herdrError}`] : []),
        ].join("\n"),
        "warning",
      )
      return
    }

    if (herdrError) {
      ctx.ui.notify(
        `Session renamed, but Herdr label rename failed: ${herdrError}`,
        "warning",
      )
      return
    }

    ctx.ui.notify(
      renamedHerdr
        ? `Session and Herdr label renamed: ${result.name}`
        : `Session renamed: ${result.name}`,
      "info",
    )
  } finally {
    if (ctx.mode === "tui") ctx.ui.setWidget("pi-rename", undefined)
  }
}

function getRenameArgumentCompletions(
  prefix: string,
): AutocompleteItem[] | null {
  const query = prefix.trimStart().toLowerCase()
  const items = RENAME_SUBCOMMANDS.filter((item) =>
    item.value.startsWith(query),
  )
  return items.length > 0 ? items : null
}

async function configureRenameModel(
  ctx: ExtensionContext,
  state: RenameState,
): Promise<void> {
  const models = await getAuthenticatedTextModelPreferences(ctx)
  if (models.length === 0) {
    ctx.ui.notify(
      "No authenticated models available. Run /login or configure a model first.",
      "error",
    )
    return
  }

  const result = await pickRenameModel(ctx, models)
  if (result.action === "cancel") return

  try {
    if (result.action === "default") {
      deleteModelPreference()
      state.modelConfig = { kind: "missing" }
      ctx.ui.notify("Rename model reset to default.", "info")
      return
    }

    saveModelPreference(result.model)
    state.modelConfig = { kind: "configured", model: result.model }
    ctx.ui.notify(
      `Rename model set to ${formatRenameModelKey(result.model)}.`,
      "info",
    )
  } catch (error) {
    const reason =
      error instanceof SyntaxError ? "invalid JSON" : "write failed"
    ctx.ui.notify(`Could not update rename config: ${reason}.`, "error")
  }
}

function configureRenameLanguage(
  ctx: ExtensionContext,
  state: RenameState,
  value: string | undefined,
): void {
  const language = parseRenameLanguage(value)
  if (!language) {
    ctx.ui.notify("Use /rename config language <auto|BCP-47>", "error")
    return
  }

  try {
    saveRenameLanguage(language)
    state.language = language
    ctx.ui.notify(`Rename language set to ${language}.`, "info")
  } catch (error) {
    const reason =
      error instanceof SyntaxError ? "invalid JSON" : "write failed"
    ctx.ui.notify(`Could not update rename config: ${reason}.`, "error")
  }
}

async function notifyRenameStatus(
  ctx: ExtensionContext,
  state: RenameState,
): Promise<void> {
  let selectedModelLine = `selected model: ${formatModelPreference(state.modelConfig)}`
  let activeModelLine: string

  try {
    const modelAuth = await getRenameModelAuth(ctx, state.modelConfig)
    if (modelAuth.status === "ok") {
      const suffix = modelAuth.source === "default" ? " (default)" : ""
      selectedModelLine = `selected model: ${formatAuthModelKey(modelAuth.auth)}${suffix}`
      activeModelLine = `active model: ${formatAuthModelKey(modelAuth.auth)}`
    } else if (modelAuth.status === "invalid-config") {
      activeModelLine = "active model: none (invalid config)"
    } else {
      activeModelLine = "active model: none"
    }
  } catch {
    activeModelLine = "active model: unknown (auth check failed)"
  }

  const context = getUserMessageContext(getCurrentSessionMessages(ctx))
  const herdrLine = `herdr: ${process.env["HERDR_PANE_ID"]?.trim() ? "available" : "unavailable"}`
  const contextLine = `context: ${context?.count ?? 0} user messages`

  ctx.ui.notify(
    [
      "pi-rename status",
      selectedModelLine,
      activeModelLine,
      `language: ${state.language}`,
      herdrLine,
      contextLine,
    ].join("\n"),
    "info",
  )
}

function registerRenameCommand(pi: ExtensionAPI, state: RenameState): void {
  pi.registerCommand("rename", {
    description: "generate a session name",
    getArgumentCompletions: getRenameArgumentCompletions,
    handler: async (args, ctx) => {
      const [action = "", ...actionArgs] = args.trim().split(/\s+/u)
      const normalizedAction = action.toLowerCase()

      if (!normalizedAction) {
        await runRenameCommand(pi, ctx, state)
        return
      }

      if (normalizedAction === "help") {
        ctx.ui.notify(
          [
            "pi-rename commands",
            "/rename - generate and apply a session name",
            "/rename status - show model and rename status",
            "/rename config - choose the rename model",
            "/rename config language <auto|BCP-47> - set name language",
            "/rename help - show this help",
          ].join("\n"),
          "info",
        )
        return
      }

      if (normalizedAction === "status") {
        await notifyRenameStatus(ctx, state)
        return
      }

      if (normalizedAction === "config") {
        const [setting, value, extra] = actionArgs
        if (!setting) {
          await configureRenameModel(ctx, state)
          return
        }

        if (setting.toLowerCase() === "language" && !extra) {
          configureRenameLanguage(ctx, state, value)
          return
        }

        ctx.ui.notify("Use /rename config language <auto|BCP-47>", "error")
        return
      }

      ctx.ui.notify("Use /rename [config|help|status]", "error")
    },
  })
}

export default function (pi: ExtensionAPI): void {
  const state = createRenameState()

  registerRenameCommand(pi, state)

  pi.on("session_start", async () => {
    const initialConfig = resolveInitialRenameConfig()
    state.modelConfig = initialConfig.modelConfig
    state.language = initialConfig.language

    const sessionName = pi.getSessionName()?.trim()
    if (!sessionName) return

    try {
      await renameCurrentHerdrTargetIfDefault(sessionName)
    } catch {
      // Keep session startup quiet if Herdr is unavailable or rejects the rename.
    }
  })
}
