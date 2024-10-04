import * as vscode from "vscode";
import { RiskHighlighter } from "./modules/risks-highlighter";
import { remediateRisk } from "./modules/remediate-risks";

let riskHighlighter: RiskHighlighter;
let filePanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  riskHighlighter = new RiskHighlighter(context);

  const highlightDisposable = vscode.commands.registerCommand(
    "apiiro-code.highlightRisks",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await highlightRisksInEditor(editor);
      } else {
        vscode.window.showInformationMessage("No active editor");
      }
    },
  );

  const remediateDisposable = vscode.commands.registerCommand(
    "apiiro-code.remediate",
    async (risk) => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await remediateRisk(editor, risk);
      }
    },
  );

  context.subscriptions.push(highlightDisposable);
  context.subscriptions.push(remediateDisposable);

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
      if (editor) {
        await riskHighlighter.removeAllHighlights(editor);
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

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function deactivate() {
  if (filePanel) {
    filePanel.dispose();
  }
}
