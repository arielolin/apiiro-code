import vscode from "vscode";
import { Risk } from "../../types/risk";
import { detectLineChanges } from "../git";
import { RiskRemediator } from "./remediate-risks";
import { Repository } from "../../types/repository";

export class OSSRiskRemediator implements RiskRemediator {
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
    //@ts-ignore
    const lineNumber =
      lineChanges?.[0]?.newLineNum ?? risk.sourceCode.lineNumber;

    const document = editor.document;
    //@ts-ignore
    const componentName = risk.component.split();
    const depKey = risk.component.split(":")[0];
    let fixVersion = "latest";
    if ("remediationSuggestion" in risk) {
      fixVersion = risk.remediationSuggestion.nearestFixVersion;
    }

    console.log(
      `Attempting to update ${componentName} to version ${fixVersion}`,
    );

    const line = document.lineAt(lineNumber - 1);
    const lineText = line.text;

    if (!lineText.includes(`"${depKey}"`)) {
      vscode.window.showInformationMessage(
        `${depKey} was not found in the specified line:${lineText}`,
      );
      return;
    }

    const leadingWhitespace = lineText.match(/^\s*/)?.[0] ?? "";
    const trailingChars = lineText.match(/[,\s]*$/)?.[0] ?? "";
    const updatedLineText = `${leadingWhitespace}"${depKey}": "${fixVersion}"${trailingChars}`;

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, line.range, updatedLineText);

    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
      console.log(`Successfully updated ${componentName} to ${fixVersion}`);
      vscode.window.showInformationMessage(
        `Successfully updated ${componentName} to ${fixVersion} in the current file.`,
      );
      await vscode.workspace.saveAll(false);
      vscode.window.showInformationMessage(`File saved after remediation.`);
    } else {
      throw new Error("Failed to apply the edit to the current file");
    }
  }
}
