import * as vscode from "vscode";
import { RiskHighlighter } from "./modules/risks-highlighter";
import { remediateRisk } from "./modules/remediate-risks/remediate-risks";
import { getMonitoredRepositoriesByName } from "./api";
import { getRemoteUrl, getRepoName } from "./modules/git";
import { Repository } from "./types/repository";

let filePanel: vscode.WebviewPanel | undefined;
let repoData: Repository;

export async function activate(context: vscode.ExtensionContext) {
  const riskHighlighter = new RiskHighlighter(context);

  const highlightRisk = riskHighlighter.highlightRisk.bind(riskHighlighter);

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
      const allMonitoredRepositories =
        await getMonitoredRepositoriesByName(repoName);

      if (allMonitoredRepositories.length === 0) {
        vscode.window.showWarningMessage(
          "Apiiro: No repositories found for the provided repository name.",
        );
        return;
      }

      const baseBranch = await vscode.window.showQuickPick(
        allMonitoredRepositories.map((repo) => ({
          label: repo.branchName,
          detail: repo.name,
        })),
        {
          placeHolder: "Select Base Branch",
          matchOnDetail: true,
        },
      );

      if (!baseBranch) {
        vscode.window.showWarningMessage("Apiiro: No base branch provided.");
        return;
      }

      repoData = allMonitoredRepositories.find(
        (repo) => repo.branchName === baseBranch.label,
      ) as Repository;

      if (!repoData) {
        vscode.window.showWarningMessage(
          `Apiiro: Failed to retrieve data for repository: ${repoName}`,
        );
        return;
      }

      repoData.branchName = baseBranch.label;

      await vscode.workspace
        .getConfiguration()
        .update(
          "apiiroCode.baseBranch",
          baseBranch,
          vscode.ConfigurationTarget.Workspace,
        );

      const baseBranchByRemoteUrl = { [remoteUrl]: baseBranch };
      await context.globalState.update(
        "apiiroCode.baseBranchByRemoteUrl",
        baseBranchByRemoteUrl,
      );

      if (!repoData) {
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
        await highlightRisk(editor, repoData);
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
        await highlightRisk(editor, repoData);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === document) {
        await highlightRisk(editor, repoData);
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
    await highlightRisk(vscode.window.activeTextEditor, repoData);
  }
}

export function deactivate() {
  if (filePanel) {
    filePanel.dispose();
  }
}
