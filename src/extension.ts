import * as vscode from "vscode";
import { RiskHighlighter } from "./modules/highlight-risks/risks-highlighter";
import { remediateRisk } from "./modules/remediate-risks/remediate-risks";
import { Repository } from "./types/repository";
import _ from "lodash";
import { AuthService } from "./services/auth-service";
import { WorkspaceService } from "./services/workspace-service";

let filePanel: vscode.WebviewPanel | undefined;
let repoData: Repository;
let preventHighlights = false;

export async function activate(context: vscode.ExtensionContext) {
  const authService = AuthService.getInstance();
  const workspaceService = new WorkspaceService();

  const isAuthenticated = await authService.verifyAuthentication();
  if (!isAuthenticated) {
    return;
  }

  const isInitialized = await workspaceService.initialize();
  if (!isInitialized) {
    return;
  }
  const workspaceInfo = workspaceService.getWorkspaceInfo();
  if (!workspaceInfo) {
    return;
  }

  repoData = workspaceInfo.repoData;

  const riskHighlighter = new RiskHighlighter(context);

  const highlightRisks = async (
    editor: vscode.TextEditor,
    repo: Repository,
  ) => {
    if (!preventHighlights) {
      await riskHighlighter.highlightRisks(editor, repo);
    }
  };

  const highlightDisposable = vscode.commands.registerCommand(
    "apiiro-code.highlightRisks",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await highlightRisks(editor, repoData);
      } else {
        vscode.window.showWarningMessage("No active editor");
      }
    },
  );

  const remediateDisposable = vscode.commands.registerCommand(
    "apiiro-code.remediate",
    async (risk) => {
      if (preventHighlights) {
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        preventHighlights = true;
        await riskHighlighter.removeAllHighlights(editor);
        await remediateRisk(
          editor,
          risk,
          repoData,
          () => (preventHighlights = false),
        );
      }
    },
  );

  context.subscriptions.push(highlightDisposable, remediateDisposable);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        await highlightRisks(editor, repoData);
      }
    }),
  );

  const debounceHighlight = _.debounce(async (editor: vscode.TextEditor) => {
    await highlightRisks(editor, repoData);
  }, 500);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        await riskHighlighter.removeAllHighlights(editor);
        debounceHighlight(editor);
      }
    }),
  );

  if (vscode.window.activeTextEditor) {
    await highlightRisks(vscode.window.activeTextEditor, repoData);
  }
}

export function deactivate() {
  if (filePanel) {
    filePanel.dispose();
  }
}
