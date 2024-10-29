import * as vscode from "vscode";
import { findRisks, getEnvironmentData } from "../../api";
import { OSSRisk, Risk, SecretsRisk } from "../../types/risk";
import { detectLineChanges } from "../git";
import { getRelativeFilePath } from "../../utils/vs-code";
import { Repository } from "../../types/repository";

import { RiskRemediationTriggerCodeLensProvider } from "../remediate-risks/remediation-trigger-code-lense";
import { createDefaultMessage } from "../create-hover-message/default-hover-message";
import { createSecretsMessage } from "../create-hover-message/secrets-hover-message";
import { createOSSMessage } from "../create-hover-message/oss-hover-message";

export class RiskHighlighter {
  private readonly risksDecoration: vscode.TextEditorDecorationType;
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;
  private readonly codeLensProvider: RiskRemediationTriggerCodeLensProvider;

  constructor(context: vscode.ExtensionContext) {
    this.risksDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255, 0, 0, 0.3)",
      overviewRulerColor: "red",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.diagnosticsCollection = vscode.languages.createDiagnosticCollection();
    this.codeLensProvider = new RiskRemediationTriggerCodeLensProvider();

    context.subscriptions.push(
      this.risksDecoration,
      this.diagnosticsCollection,
      vscode.languages.registerCodeLensProvider(
        { scheme: "file" },
        this.codeLensProvider,
      ),
    );
  }

  public async highlightRisks(
    editor: vscode.TextEditor,
    repoData: Repository,
  ): Promise<void> {
    try {
      const relativeFilePath = getRelativeFilePath(editor);
      if (!relativeFilePath) {
        return;
      }

      const risks = await findRisks(relativeFilePath, repoData);

      if (risks.length === 0) {
        vscode.window.showInformationMessage("No risks found");
        return;
      }

      const groupedRisks = await this.groupRisksByLine(risks, repoData);
      await this.applyInlineHighlights(editor, groupedRisks);
      this.codeLensProvider.updateRisks(groupedRisks);
      this.updateDiagnostics(editor, groupedRisks);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error in highlightRisks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public removeAllHighlights(editor: vscode.TextEditor): void {
    editor.setDecorations(this.risksDecoration, []);
    this.diagnosticsCollection.clear();
    this.codeLensProvider.updateRisks(new Map());
  }

  private async applyInlineHighlights(
    editor: vscode.TextEditor,
    groupedRisks: Map<number, Risk[]>,
  ): Promise<void> {
    const decorations = await this.createDecorations(editor, groupedRisks);
    this.removeAllHighlights(editor);
    editor.setDecorations(this.risksDecoration, decorations);

    this.showRiskSummary(decorations.length);
  }

  private async updateDiagnostics(
    editor: vscode.TextEditor,
    groupedRisks: Map<number, Risk[]>,
  ): Promise<void> {
    const diagnostics: vscode.Diagnostic[] = [];

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
      case "medium":
      case "low":
        return vscode.DiagnosticSeverity.Warning;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  async groupRisksByLine(
    risks: Risk[],
    repoData: Repository,
  ): Promise<Map<number, Risk[]>> {
    const groupedRisks = new Map<number, Risk[]>();
    try {
      const lineNumbers = risks.map((risk) => risk.sourceCode.lineNumber);
      const lineChanges = await detectLineChanges(lineNumbers, repoData);

      for (let i = 0; i < risks.length; i++) {
        const risk = risks[i];
        const { hasChanged, newLineNum } = lineChanges[i];

        const lineNumber = hasChanged
          ? -1
          : newLineNum
            ? newLineNum
            : risk.sourceCode.lineNumber;

        if (hasChanged) {
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
        const hoverMessage = this.createHoverMessage(risks);
        const contentText = this.createInlineRiskDescription(uniqueRiskTypes);

        decorations.push({
          range,
          hoverMessage,
          renderOptions: { after: { contentText } },
        });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error creating decoration for line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return decorations;
  }

  private createHoverMessage(risks: Risk[]): vscode.MarkdownString {
    const message = risks
      .map((risk) => {
        if (risk.riskCategory === "OSS Security") {
          return createOSSMessage(risk as OSSRisk);
        } else if (risk.riskCategory === "Secrets") {
          return createSecretsMessage(risk as SecretsRisk);
        } else {
          return createDefaultMessage(risk);
        }
      })
      .join("\n\n---\n\n");

    const markdownMessage = new vscode.MarkdownString(message);
    markdownMessage.isTrusted = true;
    markdownMessage.supportHtml = true;
    return markdownMessage;
  }

  private createInlineRiskDescription(riskTypes: string[]): string {
    return `🚨 ${riskTypes.join(", ")} risk detected`;
  }

  private showRiskSummary(riskCount: number): void {
    if (riskCount > 0) {
      vscode.window.showWarningMessage(
        `Highlighted ${riskCount} potential risk${riskCount > 1 ? "s" : ""} in this file. Please review and address ${riskCount > 1 ? "them" : "it"}.`,
      );
    }
  }
}
