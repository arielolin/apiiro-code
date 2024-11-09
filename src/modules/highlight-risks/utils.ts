import { Risk, RiskLevel } from "../../types/risk";

export function getSeverityIcon(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case "Critical":
      return "🚨";
    case "High":
      return "❗";
    case "Medium":
      return "☢️";
    case "Low":
      return "⚠️";
    default:
      return "❓";
  }
}
