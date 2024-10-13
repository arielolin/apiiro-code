import * as vscode from "vscode";
import { RiskHighlighter } from "./modules/risks-highlighter";
import { remediateRisk } from "./modules/remediate-risks/remediate-risks";
import { getMonitoredRepositoriesByName } from "./api";
import { getRemoteUrl, getRepoName } from "./modules/git";
import { Repository } from "./types/repository";
import _ from "lodash";

let filePanel: vscode.WebviewPanel | undefined;
let repoData: Repository;
let baseBranch: string;

export async function activate(context: vscode.ExtensionContext) {
  const riskHighlighter = new RiskHighlighter(context);

  const highlightRisks = riskHighlighter.highlightRisks.bind(riskHighlighter);

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
      const allMonitoredRepositories = await getMonitoredRepositoriesByName(
        repoName,
        remoteUrl,
      );

      if (allMonitoredRepositories.length === 0) {
        vscode.window.showWarningMessage(
          "Apiiro: No repositories found for the provided repository name.",
        );
        return;
      }

      if (allMonitoredRepositories.length === 1) {
        baseBranch = allMonitoredRepositories[0].branchName;
      } else {
        const branchData = await vscode.window.showQuickPick(
          allMonitoredRepositories.map((repo) => ({
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

      repoData = allMonitoredRepositories.find(
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
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await remediateRisk(editor, risk, repoData);
      }
    },
  );

  context.subscriptions.push(highlightDisposable, remediateDisposable);

  // Highlight risks when a file is opened
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
