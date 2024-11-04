import * as vscode from "vscode";
import { RiskHighlighter } from "./modules/highlight-risks/risks-highlighter";
import { remediateRisk } from "./modules/remediate-risks/remediate-risks";
import { getMonitoredRepositoriesByName } from "./api";
import { getRemoteUrl, getRepoName } from "./services/git-service";
import { Repository } from "./types/repository";
import _ from "lodash";

let filePanel: vscode.WebviewPanel | undefined;
let repoData: Repository;
let baseBranch: string;
let preventHighlights = false;

export async function activate(context: vscode.ExtensionContext) {
  const riskHighlighter = new RiskHighlighter(context);

  const highlightRisks = async (
    editor: vscode.TextEditor,
    repo: Repository,
  ) => {
    if (!preventHighlights) {
      await riskHighlighter.highlightRisks(editor, repo);
    }
  };

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    try {
      const repoName = await getRepoName(workspaceFolders[0].uri.fsPath);
      const remoteUrl = await getRemoteUrl(workspaceFolders[0].uri.fsPath);
      if (!remoteUrl) {
        vscode.window.showErrorMessage(
          "Apiiro: Can't find remote URL for the current workspace.",
        );
        return;
      }
      const matchedMonitoredRepositories = await getMonitoredRepositoriesByName(
        repoName,
        remoteUrl,
      );

      if (matchedMonitoredRepositories.length === 0) {
        vscode.window.showWarningMessage(
          "Apiiro: No repositories found for the provided repository name.",
        );
        return;
      }

      if (matchedMonitoredRepositories.length === 1) {
        baseBranch = matchedMonitoredRepositories[0].branchName;
      } else {
        const branchData = await vscode.window.showQuickPick(
          matchedMonitoredRepositories.map((repo) => ({
            label: repo.branchName,
            detail: repo.name,
          })),
          {
            placeHolder: "Select Base Branch",
            matchOnDetail: true,
          },
        );

        if (!branchData) {
          vscode.window.showWarningMessage("Apiiro: No base branch selected.");
          return;
        }

        baseBranch = branchData.label;
      }

      if (!baseBranch) {
        vscode.window.showWarningMessage("Apiiro: No base branch provided.");
        return;
      }

      repoData = matchedMonitoredRepositories.find(
        (repo) => repo.branchName === baseBranch,
      ) as Repository;

      if (!repoData) {
        vscode.window.showWarningMessage(
          `Apiiro: Failed to retrieve data for repository: ${repoName}`,
        );
        return;
      }

      repoData.branchName = baseBranch;

      if (!repoData) {
        vscode.window.showWarningMessage(
          `Failed to retrieve data for repository: ${repoName}`,
        );
      }
    } catch (error) {
      console.error("Error getting repository name:", error);

      vscode.window.showWarningMessage(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const highlightDisposable = vscode.commands.registerCommand(
    "apiiro-code.highlightRisks",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await highlightRisks(editor, repoData);
      } else {
        vscode.window.showInformationMessage("No active editor");
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
