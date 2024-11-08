// src/features/risk-highlighter/risk-highlighter.ts
import * as vscode from "vscode";
import { OSSRisk, Risk, SecretsRisk } from "../../types/risk";
import { detectLineChanges } from "../../services/git-service";
import { getRelativeFilePath } from "../../utils/vs-code";
import { Repository } from "../../types/repository";
import { RiskRemediationTriggerCodeLensProvider } from "../remediate-risks/remediation-trigger-code-lense";
import { DiagnosticsHelper } from "./problems-panel";
import { DecorationHelper } from "./decoration-helper";
import { findRisksForFile } from "../../services/risk-service";
import { createOSSMessage } from "./create-hover-message/oss-hover-message";
import { createSecretsMessage } from "./create-hover-message/secrets-hover-message";
import { createDefaultMessage } from "./create-hover-message/default-hover-message";

export class RiskHighlighter {
  private readonly decorationTypes: Map<
    string,
    vscode.TextEditorDecorationType
  >;
  private readonly diagnosticsHelper: DiagnosticsHelper;
  private readonly remediationTriggerProvider: RiskRemediationTriggerCodeLensProvider;

  constructor(context: vscode.ExtensionContext) {
    this.decorationTypes = new Map([
      ["critical", DecorationHelper.createDecoration("critical")],
      ["high", DecorationHelper.createDecoration("high")],
      ["medium", DecorationHelper.createDecoration("medium")],
      ["low", DecorationHelper.createDecoration("low")],
    ]);

    this.diagnosticsHelper = new DiagnosticsHelper();
    this.remediationTriggerProvider =
      new RiskRemediationTriggerCodeLensProvider();

    context.subscriptions.push(
      ...Array.from(this.decorationTypes.values()),
      this.diagnosticsHelper,
      vscode.languages.registerCodeLensProvider(
        { scheme: "file" },
        this.remediationTriggerProvider,
      ),
    );
  }

  public async highlightRisks(
    editor: vscode.TextEditor,
    repoData: Repository,
  ): Promise<void> {
    try {
      const relativeFilePath = getRelativeFilePath(editor);
      if (!relativeFilePath) return;

      const risks = await findRisksForFile(relativeFilePath, repoData);
      const groupedRisks = await this.validateAndGroupRisks(risks, repoData);

      await this.applyInlineHighlights(editor, groupedRisks);
      this.remediationTriggerProvider.updateRemediationTriggers(groupedRisks);
      this.diagnosticsHelper.updateDiagnostics(editor, groupedRisks);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Error highlighting risks: ${errorMessage}`,
      );
    }
  }

  public removeAllHighlights(editor: vscode.TextEditor): void {
    this.decorationTypes.forEach((decoration) =>
      editor.setDecorations(decoration, []),
    );
    this.diagnosticsHelper.clear();
    this.remediationTriggerProvider.updateRemediationTriggers(new Map());
  }

  private async applyInlineHighlights(
    editor: vscode.TextEditor,
    groupedRisks: Map<number, Risk[]>,
  ): Promise<void> {
    const decorationsByLevel = new Map<string, vscode.DecorationOptions[]>();
    this.decorationTypes.forEach((_, level) =>
      decorationsByLevel.set(level, []),
    );

    for (const [lineNumber, risks] of groupedRisks.entries()) {
      try {
        const highestRiskLevel = DecorationHelper.getHighestRiskLevel(risks);
        const decoration = await this.createDecoration(
          editor,
          lineNumber,
          risks,
        );

        const decorations = decorationsByLevel.get(highestRiskLevel) || [];
        decorations.push(decoration);
        decorationsByLevel.set(highestRiskLevel, decorations);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          `Error creating decoration for line ${lineNumber}: ${errorMessage}`,
        );
      }
    }

    this.removeAllHighlights(editor);
    decorationsByLevel.forEach((decorations, level) => {
      const decorationType = this.decorationTypes.get(level);
      if (decorationType) {
        editor.setDecorations(decorationType, decorations);
      }
    });
  }

  private async createDecoration(
    editor: vscode.TextEditor,
    lineNumber: number,
    risks: Risk[],
  ): Promise<vscode.DecorationOptions> {
    const range = editor.document.lineAt(lineNumber - 1).range;
    const uniqueRiskTypes = [...new Set(risks.map((r) => r.riskCategory))];

    return {
      range,
      hoverMessage: this.createHoverMessage(risks),
      renderOptions: {
        after: {
          contentText: `🚨 ${uniqueRiskTypes.join(", ")} risk detected`,
        },
      },
    };
  }

  private createHoverMessage(risks: Risk[]): vscode.MarkdownString {
    const message = risks
      .map((risk) => {
        switch (risk.riskCategory) {
          case "OSS Security":
            return createOSSMessage(risk as OSSRisk);
          case "Secrets":
            return createSecretsMessage(risk as SecretsRisk);
          default:
            return createDefaultMessage(risk);
        }
      })
      .join("\n\n---\n\n");

    const markdownMessage = new vscode.MarkdownString(message);
    markdownMessage.isTrusted = true;
    markdownMessage.supportHtml = true;
    return markdownMessage;
  }

  private async validateAndGroupRisks(
    risks: Risk[],
    repoData: Repository,
  ): Promise<Map<number, Risk[]>> {
    const groupedRisks = new Map<number, Risk[]>();

    try {
      const lineNumbers = risks.map((risk) => risk.sourceCode.lineNumber);
      const lineChanges = await detectLineChanges(lineNumbers, repoData);

      risks.forEach((risk, index) => {
        const { hasChanged, newLineNum } = lineChanges[index];
        const lineNumber = hasChanged
          ? -1
          : newLineNum || risk.sourceCode.lineNumber;

        if (hasChanged) {
          groupedRisks.delete(lineNumber);
          return;
        }

        if (!groupedRisks.has(lineNumber)) {
          groupedRisks.set(lineNumber, []);
        }
        groupedRisks.get(lineNumber)!.push(risk);
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Error detecting line changes: ${error}`);
      risks.forEach((risk) => {
        const lineNumber = risk.sourceCode.lineNumber;
        if (!groupedRisks.has(lineNumber)) {
          groupedRisks.set(lineNumber, []);
        }
        groupedRisks.get(lineNumber)!.push(risk);
      });
    }

    return groupedRisks;
  }
}
