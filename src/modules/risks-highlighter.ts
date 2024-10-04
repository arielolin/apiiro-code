import * as vscode from "vscode";
import { findRisks } from "../api";
import { Risk } from "../types/risk";
import { detectLineChanges } from "./git";
import { getRelativeFilePath } from "./text-editor";

export class RiskHighlighter {
  private risksDecoration: vscode.TextEditorDecorationType;

  constructor(context: vscode.ExtensionContext) {
    this.risksDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255, 0, 0, 0.3)",
      overviewRulerColor: "red",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    context.subscriptions.push(this.risksDecoration);
  }

  public async highlightRisk(editor: vscode.TextEditor): Promise<void> {
    try {
      const relativeFilePath = getRelativeFilePath(editor);
      if (!relativeFilePath) {
        throw new Error("Unable to determine relative file path");
      }

      const risks = await findRisks(relativeFilePath);
      await this.applyHighlights(editor, risks, relativeFilePath);
    } catch (error) {
      this.handleError("Error highlighting risks", error);
    }
  }

  public removeAllHighlights(editor: vscode.TextEditor): void {
    editor.setDecorations(this.risksDecoration, []);
    vscode.window.showInformationMessage(
      "All risk highlights have been removed.",
    );
  }

  private async applyHighlights(
    editor: vscode.TextEditor,
    risks: Risk[],
    relativeFilePath: string,
  ): Promise<void> {
    const groupedRisks = await this.groupRisksByLine(risks, relativeFilePath);
    const decorations = await this.createDecorations(editor, groupedRisks);
    this.removeAllHighlights(editor);
    editor.setDecorations(this.risksDecoration, decorations);

    this.showRiskSummary(decorations.length);
  }

  async groupRisksByLine(
    risks: Risk[],
    relativeFilePath: string,
  ): Promise<Map<number, Risk[]>> {
    const groupedRisks = new Map<number, Risk[]>();
    const lineNumbers = risks.map((risk) => risk.sourceCode.lineNumber);

    try {
      const lineChanges = await detectLineChanges(
        relativeFilePath,
        lineNumbers,
      );

      for (let i = 0; i < risks.length; i++) {
        const risk = risks[i];
        const { hasChanged, newLineNum } = lineChanges[i];
        const lineNumber = newLineNum ?? risk.sourceCode.lineNumber;

        if (hasChanged) {
          // If the line has changed, we don't include it in the groupedRisks
          if (groupedRisks.has(lineNumber)) {
            groupedRisks.delete(lineNumber);
          }
          continue;
        }

        if (!groupedRisks.has(lineNumber)) {
          groupedRisks.set(lineNumber, []);
        }

        groupedRisks.get(lineNumber)!.push(risk);
      }
    } catch (error) {
      console.error("Error detecting line changes:", error);
      // If there's an error, we'll use the original line numbers
      for (const risk of risks) {
        const lineNumber = risk.sourceCode.lineNumber;
        if (!groupedRisks.has(lineNumber)) {
          groupedRisks.set(lineNumber, []);
        }
        groupedRisks.get(lineNumber)!.push(risk);
      }
    }

    return groupedRisks;
  }

  private async createDecorations(
    editor: vscode.TextEditor,
    groupedRisks: Map<number, Risk[]>,
  ): Promise<vscode.DecorationOptions[]> {
    const decorations: vscode.DecorationOptions[] = [];

    for (const [lineNumber, risks] of groupedRisks.entries()) {
      try {
        const range = editor.document.lineAt(lineNumber - 1).range;
        const uniqueRiskTypes = [...new Set(risks.map((r) => r.riskCategory))];
        const hoverMessage = await this.createHoverMessage(risks);
        const contentText = this.createContentText(uniqueRiskTypes);

        decorations.push({
          range,
          hoverMessage,
          renderOptions: { after: { contentText } },
        });
      } catch (error) {
        this.handleError(`Invalid line number ${lineNumber}`, error);
      }
    }

    return decorations;
  }

  private createHoverMessage(risks: Risk[]): vscode.MarkdownString {
    const message = risks
      .map((risk) => {
        const creationTime = new Date(risk.discoveredOn).toLocaleString();
        const riskLevelColor = this.getRiskLevelColor(risk.riskLevel);
        const encodedRisk = encodeURIComponent(JSON.stringify(risk));
        return `## 🚨 ${risk.riskCategory} Risk Detected

**Risk Level:** <span style="color: ${riskLevelColor}">${risk.riskLevel}</span>

**Policy:** ${risk.ruleName}

**Creation Time:** ${creationTime}

**Business Impact:** ${risk.entity.details.businessImpact}


[Remediate](command:apiiro-code.remediate?${encodedRisk})\`;

---`;
      })
      .join("\n\n");

    const markdownMessage = new vscode.MarkdownString(message);
    markdownMessage.isTrusted = true;
    markdownMessage.supportHtml = true;
    return markdownMessage;
  }

  private getRiskLevelColor(riskLevel: string): string {
    switch (riskLevel.toLowerCase()) {
      case "low":
        return "green";
      case "medium":
        return "yellow";
      case "high":
        return "red";
      default:
        return "blue";
    }
  }

  private createContentText(riskTypes: string[]): string {
    return `🚨 ${riskTypes.join(", ")} detected`;
  }

  private showRiskSummary(riskCount: number): void {
    if (riskCount > 0) {
      vscode.window.showWarningMessage(
        `Highlighted ${riskCount} potential risk${riskCount > 1 ? "s" : ""} in this file. Please review and address ${riskCount > 1 ? "them" : "it"}.`,
      );
    } else {
      vscode.window.showInformationMessage("No risks detected");
    }
  }

  private handleError(message: string, error: unknown): void {
    console.error(`${message}:`, error);
    vscode.window.showErrorMessage(
      `${message}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
