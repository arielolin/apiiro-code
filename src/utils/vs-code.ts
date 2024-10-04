import vscode from "vscode";
import path from "path";

export function getRelativeFilePath(editor: vscode.TextEditor) {
  const currentFilePath = editor.document.uri.fsPath;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    editor.document.uri,
  );

  return workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, currentFilePath)
    : null;
}
