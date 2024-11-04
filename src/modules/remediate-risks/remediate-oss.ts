import * as vscode from "vscode";
import { Risk } from "../../types/risk";
import { detectLineChanges } from "../../services/git-service";
import { RiskRemediation } from "./remediate-risks";
import { Repository } from "../../types/repository";
import { addSuggestionLine } from "./suggestion-helper";

export class OSSRiskRemediation implements RiskRemediation {
  private onRiskRemediation: () => void;
  constructor(onRiskRemediation: () => void) {
    this.onRiskRemediation = onRiskRemediation;
  }
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

    console.log(
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
      this.onRiskRemediation,
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
}
