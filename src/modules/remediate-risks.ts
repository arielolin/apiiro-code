import * as vscode from "vscode";
import { detectLineChanges } from "./git";
import { getRelativeFilePath } from "./text-editor";

export async function remediateRisk(editor: vscode.TextEditor, risk: any) {
  try {
    if (!editor) {
      throw new Error("No active text editor");
    }
    //@ts-ignore
    const lineChanges = await detectLineChanges(getRelativeFilePath(editor), [
      risk.sourceCode.lineNumber,
    ]);

    const lineNumber =
      lineChanges?.[0]?.newLineNum ?? parseInt(risk.sourceCode.lineNumber);

    const document = editor.document;
    const componentName = risk.component.split(); 
    const depKey = risk.component.split(":")[0];
    const fixVersion = risk.remediationSuggestion.nearestFixVersion; 

    console.log(
      `Attempting to update ${componentName} to version ${fixVersion}`,
    );

    // Get the specific line
    const line = document.lineAt(lineNumber - 1);
    const lineText = line.text;

    // Check if the line contains the component name
    if (!lineText.includes(`"${depKey}"`)) {
      vscode.window.showInformationMessage(
        `${depKey} was not found in the specified line:${lineText}`,
      );
      return;
    }

    // Extract the leading whitespace
    //@ts-ignore
    const leadingWhitespace = lineText.match(/^\s*/)[0];

    // Extract any trailing characters after the version (e.g., comma, additional spaces)
    //@ts-ignore
    const trailingChars = lineText.match(/[,\s]*$/)[0];

    // Replace the version in the matched line, preserving leading and trailing spaces
    const updatedLineText = `${leadingWhitespace}"${depKey}": "${fixVersion}"${trailingChars}`;

    // Create a WorkspaceEdit to perform the text replacement
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, line.range, updatedLineText);

    // Perform the edit
    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
      console.log(`Successfully updated ${componentName} to ${fixVersion}`);
      vscode.window.showInformationMessage(
        `Successfully updated ${componentName} to ${fixVersion} in the current file.`,
      );
    } else {
      throw new Error("Failed to apply the edit to the current file");
    }
  } catch (error: any) {
    console.error("Error remediating risk:", error);
    vscode.window.showErrorMessage(`Error remediating risk: ${error.message}`);
  }
}
