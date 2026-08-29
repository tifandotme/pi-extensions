import { randomUUID } from "node:crypto"
import type { AgentMessage } from "@earendil-works/pi-agent-core"
import type { Message } from "@earendil-works/pi-ai/compat"
import {
  generateRename,
  getUserMessageContext,
  resolveInitialModelConfig,
} from "@tifan/pi-rename/naming"
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent"
import {
  BorderedLoader,
  convertToLlm,
  serializeConversation,
  SessionManager,
  sessionEntryToContextMessages,
} from "@earendil-works/pi-coding-agent"
import { completeText } from "./complete-text.js"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const HANDOFF_SKILL_COMMAND = "skill:handoff"
const HANDOFF_BRIDGE_COMMAND = "__pi-handoff-session"

const HANDOFF_SYSTEM_PROMPT = `You are a context transfer assistant. Generate a handoff markdown document for a fresh coding agent.

Follow the provided handoff skill instructions as the document policy.

Requirements:
- Base the handoff only on the supplied conversation and session metadata.
- Tailor the document to the next session focus.
- Include concrete decisions, files, commands/checks, blockers, and next steps when relevant.
- Include a "Suggested skills" section.
- Reference existing artifacts by path or URL instead of duplicating their content.
- Redact sensitive information such as API keys, passwords, tokens, and personally identifiable information.
- Keep it concise and actionable.
- Output only markdown for the handoff document. Do not include a preamble or closing note.`

type HandoffSkill = {
  path: string
  instructions: string
}

async function loadHandoffSkill(
  pi: ExtensionAPI,
): Promise<HandoffSkill | undefined> {
  const command = pi
    .getCommands()
    .find(
      (candidate: SlashCommandInfo) =>
        candidate.source === "skill" &&
        candidate.name === HANDOFF_SKILL_COMMAND,
    )
  if (!command?.sourceInfo.path) return undefined

  return {
    path: command.sourceInfo.path,
    instructions: await readFile(command.sourceInfo.path, "utf8"),
  }
}

function dateStamp(): string {
  const [date] = new Date().toISOString().split("T")
  return date ?? "handoff"
}

async function nextHandoffPath(slug: string): Promise<string> {
  const directory = join(tmpdir(), "pi-handoffs")
  await mkdir(directory, { recursive: true })

  const baseName = `pi-handoff-${dateStamp()}-${slug}`
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`
    const path = join(directory, `${baseName}${suffix}.md`)
    if (!existsSync(path)) return path
  }

  throw new Error("Could not allocate a unique handoff file path")
}

async function generateSessionName(
  ctx: ExtensionCommandContext,
  messages: readonly AgentMessage[],
): Promise<string> {
  const context = getUserMessageContext(messages)
  if (!context) return "handoff-session"

  const result = await generateRename(ctx, resolveInitialModelConfig(), context)
  return result?.name ?? "handoff-session"
}

function buildNewSessionPrompt(handoffPath: string): string {
  return [
    "Continue from this handoff:",
    handoffPath,
    "Read the handoff, load any suggested skills, then continue the work.",
  ].join("\n\n")
}

type HerdrTabCreateResponse = {
  result?: {
    root_pane?: {
      pane_id?: unknown
    }
  }
}

function getHerdrWorkspaceId(): string | undefined {
  if (process.env["HERDR_ENV"] !== "1") return undefined

  const workspaceId = process.env["HERDR_WORKSPACE_ID"]?.trim()
  if (!workspaceId) {
    throw new Error("Herdr workspace context is unavailable")
  }
  return workspaceId
}

function getHerdrRootPaneId(stdout: string): string | undefined {
  try {
    const response = JSON.parse(stdout) as HerdrTabCreateResponse
    const paneId = response.result?.root_pane?.pane_id
    return typeof paneId === "string" && paneId.trim() ? paneId : undefined
  } catch {
    return undefined
  }
}

function getCommandError(stdout: string, stderr: string): string {
  return stderr.trim() || stdout.trim() || "unknown error"
}

async function startHandoffInHerdr(options: {
  pi: ExtensionAPI
  ctx: ExtensionCommandContext
  handoffPath: string
  parentSession: string | undefined
  sessionName: string
  workspaceId: string
}): Promise<void> {
  const childSessionManager = SessionManager.create(
    options.ctx.cwd,
    undefined,
    options.parentSession
      ? { parentSession: options.parentSession }
      : undefined,
  )
  const childSessionPath = childSessionManager.getSessionFile()
  const childSessionHeader = childSessionManager.getHeader()
  if (!childSessionPath || !childSessionHeader) {
    throw new Error("Could not create a persisted handoff session")
  }
  await mkdir(childSessionManager.getSessionDir(), { recursive: true })
  await writeFile(childSessionPath, `${JSON.stringify(childSessionHeader)}\n`, {
    flag: "wx",
  })

  const createdTab = await options.pi.exec(
    "herdr",
    [
      "tab",
      "create",
      "--workspace",
      options.workspaceId,
      "--cwd",
      options.ctx.cwd,
      "--label",
      options.sessionName,
      "--focus",
    ],
    { timeout: 5_000 },
  )
  if (createdTab.code !== 0) {
    throw new Error(
      `Could not create Herdr tab: ${getCommandError(createdTab.stdout, createdTab.stderr)}`,
    )
  }

  const rootPaneId = getHerdrRootPaneId(createdTab.stdout)
  if (!rootPaneId) {
    throw new Error("Could not find the new Herdr tab's root pane")
  }

  const agentName = `handoff-${randomUUID().slice(0, 8)}`
  const model = options.ctx.model!

  const startedAgent = await options.pi.exec(
    "herdr",
    [
      "agent",
      "start",
      agentName,
      "--kind",
      "pi",
      "--pane",
      rootPaneId,
      "--",
      "--session",
      childSessionPath,
      "--name",
      options.sessionName,
      "--provider",
      model.provider,
      "--model",
      model.id,
    ],
    { timeout: 35_000 },
  )
  if (startedAgent.code !== 0) {
    throw new Error(
      `Could not start Pi in Herdr tab: ${getCommandError(startedAgent.stdout, startedAgent.stderr)}`,
    )
  }

  const promptedAgent = await options.pi.exec("herdr", [
    "agent",
    "prompt",
    agentName,
    buildNewSessionPrompt(options.handoffPath),
  ])
  if (promptedAgent.code !== 0) {
    throw new Error(
      `Could not send the handoff prompt: ${getCommandError(promptedAgent.stdout, promptedAgent.stderr)}`,
    )
  }
}

function buildDocumentWithMetadata(options: {
  generated: string
  focus: string
  handoffSkillPath: string
  parentSession: string | undefined
}): string {
  const previousSession = options.parentSession
    ? [
        "## Previous session",
        "",
        `- Session file: \`${options.parentSession}\``,
        "- If details are missing, use `session_query` with that session file.",
      ].join("\n")
    : [
        "## Previous session",
        "",
        "- No persisted previous session file was available.",
      ].join("\n")

  return [
    `# Handoff: ${options.focus}`,
    "",
    "## Next session focus",
    "",
    options.focus,
    "",
    previousSession,
    "",
    "## Handoff policy",
    "",
    "- Skill: `handoff`",
    `- Source: \`${options.handoffSkillPath}\``,
    "",
    options.generated.trim(),
    "",
  ].join("\n")
}

async function generateHandoffDocument(options: {
  ctx: ExtensionCommandContext
  handoffSkill: HandoffSkill
  messages: AgentMessage[]
  focus: string
  parentSession: string | undefined
  signal?: AbortSignal
}): Promise<string | null> {
  const model = options.ctx.model
  if (!model) throw new Error("No model selected")

  const conversationText = serializeConversation(convertToLlm(options.messages))
  const userMessage: Message = {
    role: "user",
    content: [
      {
        type: "text",
        text: [
          "## Handoff Skill Instructions",
          "",
          options.handoffSkill.instructions,
          "",
          "## Session Metadata",
          "",
          `- Previous session file: ${options.parentSession ?? "not available"}`,
          `- Handoff skill path: ${options.handoffSkill.path}`,
          "",
          "## Next Session Focus",
          "",
          options.focus,
          "",
          "## Conversation History",
          "",
          conversationText,
        ].join("\n"),
      },
    ],
    timestamp: Date.now(),
  }

  return completeText(
    options.ctx,
    model,
    HANDOFF_SYSTEM_PROMPT,
    userMessage,
    options.signal,
  )
}

const DEFAULT_HANDOFF_FOCUS = "continue the current work"
const HANDOFF_REQUEST_RE = /(^|\s)-handoff(?=\s|$)/

function getHandoffFocus(text: string): string | undefined {
  if (!HANDOFF_REQUEST_RE.test(text)) return undefined
  return text.replace(HANDOFF_REQUEST_RE, " ").trim() || DEFAULT_HANDOFF_FOCUS
}

async function runHandoff(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  focus: string,
): Promise<void> {
  if (!ctx.model) {
    ctx.ui.notify("No model selected.", "error")
    return
  }

  const handoffSkill = await loadHandoffSkill(pi)
  if (!handoffSkill) {
    ctx.ui.notify(
      "Handoff requires a discoverable skill named exactly `handoff`. Install it, then run /reload.",
      "error",
    )
    return
  }

  const messages = ctx.sessionManager
    .buildContextEntries()
    .flatMap(sessionEntryToContextMessages)
  if (messages.length === 0) {
    ctx.ui.notify("No conversation to hand off.", "error")
    return
  }

  const parentSession = ctx.sessionManager.getSessionFile() ?? undefined
  const generated = await ctx.ui.custom<string | null>(
    (tui, theme, _kb, done) => {
      const model = ctx.model
      const modelLabel = model
        ? `${model.provider}/${"id" in model ? model.id : "selected"}`
        : "selected model"
      const loader = new BorderedLoader(
        tui,
        theme,
        `Generating handoff with ${modelLabel}...`,
      )
      loader.onAbort = () => done(null)

      generateHandoffDocument({
        ctx,
        handoffSkill,
        messages,
        focus,
        parentSession,
        signal: loader.signal,
      })
        .then(done)
        .catch((error) => {
          console.error("Handoff generation failed:", error)
          done(
            `__ERROR__${error instanceof Error ? error.message : String(error)}`,
          )
        })

      return loader
    },
  )

  if (generated === null) {
    ctx.ui.notify("Handoff session cancelled.", "warning")
    return
  }
  if (generated.startsWith("__ERROR__")) {
    ctx.ui.notify(generated.slice("__ERROR__".length), "error")
    return
  }

  const sessionName = await generateSessionName(ctx, messages)
  const handoffPath = await nextHandoffPath(sessionName)
  const document = buildDocumentWithMetadata({
    generated,
    focus,
    handoffSkillPath: handoffSkill.path,
    parentSession,
  })
  await writeFile(handoffPath, document, "utf8")

  const herdrWorkspaceId = getHerdrWorkspaceId()
  if (herdrWorkspaceId) {
    await startHandoffInHerdr({
      pi,
      ctx,
      handoffPath,
      parentSession,
      sessionName,
      workspaceId: herdrWorkspaceId,
    })
    ctx.ui.notify(`Handoff opened in a new Herdr tab: ${handoffPath}`, "info")
    return
  }

  await ctx.newSession({
    ...(parentSession ? { parentSession } : {}),
    setup: async (sessionManager) => {
      sessionManager.appendSessionInfo(sessionName)
    },
    withSession: async (newCtx) => {
      newCtx.ui.notify(`Handoff written: ${handoffPath}`, "info")
      await newCtx.sendUserMessage(buildNewSessionPrompt(handoffPath))
    },
  })
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand(HANDOFF_BRIDGE_COMMAND, {
    description: "Internal handoff bridge; use the -handoff marker instead.",
    handler: async (args, ctx) => {
      const focus = args.trim() || DEFAULT_HANDOFF_FOCUS
      try {
        await runHandoff(pi, ctx, focus)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("Handoff session failed:", error)
        ctx.ui.notify(message, "error")
      }
    },
  })

  pi.on("input", (event, ctx) => {
    if (event.source === "extension" || ctx.mode !== "tui") {
      return { action: "continue" }
    }

    const focus = getHandoffFocus(event.text)
    if (focus === undefined) return { action: "continue" }

    pi.sendUserMessage(`/${HANDOFF_BRIDGE_COMMAND} ${focus}`, {
      expandPromptTemplates: true,
    })
    return { action: "handled" }
  })
}
