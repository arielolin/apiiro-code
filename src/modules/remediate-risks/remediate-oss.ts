import * as vscode from "vscode";
import { Risk } from "../../types/risk";
import { detectLineChanges } from "../git";
import { RiskRemediation } from "./remediate-risks";
import { Repository } from "../../types/repository";
import { addSuggestionLine } from "./suggestion-helper";

export class OSSRiskRemediation implements RiskRemediation {
  async remediate(
    editor: vscode.TextEditor,
    risk: Risk,
    repoData: Repository,
  ): Promise<void> {
    if (!editor) {
      throw new Error("No active text editor");
    }

    const lineChanges = await detectLineChanges(
      [risk.sourceCode.lineNumber],
      repoData,
    );
    const lineNumber =
      lineChanges?.[0]?.newLineNum ?? risk.sourceCode.lineNumber;

    const document = editor.document;
    const componentName = risk.component;
    const depKey = risk.component.split(":")[0];
    let fixVersion = "latest";
    if (
      "remediationSuggestion" in risk &&
      risk.remediationSuggestion.nearestFixVersion
    ) {
      fixVersion = risk.remediationSuggestion.nearestFixVersion;
    }

    vscode.window.showInformationMessage(
      `Attempting to update ${componentName} to version ${fixVersion}`,
    );

    const line = document.lineAt(lineNumber - 1);
    const originalText = line.text;

    if (!originalText.includes(`"${depKey}"`)) {
      vscode.window.showInformationMessage(
        `${depKey} was not found in the specified line: ${originalText}`,
      );
      return;
    }

    const updatedLineText = this.createUpdatedLineText(
      originalText,
      depKey,
      fixVersion,
    );

    await addSuggestionLine(
      editor,
      lineNumber,
      originalText,
      updatedLineText,
      () => this.applyRemediation(editor, line.range, updatedLineText),
    );
  }

  private createUpdatedLineText(
    originalText: string,
    depKey: string,
    fixVersion: string,
  ): string {
    const regex = new RegExp(`("${depKey}"\\s*:\\s*)["'].*?["']`);
    return originalText.replace(regex, `$1"${fixVersion}"`);
  }

  private async applyRemediation(
    editor: vscode.TextEditor,
    range: vscode.Range,
    updatedLineText: string,
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, range, updatedLineText);

    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
      console.log(`Successfully updated component`);
      vscode.window.showInformationMessage(
        `Successfully updated component in the current file.`,
      );
      await vscode.workspace.saveAll(false);
      vscode.window.showInformationMessage(`File saved after remediation.`);
    } else {
      throw new Error("Failed to apply the edit to the current file");
    }
  }
}
