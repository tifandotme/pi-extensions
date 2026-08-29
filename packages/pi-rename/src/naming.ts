import type { AgentMessage } from "@earendil-works/pi-agent-core"
import type { Message } from "@earendil-works/pi-ai"
import type { ExtensionContext } from "@earendil-works/pi-coding-agent"
import type { RenameLanguage } from "./language.js"
import {
  formatRenameModelKey,
  getRenameModelAuth,
  type RenameModelConfig,
} from "./models.js"
import { redactSecrets, sanitizeRenameText } from "./sanitize.js"

export const RENAME_MAX_TOKENS = 80
export const RENAME_REQUEST_TIMEOUT_MS = 30_000

export const RENAME_SYSTEM_PROMPT = `Name this coding-agent session.

Return one lowercase hyphen-separated session name only.
Use plain text, no quotes, no markdown, no trailing punctuation.
Prefer an action-oriented task name.
Stay under 60 characters.`

export function buildRenameSystemPrompt(language: RenameLanguage): string {
  if (/^en(?:-|$)/iu.test(language)) return RENAME_SYSTEM_PROMPT

  const languageInstruction =
    language === "auto"
      ? "Use language of latest user message."
      : `Use language identified by BCP 47 tag ${language}.`

  return `Name this coding-agent session.

${languageInstruction}
Return one hyphen-separated session name only.
Use plain text, no quotes, no markdown, no trailing punctuation.
Use lowercase when selected language has case.
Prefer an action-oriented task name.
Stay under 60 characters.`
}

export interface UserMessageContext {
  readonly first: string
  readonly recent: string[]
  readonly count: number
}

export type RenameResult =
  | { readonly source: "model"; readonly name: string }
  | {
      readonly source: "fallback"
      readonly name: string
      readonly reason: string
    }

function extractTextContent(
  content:
    | string
    | readonly { readonly type: string; readonly text?: string }[],
): string {
  if (typeof content === "string") return content

  return content
    .filter(
      (item): item is { readonly type: string; readonly text: string } =>
        item.type === "text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n")
}

function hasTextContent(message: AgentMessage): message is AgentMessage & {
  content: string | readonly { readonly type: string; readonly text?: string }[]
} {
  return "content" in message
}

export function getUserMessageContext(
  messages: readonly AgentMessage[],
): UserMessageContext | undefined {
  const userMessages: { index: number; text: string }[] = []

  for (const [index, message] of messages.entries()) {
    if (message.role !== "user" || !hasTextContent(message)) continue

    const text = redactSecrets(extractTextContent(message.content)).trim()
    if (text) userMessages.push({ index, text })
  }

  const firstMessage = userMessages[0]
  if (!firstMessage) return undefined

  const recentMessages = userMessages
    .slice(-3)
    .filter((message) => message.index !== firstMessage.index)

  return {
    first: firstMessage.text,
    recent: recentMessages.map((message) => message.text),
    count: 1 + recentMessages.length,
  }
}

export function buildRenamePrompt(context: UserMessageContext): Message {
  const recent = context.recent.length
    ? context.recent
        .map((message, index) => `${index + 1}. ${message}`)
        .join("\n")
    : "none"

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `## Naming context\n\nFirst user message:\n${context.first}\n\nRecent user messages:\n${recent}`,
      },
    ],
    timestamp: Date.now(),
  }
}

function extractModelText(
  content:
    | string
    | readonly { readonly type: string; readonly text?: string }[],
): string {
  return extractTextContent(content)
}

export function fallbackRenameName(
  context: UserMessageContext,
  language: RenameLanguage = "en",
): string | undefined {
  const latest = context.recent.at(-1) ?? context.first
  return sanitizeRenameText(latest, language)
}

export async function generateRename(
  ctx: ExtensionContext,
  modelConfig: RenameModelConfig,
  context: UserMessageContext,
  language: RenameLanguage = "en",
): Promise<RenameResult | undefined> {
  try {
    const modelAuth = await getRenameModelAuth(ctx, modelConfig)

    if (modelAuth.status === "ok") {
      const response = await ctx.modelRegistry.complete(
        modelAuth.auth.model,
        {
          systemPrompt: buildRenameSystemPrompt(language),
          messages: [buildRenamePrompt(context)],
        },
        {
          maxTokens: RENAME_MAX_TOKENS,
          maxRetries: 0,
          cacheRetention: "none",
          timeoutMs: RENAME_REQUEST_TIMEOUT_MS,
        },
      )

      if (response.stopReason === "stop") {
        const name = sanitizeRenameText(
          extractModelText(response.content),
          language,
        )
        if (name) return { source: "model", name }
      }

      const name = fallbackRenameName(context, language)
      return name
        ? {
            source: "fallback",
            name,
            reason: `rename model stopped with ${response.stopReason}`,
          }
        : undefined
    }

    const name = fallbackRenameName(context, language)
    if (!name) return undefined

    if (modelAuth.status === "invalid-config") {
      return {
        source: "fallback",
        name,
        reason: "invalid rename model config",
      }
    }

    const modelName = modelAuth.model
      ? formatRenameModelKey(modelAuth.model)
      : "unknown"
    return {
      source: "fallback",
      name,
      reason: `rename model is not authenticated: ${modelName}`,
    }
  } catch (error) {
    const name = fallbackRenameName(context, language)
    if (!name) return undefined
    const reason = error instanceof Error ? error.message : String(error)
    return { source: "fallback", name, reason }
  }
}

export { redactSecrets, sanitizeRenameText }
