import * as vscode from "vscode";
import { detectLineChanges } from "./git";
import { Risk } from "../types/risk";

interface RiskRemediator {
  remediate(editor: vscode.TextEditor, risk: Risk): Promise<void>;
}

class OSSRiskRemediator implements RiskRemediator {
  async remediate(editor: vscode.TextEditor, risk: Risk): Promise<void> {
    if (!editor) {
      throw new Error("No active text editor");
    }

    const lineChanges = await detectLineChanges([risk.sourceCode.lineNumber]);
    //@ts-ignore
    const lineNumber = lineChanges?.[0]?.newLineNum ?? parseInt(risk.sourceCode.lineNumber);

    const document = editor.document;
    //@ts-ignore
    const componentName = risk.component.split();
    const depKey = risk.component.split(":")[0];
    const fixVersion = risk.remediationSuggestion.nearestFixVersion;

    console.log(`Attempting to update ${componentName} to version ${fixVersion}`);

    const line = document.lineAt(lineNumber - 1);
    const lineText = line.text;

    if (!lineText.includes(`"${depKey}"`)) {
      vscode.window.showInformationMessage(
        `${depKey} was not found in the specified line:${lineText}`
      );
      return;
    }

    const leadingWhitespace = lineText.match(/^\s*/)?.[0] ?? '';
    const trailingChars = lineText.match(/[,\s]*$/)?.[0] ?? '';
    const updatedLineText = `${leadingWhitespace}"${depKey}": "${fixVersion}"${trailingChars}`;

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, line.range, updatedLineText);

    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
      console.log(`Successfully updated ${componentName} to ${fixVersion}`);
      vscode.window.showInformationMessage(
        `Successfully updated ${componentName} to ${fixVersion} in the current file.`
      );
      await vscode.workspace.saveAll(false);
      vscode.window.showInformationMessage(`File saved after remediation.`);
    } else {
      throw new Error("Failed to apply the edit to the current file");
    }
  }
}

class RiskRemediationFactory {
  static createRemediator(riskCategory: string): RiskRemediator {
    switch (riskCategory) {
      case 'OSS Security':
        return new OSSRiskRemediator();
      // Add more cases for future risk categories
      default:
        throw new Error(`Unsupported risk category: ${riskCategory}`);
    }
  }
}

export async function remediateRisk(editor: vscode.TextEditor, risk: Risk) {
  try {
    const remediator = RiskRemediationFactory.createRemediator(risk.riskCategory);
    await remediator.remediate(editor, risk);
  } catch (error: any) {
    console.error("Error remediating risk:", error);
    vscode.window.showErrorMessage(`Error remediating risk: ${error.message}`);
  }
}

export function hasRemedy(risk: Risk): boolean {
  return Boolean(risk.remediationSuggestion);
}
