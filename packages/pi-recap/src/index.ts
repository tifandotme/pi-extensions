import type { AgentMessage } from "@earendil-works/pi-agent-core"
import type { Message } from "@earendil-works/pi-ai"
import type { AutocompleteItem } from "@earendil-works/pi-tui"
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent"
import {
  buildSessionContext,
  convertToLlm,
  serializeConversation,
} from "@earendil-works/pi-coding-agent"
import { pickRecapModel } from "./model-picker.js"
import {
  deleteRecapConfig,
  formatAuthModelKey,
  formatModelPreference,
  formatRecapModelKey,
  getAuthenticatedTextModelPreferences,
  getRecapModelAuth,
  resolveInitialModelConfig,
  saveModelPreference,
  type RecapModelConfig,
  type ResolvedRecapModelAuth,
} from "./models.js"
import { sanitizeRecapText } from "./sanitize.js"
import {
  clearNoModelWarning,
  clearWidget,
  notifyUser,
  showLoadingWidget,
  showNoModelWarning,
  showWidget,
} from "./tui.js"

const RECAP_MAX_TOKENS = 160
const RECAP_REQUEST_TIMEOUT_MS = 4_000
const AWAY_RECAP_DELAY_MS = 5 * 60 * 1_000
const RECAP_ENTRY_TYPE = "pi-recap:state"

interface PersistedRecapState {
  version: 2
  lastRecap: string
  contextLeafId: string | null
}

interface SessionContextReader {
  buildSessionContext(): { messages: AgentMessage[] }
}

function isRecapStateEntry(entry: SessionEntry): boolean {
  return entry.type === "custom" && entry.customType === RECAP_ENTRY_TYPE
}

function getRecapContextLeafId(ctx: ExtensionContext): string | null {
  const contextEntry = ctx.sessionManager
    .getBranch()
    .toReversed()
    .find((entry) => !isRecapStateEntry(entry))

  return contextEntry?.id ?? null
}

const RECAP_SUBCOMMANDS: AutocompleteItem[] = [
  {
    value: "status",
    label: "status",
    description: "Show model and recap status",
  },
  {
    value: "config",
    label: "config",
    description: "Choose the recap model",
  },
  {
    value: "help",
    label: "help",
    description: "List recap commands",
  },
]

const RECAP_SYSTEM_PROMPT = `You write compact recaps for an AI coding-agent session.

Given the current session context, produce one plain-text sentence for the user to resume later.
Start with the user's goal or reason for the session, inferred from user messages. Do not start with the assistant's answer.
Then include the current outcome, important decision, touched file, blocker, or likely next action only if it helps resume.
Prefer: Goal/purpose. Current state. Next action.
Target about 160 characters. Stay under 240 characters.
Do not add a label or prefix. Do not use markdown. Do not mention yourself as "the assistant".

Good: Deciding whether pi-inline-skills should switch from $skill to /skill. Recommendation is / only with commands winning; next decide whether leading /skill should expand.
Bad: Feasible; I’d default to / and skip config. Extension commands win first; next decide whether leading /skill tokens should expand.`

interface RecapState {
  sessionActive: boolean
  runId: number
  modelConfig: RecapModelConfig
  lastRecap: string
  visible: boolean
  stale: boolean
  lastRecapCurrent: boolean
  skipNextAwayRecap: boolean
  abortController: AbortController | undefined
  awayTimer: ReturnType<typeof setTimeout> | undefined
}

function createRecapState(): RecapState {
  return {
    sessionActive: false,
    runId: 0,
    modelConfig: { kind: "missing" },
    lastRecap: "",
    visible: false,
    stale: false,
    lastRecapCurrent: false,
    skipNextAwayRecap: false,
    abortController: undefined,
    awayTimer: undefined,
  }
}

function abortPendingGeneration(state: RecapState): void {
  state.abortController?.abort()
  state.abortController = undefined
}

function clearAwayTimer(state: RecapState): void {
  if (!state.awayTimer) return
  clearTimeout(state.awayTimer)
  state.awayTimer = undefined
}

function hideRecap(ctx: ExtensionContext, state: RecapState): void {
  state.visible = false
  clearWidget(ctx)
}

function resetRecapSession(ctx: ExtensionContext, state: RecapState): void {
  state.runId++
  state.lastRecap = ""
  state.visible = false
  state.stale = false
  state.lastRecapCurrent = false
  state.skipNextAwayRecap = false
  clearAwayTimer(state)
  abortPendingGeneration(state)
  clearWidget(ctx)
  clearNoModelWarning(ctx)
}

function extractTextContent(
  content: readonly { readonly type: string; readonly text?: string }[],
): string {
  return content
    .filter(
      (item): item is { readonly type: string; readonly text: string } =>
        item.type === "text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n")
}

function isPersistedRecapState(data: unknown): data is PersistedRecapState {
  if (!data || typeof data !== "object") return false
  const candidate = data as Partial<PersistedRecapState>
  return (
    candidate.version === 2 &&
    typeof candidate.lastRecap === "string" &&
    (typeof candidate.contextLeafId === "string" ||
      candidate.contextLeafId === null)
  )
}

function restoreRecapState(ctx: ExtensionContext, state: RecapState): void {
  const latestEntry = ctx.sessionManager
    .getBranch()
    .toReversed()
    .find(
      (entry) =>
        entry.type === "custom" &&
        entry.customType === RECAP_ENTRY_TYPE &&
        isPersistedRecapState(entry.data),
    )

  if (latestEntry?.type !== "custom") return
  if (!isPersistedRecapState(latestEntry.data)) return

  state.lastRecap = latestEntry.data.lastRecap
  state.lastRecapCurrent =
    latestEntry.id === ctx.sessionManager.getLeafId() &&
    latestEntry.data.contextLeafId === getRecapContextLeafId(ctx)
}

function showRestoredRecap(ctx: ExtensionContext, state: RecapState): boolean {
  if (!state.lastRecap || !state.lastRecapCurrent) return false

  state.visible = true
  showWidget(ctx, state.lastRecap)
  return true
}

function persistRecapState(
  pi: ExtensionAPI,
  state: RecapState,
  contextLeafId: string | null,
): void {
  pi.appendEntry<PersistedRecapState>(RECAP_ENTRY_TYPE, {
    version: 2,
    lastRecap: state.lastRecap,
    contextLeafId,
  })
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

function getCurrentSessionMessages(
  ctx: ExtensionContext,
  contextLeafId: string | null,
): AgentMessage[] {
  if (
    contextLeafId === ctx.sessionManager.getLeafId() &&
    hasSessionContextReader(ctx.sessionManager)
  ) {
    return ctx.sessionManager.buildSessionContext().messages
  }

  return buildSessionContext(ctx.sessionManager.getEntries(), contextLeafId)
    .messages
}

function buildPrompt(messages: AgentMessage[]): Message {
  const conversationText = serializeConversation(convertToLlm(messages))
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: ["## Current Session Context", conversationText].join("\n"),
      },
    ],
    timestamp: Date.now(),
  }
}

async function generateRecap(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: RecapState,
  options: { manual: boolean },
): Promise<void> {
  if (!ctx.hasUI) return

  const contextLeafId = getRecapContextLeafId(ctx)
  const messages = getCurrentSessionMessages(ctx, contextLeafId)
  if (messages.length === 0) {
    if (options.manual) notifyUser(ctx, "No conversation to recap yet.", "info")
    return
  }

  if (options.manual) showLoadingWidget(ctx)

  const runId = state.runId
  const modelAuth = await getRecapModelAuth(ctx, state.modelConfig)
  if (runId !== state.runId || !state.sessionActive) return

  if (modelAuth.status !== "ok") {
    if (options.manual) clearWidget(ctx)
    handleMissingRecapModel(ctx, modelAuth, options)
    return
  }

  const abortController = new AbortController()
  abortPendingGeneration(state)
  state.abortController = abortController

  try {
    const response = await ctx.modelRegistry.complete(
      modelAuth.auth,
      {
        systemPrompt: RECAP_SYSTEM_PROMPT,
        messages: [buildPrompt(messages)],
      },
      {
        maxTokens: RECAP_MAX_TOKENS,
        maxRetries: 0,
        cacheRetention: "none",
        timeoutMs: RECAP_REQUEST_TIMEOUT_MS,
        signal: abortController.signal,
      },
    )

    if (runId !== state.runId || !state.sessionActive) return
    if (response.stopReason !== "stop") {
      if (options.manual) {
        clearWidget(ctx)
        notifyUser(ctx, "Recap generation failed.", "error")
      }
      return
    }

    const recap = sanitizeRecapText(extractTextContent(response.content))
    if (!recap) {
      if (options.manual) {
        clearWidget(ctx)
        notifyUser(ctx, "Recap generation returned empty text.", "error")
      }
      return
    }

    state.lastRecap = recap
    state.visible = true
    state.stale = false
    persistRecapState(pi, state, contextLeafId)
    state.lastRecapCurrent = true
    clearNoModelWarning(ctx)
    showWidget(ctx, recap)
  } catch {
    if (options.manual) {
      clearWidget(ctx)
      notifyUser(ctx, "Recap generation failed.", "error")
    }
    // Automatic recaps are best-effort. Keep the previous recap on transient failures.
  } finally {
    if (state.abortController === abortController) {
      state.abortController = undefined
    }
  }
}

function handleMissingRecapModel(
  ctx: ExtensionContext,
  modelAuth: Exclude<ResolvedRecapModelAuth, { status: "ok" }>,
  options: { manual: boolean },
): void {
  if (!options.manual) {
    showNoModelWarning(ctx)
    return
  }

  if (modelAuth.status === "invalid-config") {
    notifyUser(ctx, "Invalid recap model config. Run /recap config.", "error")
    return
  }

  if (modelAuth.source === "configured" && modelAuth.model) {
    notifyUser(
      ctx,
      `Recap model is not authenticated: ${formatRecapModelKey(modelAuth.model)}. Run /recap config.`,
      "error",
    )
    return
  }

  notifyUser(
    ctx,
    "No default recap model authenticated. Run /recap config.",
    "error",
  )
}

function scheduleAwayRecap(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: RecapState,
): void {
  clearAwayTimer(state)
  state.awayTimer = setTimeout(() => {
    state.awayTimer = undefined
    if (!state.sessionActive || !state.stale || !ctx.isIdle()) return
    state.stale = false
    void generateRecap(pi, ctx, state, { manual: false })
  }, AWAY_RECAP_DELAY_MS)
}

function isRecapCommand(text: string): boolean {
  return /^\/recap(?:\s|$)/u.test(text.trimStart())
}

function getRecapArgumentCompletions(
  prefix: string,
): AutocompleteItem[] | null {
  const query = prefix.trimStart().toLowerCase()
  const items = RECAP_SUBCOMMANDS.filter((item) => item.value.startsWith(query))
  return items.length > 0 ? items : null
}

async function configureRecapModel(
  ctx: ExtensionContext,
  state: RecapState,
): Promise<void> {
  const models = await getAuthenticatedTextModelPreferences(ctx)
  if (models.length === 0) {
    notifyUser(
      ctx,
      "No authenticated models available. Run /login or configure a model first.",
      "error",
    )
    return
  }

  const result = await pickRecapModel(ctx, models)
  if (result.action === "cancel") return

  try {
    if (result.action === "default") {
      deleteRecapConfig()
      state.modelConfig = { kind: "missing" }
      notifyUser(ctx, "Recap model reset to default.", "info")
      return
    }

    saveModelPreference(result.model)
    state.modelConfig = { kind: "configured", model: result.model }
    notifyUser(
      ctx,
      `Recap model set to ${formatRecapModelKey(result.model)}.`,
      "info",
    )
  } catch (error) {
    const reason =
      error instanceof SyntaxError ? "invalid JSON" : "write failed"
    notifyUser(ctx, `Could not update recap config: ${reason}.`, "error")
  }
}

function registerRecapCommand(pi: ExtensionAPI, state: RecapState): void {
  pi.registerCommand("recap", {
    description: "generate a one-line session recap",
    getArgumentCompletions: getRecapArgumentCompletions,
    handler: async (args, ctx) => {
      const action = args.trim().split(/\s+/u)[0]?.toLowerCase() ?? ""

      clearAwayTimer(state)

      if (!action) {
        await generateRecap(pi, ctx, state, { manual: true })
        return
      }

      if (action === "help") {
        notifyUser(
          ctx,
          [
            "pi-recap commands",
            "/recap - generate and show a fresh recap",
            "/recap status - show model and recap status",
            "/recap config - choose the recap model",
            "/recap help - show this help",
          ].join("\n"),
          "info",
        )
        return
      }

      if (action === "status") {
        await notifyRecapStatus(ctx, state)
        return
      }

      if (action === "config") {
        await configureRecapModel(ctx, state)
        return
      }

      notifyUser(ctx, "Use /recap [config|help|status]", "error")
    },
  })
}

async function notifyRecapStatus(
  ctx: ExtensionContext,
  state: RecapState,
): Promise<void> {
  let selectedModelLine = `selected model: ${formatModelPreference(state.modelConfig)}`
  let activeModelLine: string

  try {
    const modelAuth = await getRecapModelAuth(ctx, state.modelConfig)
    if (modelAuth.status === "ok") {
      clearNoModelWarning(ctx)
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

  const lastRecapStatus = state.lastRecap
    ? state.lastRecapCurrent
      ? "current"
      : "stale"
    : "none"
  const lastRecapLine = `last recap: ${lastRecapStatus}`
  const visibleLine = `visible: ${state.visible ? "yes" : "no"}`
  notifyUser(
    ctx,
    [
      "pi-recap status",
      selectedModelLine,
      activeModelLine,
      lastRecapLine,
      visibleLine,
    ].join("\n"),
    "info",
  )
}

export default function (pi: ExtensionAPI): void {
  const state = createRecapState()

  registerRecapCommand(pi, state)

  pi.on("session_start", (_event, ctx) => {
    state.sessionActive = true
    state.modelConfig = resolveInitialModelConfig()
    resetRecapSession(ctx, state)
    restoreRecapState(ctx, state)

    if (showRestoredRecap(ctx, state)) return

    void generateRecap(pi, ctx, state, { manual: false })
  })

  pi.on("input", (event, ctx) => {
    if (event.source === "extension") return { action: "continue" as const }

    clearAwayTimer(state)

    if (!isRecapCommand(event.text)) {
      state.lastRecapCurrent = false
      hideRecap(ctx, state)
      clearNoModelWarning(ctx)
    }

    return { action: "continue" as const }
  })

  pi.on("agent_start", (_event, ctx) => {
    state.runId++
    state.stale = false
    state.lastRecapCurrent = false
    state.skipNextAwayRecap = false
    clearAwayTimer(state)
    abortPendingGeneration(state)
    hideRecap(ctx, state)
    clearNoModelWarning(ctx)
  })

  pi.on("session_compact_failed", (event) => {
    if (event.willRetry) return
    state.skipNextAwayRecap = true
    clearAwayTimer(state)
  })

  pi.on("agent_settled", (_event, ctx) => {
    if (state.skipNextAwayRecap) {
      state.skipNextAwayRecap = false
      return
    }

    state.stale = true
    scheduleAwayRecap(pi, ctx, state)
  })

  pi.on("session_shutdown", (_event, ctx) => {
    state.sessionActive = false
    resetRecapSession(ctx, state)
  })
}
