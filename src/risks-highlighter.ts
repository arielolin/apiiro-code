import * as vscode from "vscode";
import { findRisks } from "./api";
import * as path from "path";
import { Risk } from "./types/risk";
import { detectLineChanges, hasFileDiffedFromRemote } from "./utils/git";

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
      const relativeFilePath = this.getRelativeFilePath(editor);
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

    for (const risk of risks) {
      let lineNumber = risk.codeReference.lineNumber;

      try {
        const { newLineNum } = await detectLineChanges(
          relativeFilePath,
          risk.codeReference.lineNumber,
        );

        lineNumber = newLineNum ?? lineNumber;
      } catch (error) {
        console.error("Error detecting line changes:", error);
        // If there's an error, we'll use the original line number
      }

      if (!groupedRisks.has(lineNumber)) {
        groupedRisks.set(lineNumber, []);
      }
      groupedRisks.get(lineNumber)!.push(risk);
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
        const uniqueRiskTypes = [...new Set(risks.map((r) => r.riskType))];
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

  private async createHoverMessage(
    risks: Risk[],
  ): Promise<vscode.MarkdownString> {
    const message = risks
      .map((risk) => {
        const creationTime = new Date(risk.documentCreationTime);
        const dueDate = new Date(risk.dueDate);
        const now = new Date();

        let dueDateColor = "green";
        if (dueDate < now) {
          dueDateColor = "red";
        } else if (
          dueDate.getTime() - now.getTime() <
          7 * 24 * 60 * 60 * 1000
        ) {
          // 7 days
          dueDateColor = "yellow";
        }

        let riskLevelColor = "blue";
        switch (risk.riskLevel.toLowerCase()) {
          case "low":
            riskLevelColor = "green";
            break;
          case "medium":
            riskLevelColor = "yellow";
            break;
          case "high":
            riskLevelColor = "red";
            break;
        }

        return `## 🚨 ${risk.riskType} Risk Detected

        - **Risk Level:** <span style="color: ${riskLevelColor}">${risk.riskLevel}</span>
        - **Short Summary:** ${risk.shortSummary}
        - **Creation Time:** ${creationTime.toLocaleString()}
        - **Due Date:** <span style="color: ${dueDateColor}">${dueDate.toLocaleString()}</span>
        - **Business Impact:** ${risk.businessImpact}


        ---`;
      })
      .join("\n\n");

    const markdownMessage = new vscode.MarkdownString(message);
    markdownMessage.isTrusted = true;
    markdownMessage.supportHtml = true;
    return markdownMessage;
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

  private getRelativeFilePath(editor: vscode.TextEditor): string | null {
    const currentFilePath = editor.document.uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      editor.document.uri,
    );

    return workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, currentFilePath)
      : null;
  }

  private handleError(message: string, error: unknown): void {
    console.error(`${message}:`, error);
    vscode.window.showErrorMessage(
      `${message}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
