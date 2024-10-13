import * as vscode from "vscode";
import { findRisks, getEnvironmentData } from "../api";
import { Risk } from "../types/risk";
import { detectLineChanges } from "./git";
import { getRelativeFilePath } from "../utils/vs-code";
import { hasRemedy } from "./remediate-risks/remediate-risks";
import { Repository } from "../types/repository";

export class RiskHighlighter {
  private risksDecoration: vscode.TextEditorDecorationType;
  private diagnosticsCollection: vscode.DiagnosticCollection;

  constructor(context: vscode.ExtensionContext) {
    this.risksDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255, 0, 0, 0.3)",
      overviewRulerColor: "red",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.diagnosticsCollection = vscode.languages.createDiagnosticCollection();
    context.subscriptions.push(
      this.risksDecoration,
      this.diagnosticsCollection,
    );
  }

  public async highlightRisk(
    editor: vscode.TextEditor,
    repoData: Repository,
  ): Promise<void> {
    try {
      const relativeFilePath = getRelativeFilePath(editor);
      if (!relativeFilePath) {
        vscode.window.showErrorMessage(
          "Unable to determine relative file path",
        );
        return;
      }

      const risks = await findRisks(relativeFilePath, repoData);

      await this.applyHighlights(editor, risks, repoData);
      await this.updateDiagnostics(editor, risks, repoData);
    } catch (error) {
      vscode.window.showErrorMessage(
        //@ts-ignore
        error.message,
      );
    }
  }

  public removeAllHighlights(editor: vscode.TextEditor): void {
    editor.setDecorations(this.risksDecoration, []);
    this.diagnosticsCollection.clear();
  }

  private async applyHighlights(
    editor: vscode.TextEditor,
    risks: Risk[],
    repoData: Repository,
  ): Promise<void> {
    const groupedRisks = await this.groupRisksByLine(risks, repoData);
    const decorations = await this.createDecorations(editor, groupedRisks);
    this.removeAllHighlights(editor);
    editor.setDecorations(this.risksDecoration, decorations);

    this.showRiskSummary(decorations.length);
  }

  private async updateDiagnostics(
    editor: vscode.TextEditor,
    risks: Risk[],
    repoData: Repository,
  ): Promise<void> {
    const diagnostics: vscode.Diagnostic[] = [];
    const groupedRisks = await this.groupRisksByLine(risks, repoData);

    for (const [lineNumber, risks] of groupedRisks.entries()) {
      const range = editor.document.lineAt(lineNumber - 1).range;
      const message = risks
        .map(
          (risk) => `🚨 ${risk.riskCategory} Risk Detected: ${risk.ruleName}`,
        )
        .join("\n");

      diagnostics.push({
        source: "Risk Highlighter",
        range,
        severity: this.getDiagnosticSeverity(risks),
        message,
      });
    }

    this.diagnosticsCollection.set(editor.document.uri, diagnostics);
  }

  private getDiagnosticSeverity(risks: Risk[]): vscode.DiagnosticSeverity {
    const highestRiskLevel = risks.reduce((highest, risk) => {
      const riskLevels = ["critical", "high", "medium", "low"];
      const currentIndex = riskLevels.indexOf(risk.riskLevel.toLowerCase());
      const highestIndex = riskLevels.indexOf(highest.toLowerCase());
      return currentIndex < highestIndex ? risk.riskLevel : highest;
    }, "low");

    switch (highestRiskLevel.toLowerCase()) {
      case "critical":
        return vscode.DiagnosticSeverity.Error;
      case "high":
        return vscode.DiagnosticSeverity.Warning;
      case "medium":
        return vscode.DiagnosticSeverity.Information;
      case "low":
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Information;
    }
  }

  async groupRisksByLine(
    risks: Risk[],
    repoData: Repository,
  ): Promise<Map<number, Risk[]>> {
    const groupedRisks = new Map<number, Risk[]>();
    const lineNumbers = risks.map((risk) => risk.sourceCode.lineNumber);

    try {
      const lineChanges = await detectLineChanges(lineNumbers, repoData);

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
      vscode.window.showErrorMessage(`Error detecting line changes: ${error}`);

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
        //@ts-ignore
        vscode.window.showErrorMessage(error);
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

        let remediateLink = "";
        if (hasRemedy(risk)) {
          remediateLink = `\n\n[Remediate](command:apiiro-code.remediate?${encodedRisk})`;
        }

        return `## 🚨 ${risk.riskCategory} Risk Detected
  
  **Risk Level:** <span style="color: ${riskLevelColor}">${risk.riskLevel}</span>
  
  **Policy:** ${risk.ruleName}
  
  **Creation Time:** ${creationTime}
  
  **Business Impact:** ${risk.entity.details.businessImpact}

  **Apiiro Link:** [View in Apiiro](${getEnvironmentData().AppUrl}/risks?fl&trigger=${risk.id})
    
  ${remediateLink}

  
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
    }
  }
}
