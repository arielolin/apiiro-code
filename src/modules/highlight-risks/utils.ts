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

export function getHighestRiskLevel(risks: Risk[]): RiskLevel {
  const riskLevels: RiskLevel[] = [
    "Critical",
    "High",
    "Medium",
    "Low",
  ] as const;

  return risks
    .map((r) => r.riskLevel)
    .reduce((highest, current) => {
      const highestIndex = riskLevels.indexOf(highest as RiskLevel);
      const currentIndex = riskLevels.indexOf(current as RiskLevel);
      return currentIndex <= highestIndex ? current : highest;
    }, "Low") as RiskLevel;
}
