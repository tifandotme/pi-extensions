export function formatFastModelLabel(
  modelId: string,
  provider: string,
  providerCount: number,
  formatIcon: (icon: string) => string,
): string {
  const providerLabel = providerCount > 1 ? `(${provider}) ` : ""
  return `${formatIcon("↯")} ${providerLabel}${modelId}`
}
