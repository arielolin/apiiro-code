import * as vscode from "vscode";
import { RiskHighlighter } from "./modules/risks-highlighter";
import { remediateRisk } from "./modules/remediate-risks/remediate-risks";
import { getRepoName } from "./modules/git";
import { getRepo } from "./api";
import { Repository } from "./types/repository";

let riskHighlighter: RiskHighlighter;
let filePanel: vscode.WebviewPanel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  riskHighlighter = new RiskHighlighter(context);
  let repoData: Repository | undefined;

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    try {
      const repoName = await getRepoName(workspaceFolders[0].uri.fsPath);
      repoData = await getRepo(repoName);

      if (repoData) {
        vscode.window.showInformationMessage(
          `Current repository data: ${repoName}`,
        );
      } else {
        vscode.window.showWarningMessage(
          `Failed to retrieve data for repository: ${repoName}`,
        );
      }
    } catch (error) {
      console.error("Error getting repository name:", error);
      vscode.window.showErrorMessage("Failed to get repository name");
    }
  }

  const highlightDisposable = vscode.commands.registerCommand(
    "apiiro-code.highlightRisks",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await highlightRisksInEditor(editor, repoData);
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
        await highlightRisksInEditor(editor, repoData);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === document) {
        await highlightRisksInEditor(editor, repoData);
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

  if (vscode.window.activeTextEditor) {
    highlightRisksInEditor(vscode.window.activeTextEditor, repoData);
  }
}

async function highlightRisksInEditor(
  editor: vscode.TextEditor,
  repoData: Repository | undefined,
) {
  try {
    if (repoData) {
      await riskHighlighter.highlightRisk(editor, repoData);
    } else {
      vscode.window.showWarningMessage("Repository data is not available");
    }
  } catch (error: any) {
    console.error("Error highlighting risks:", error);
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
