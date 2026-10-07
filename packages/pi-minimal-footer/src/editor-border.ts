import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui"

export function formatModelBorderLabel(
  modelId: string,
  provider: string,
  providerCount: number,
  thinking: string | undefined,
  fastModeIcon: string,
): string {
  const providerLabel = providerCount > 1 ? `(${provider}) ` : ""
  const modelLabel = `${providerLabel}${modelId}`
  const thinkingLabel = thinking
    ? ` • ${thinking === "off" ? "thinking off" : thinking}`
    : ""
  return `${fastModeIcon ? `${fastModeIcon} ` : ""}${modelLabel}${thinkingLabel}`
}

export function overlayBorderLabels(
  leftLabel: string,
  rightLabel: string,
  width: number,
  borderColor: (text: string) => string,
): string {
  if (width < 8) return "─".repeat(width)

  const labelWidth = width - 8
  const visibleLeft = truncateToWidth(leftLabel, labelWidth, "")
  const visibleRight = truncateToWidth(
    rightLabel,
    labelWidth - visibleWidth(visibleLeft),
    "",
  )
  const gap = width - visibleWidth(visibleLeft) - visibleWidth(visibleRight) - 8
  return `${borderColor("── ")}${visibleLeft}${borderColor(` ${"─".repeat(gap)} `)}${visibleRight}${borderColor(" ──")}`
}

export function overlayBorderLabel(
  border: string,
  label: string,
  width: number,
  borderColor: (text: string) => string,
): string {
  if (width < 8) return border

  const visibleLabel = truncateToWidth(label, width - 6, "")
  const labelWidth = visibleWidth(visibleLabel)
  const leftWidth = width - labelWidth - 4
  const left = truncateToWidth(border, leftWidth, "")
  return `${left}${borderColor(" ")}${visibleLabel}${borderColor(" ──")}`
}
