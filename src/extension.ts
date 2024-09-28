import * as vscode from "vscode";
import { RiskHighlighter } from "./risks-highlighter";

let riskHighlighter: RiskHighlighter;

export function activate(context: vscode.ExtensionContext) {
  riskHighlighter = new RiskHighlighter(context);

  const disposable = vscode.commands.registerCommand(
    "apiiro-code.highlightSecrets",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await highlightRisksInEditor(editor);
      } else {
        vscode.window.showInformationMessage("No active editor");
      }
    },
  );

  context.subscriptions.push(disposable);

  // Highlight secrets when a file is opened
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        await highlightRisksInEditor(editor);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === document) {
        await highlightRisksInEditor(editor);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        await highlightRisksInEditor(editor);
      }
    }),
  );

  // Initial highlight for the active editor
  if (vscode.window.activeTextEditor) {
    highlightRisksInEditor(vscode.window.activeTextEditor);
  }
}

async function highlightRisksInEditor(editor: vscode.TextEditor) {
  try {
    await riskHighlighter.highlightRisk(editor);
  } catch (error: any) {
    console.error("Error highlighting secrets:", error);
    vscode.window.showErrorMessage(error.message);
  }
}

export function deactivate() {
  // Clean up resources if needed
}
