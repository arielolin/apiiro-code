// src/features/risk-highlighter/decoration-helper.ts
import * as vscode from "vscode";
import { Risk } from "../../types/risk";

interface RiskDecoration {
  backgroundColor: string;
  overviewRulerColor: string;
}

export class DecorationHelper {
  private static readonly RISK_COLORS = {
    critical: {
      backgroundColor: "rgba(255, 0, 0, 0.4)",
      overviewRulerColor: "#FF0000",
    },
    high: {
      backgroundColor: "rgba(255, 69, 0, 0.3)",
      overviewRulerColor: "#ff4d00",
    },
    medium: {
      backgroundColor: "rgba(255, 165, 0, 0.3)",
      overviewRulerColor: "#FFA500",
    },
    low: {
      backgroundColor: "rgba(255, 255, 0, 0.2)",
      overviewRulerColor: "#FFFF00",
    },
  };

  static createDecoration(riskLevel: string): vscode.TextEditorDecorationType {
    //@ts-ignore
    const decoration = (this.RISK_COLORS[riskLevel.toLowerCase()] ||
      this.RISK_COLORS.low) as unknown as RiskDecoration;

    return vscode.window.createTextEditorDecorationType({
      backgroundColor: decoration.backgroundColor,
      overviewRulerColor: decoration.overviewRulerColor,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }

  static getHighestRiskLevel(risks: Risk[]): string {
    const riskLevels = ["critical", "high", "medium", "low"];
    return risks.reduce((highest, risk) => {
      const currentIndex = riskLevels.indexOf(risk.riskLevel.toLowerCase());
      const highestIndex = riskLevels.indexOf(highest);
      return currentIndex < highestIndex
        ? risk.riskLevel.toLowerCase()
        : highest;
    }, "low");
  }
}
