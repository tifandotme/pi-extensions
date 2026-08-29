import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

const FRAMES = ["◐", "◓", "◑", "◒"]
const INTERVAL_MS = 80

type HerdrTabResponse = {
  result?: {
    tab?: {
      label?: unknown
    }
  }
}

export default function (pi: ExtensionAPI): void {
  const tabId = process.env["HERDR_TAB_ID"]?.trim()
  let originalLabel: string | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let frameIndex = 0
  let waitingForUser = false
  let pendingLabel: string | undefined
  let renameTask: Promise<void> | undefined
  let herdrUnavailable = false

  async function getCurrentLabel(): Promise<string | undefined> {
    if (!tabId || herdrUnavailable) return undefined

    try {
      const result = await pi.exec("herdr", ["tab", "get", tabId], {
        timeout: 1_000,
      })
      if (result.code !== 0) return undefined

      const response = JSON.parse(result.stdout) as HerdrTabResponse
      return typeof response.result?.tab?.label === "string"
        ? response.result.tab.label
        : undefined
    } catch {
      herdrUnavailable = true
      return undefined
    }
  }

  function renameTab(label: string): Promise<void> | undefined {
    if (!tabId || herdrUnavailable) return undefined
    pendingLabel = label
    if (renameTask) return renameTask

    const flushRenameQueue = async (): Promise<void> => {
      const nextLabel = pendingLabel
      if (nextLabel === undefined) return
      pendingLabel = undefined

      const result = await pi.exec(
        "herdr",
        ["tab", "rename", tabId, nextLabel],
        { timeout: 1_000 },
      )
      if (result.code !== 0) {
        herdrUnavailable = true
        pendingLabel = undefined
        return
      }

      return flushRenameQueue()
    }

    renameTask = flushRenameQueue()
      .catch(() => {
        herdrUnavailable = true
        pendingLabel = undefined
      })
      .finally(() => {
        renameTask = undefined
      })
    return renameTask
  }

  function clearTimer(): void {
    if (!timer) return
    clearInterval(timer)
    timer = undefined
  }

  async function start(): Promise<void> {
    clearTimer()
    frameIndex = 0
    originalLabel ??= await getCurrentLabel()
    if (originalLabel === undefined) return

    renameTab(`${FRAMES[frameIndex]} ${originalLabel}`)
    timer = setInterval(() => {
      const frame = FRAMES[frameIndex % FRAMES.length]
      renameTab(`${frame} ${originalLabel}`)
      frameIndex++
    }, INTERVAL_MS)
  }

  async function stop(): Promise<void> {
    waitingForUser = false
    clearTimer()
    const label = originalLabel
    if (label === undefined) return
    await renameTab(label)
    originalLabel = undefined
  }

  pi.on("agent_start", async () => {
    waitingForUser = false
    await start()
  })

  pi.on("ui_prompt_start", (_event, _ctx) => {
    if (!timer || originalLabel === undefined) return
    waitingForUser = true
    clearTimer()
    renameTab(`⏸ ${originalLabel}`)
  })

  pi.on("ui_prompt_end", async () => {
    if (!waitingForUser) return
    waitingForUser = false
    await start()
  })

  pi.on("agent_settled", async () => {
    await stop()
  })

  pi.on("session_shutdown", async () => {
    await stop()
  })
}
