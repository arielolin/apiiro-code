export function getSeverityIcon(riskLevel: string): string {
  switch (riskLevel.toLowerCase()) {
    case "critical":
      return "🚨";
    case "high":
    case "medium":
      return "☢️";
    case "low":
      return "⚠️";
    default:
      return "❓";
  }
}
