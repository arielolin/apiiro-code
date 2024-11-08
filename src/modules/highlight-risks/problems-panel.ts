// src/features/risk-highlighter/diagnostics-helper.ts
import * as vscode from "vscode";
import { Risk } from "../../types/risk";
import { DecorationHelper } from "./decoration-helper";

export class DiagnosticsHelper {
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticsCollection = vscode.languages.createDiagnosticCollection();
  }

  public dispose(): void {
    this.diagnosticsCollection.dispose();
  }

  public clear(): void {
    this.diagnosticsCollection.clear();
  }

  public updateDiagnostics(
    editor: vscode.TextEditor,
    groupedRisks: Map<number, Risk[]>,
  ): void {
    const diagnostics = this.createDiagnostics(editor, groupedRisks);
    this.diagnosticsCollection.set(editor.document.uri, diagnostics);
  }

  private createDiagnostics(
    editor: vscode.TextEditor,
    groupedRisks: Map<number, Risk[]>,
  ): vscode.Diagnostic[] {
    return Array.from(groupedRisks.entries()).map(([lineNumber, risks]) => {
      const range = editor.document.lineAt(lineNumber - 1).range;
      const message = this.createDiagnosticMessage(risks);
      const severity = this.getDiagnosticSeverity(risks);

      return new vscode.Diagnostic(range, message, severity);
    });
  }

  private createDiagnosticMessage(risks: Risk[]): string {
    return risks
      .map(
        (risk) =>
          `${risk.riskLevel} ${risk.riskCategory} risk detected: ${risk.ruleName}`,
      )
      .join("\n");
  }

  private getDiagnosticSeverity(risks: Risk[]): vscode.DiagnosticSeverity {
    const highestRiskLevel = DecorationHelper.getHighestRiskLevel(risks);

    switch (highestRiskLevel) {
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
}
