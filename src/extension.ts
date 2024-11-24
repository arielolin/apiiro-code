import * as vscode from "vscode";
import { RiskHighlighter } from "./modules/highlight-risks/risks-highlighter";
import { remediateRisk } from "./modules/remediate-risks/remediate-risks";
import { Repository } from "./types/repository";
import _ from "lodash";
import { AuthService } from "./services/auth-service";
import { WorkspaceService } from "./services/workspace-service";

import { openFileAtLine } from "./utils/vs-code";
import { InventoryTreeProvider } from "./modules/apiiro-pane/inventory/inventory-tree";
import { RisksTreeProvider } from "./modules/apiiro-pane/risks-pane/risks-tree";
import path from "path";

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

  const inventoryProvider = new InventoryTreeProvider(repoData);

  const inventoryView = vscode.window.createTreeView("inventoryExplorer", {
    treeDataProvider: inventoryProvider,
  });

  // Register inventory commands
  const refreshInventoryCommand = vscode.commands.registerCommand(
    "inventory.refresh",
    () => {
      inventoryProvider.refresh();
    },
  );

  const openFileCommand = vscode.commands.registerCommand(
    "inventory.openFile",
    async (filePath: string, lineNumber: number) => {
      await openFileAtLine(filePath, lineNumber);
    },
  );
  // Register all risks view
  const risksProvider = new RisksTreeProvider(repoData);
  vscode.window.registerTreeDataProvider("risksExplorer", risksProvider);

  // Register the openFile command if not already registered
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "risks.openFile",
      async (filePath: string, lineNumber: number) => {
        try {
          // If we have a workspace folder, try to resolve the file relative to it
          let fullPath = filePath;
          if (vscode.workspace.workspaceFolders?.length) {
            const workspaceRoot =
              vscode.workspace.workspaceFolders[0].uri.fsPath;
            fullPath = path.join(workspaceRoot, filePath);
          }

          // Try to find the file
          let fileUri: vscode.Uri;
          try {
            fileUri = vscode.Uri.file(fullPath);
            await vscode.workspace.fs.stat(fileUri); // Check if file exists
          } catch {
            // If file not found, show error with path info for debugging
            throw new Error(
              `File not found: ${fullPath} (original path: ${filePath})`,
            );
          }

          const document = await vscode.workspace.openTextDocument(fileUri);
          const editor = await vscode.window.showTextDocument(document);

          // Go to specific line
          const position = new vscode.Position(lineNumber - 1, 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter,
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to open file ${filePath},${lineNumber}: ${error}`,
          );
        }
      },
    ),
  );

  // Initialize Risk Highlighter
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

  context.subscriptions.push(
    highlightDisposable,
    remediateDisposable,
    refreshInventoryCommand,
    openFileCommand,
    inventoryView,
  );

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

  // Initial highlights for active editor
  if (vscode.window.activeTextEditor) {
    await highlightRisks(vscode.window.activeTextEditor, repoData);
  }

  // Initial inventory data load
  inventoryProvider.refresh();
}

export function deactivate() {
  if (filePanel) {
    filePanel.dispose();
  }
}
