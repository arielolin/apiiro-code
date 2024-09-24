import * as vscode from "vscode";
import { findRisks } from "../api";
import * as path from "path";
import * as VsCode from "vscode";

interface Risk {
  CodeReference: {
    RelativeFilePath: string;
    LineNumber: number;
  };
  RiskType: string;
}

export class RiskHighlighter {
  private risksDecoration: vscode.TextEditorDecorationType;

  constructor(context: vscode.ExtensionContext) {
    this.risksDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255, 0, 0, 0.3)",
      overviewRulerColor: "red",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      after: {
        contentText: "",
        color: "red",
      },
    });

    context.subscriptions.push(this.risksDecoration);
  }

  async highlightRisk(editor: vscode.TextEditor) {
    try {
      const relativeFilePath = getRelativeFilePath(editor);
      if (relativeFilePath) {
        const risks = (await findRisks(relativeFilePath)) as Risk[];
        this.applyHighlights(editor, risks);
      } else {
        vscode.window.showErrorMessage(
          "Unable to determine relative file path",
        );
      }
    } catch (error) {
      console.error("Error in highlightRisk:", error);
      vscode.window.showErrorMessage(
        `Error highlighting risks: ${(error as Error).message}`,
      );
    }
  }

  private applyHighlights(editor: vscode.TextEditor, risks: Risk[]) {
    const decorations = risks
      .map((risk): vscode.DecorationOptions | null => {
        const lineNumber = risk.CodeReference.LineNumber - 1; // VSCode is 0-indexed
        let range: vscode.Range;

        try {
          range = editor.document.lineAt(lineNumber).range;
        } catch (error) {
          console.error(
            `Invalid line number ${lineNumber + 1} for file ${risk.CodeReference.RelativeFilePath}`,
          );
          return null;
        }

        return {
          range: range,
          hoverMessage: new vscode.MarkdownString(
            `${risk.RiskType} detected in ${risk.CodeReference.RelativeFilePath}`,
          ),
          renderOptions: {
            after: {
              contentText: ` 🔒 ${risk.RiskType} detected`,
              color: "red",
            },
          },
        };
      })
      .filter(
        (decoration): decoration is vscode.DecorationOptions =>
          decoration !== null,
      );

    editor.setDecorations(this.risksDecoration, decorations);

    if (decorations.length > 0) {
      vscode.window.showWarningMessage(
        `Highlighted ${decorations.length} potential risks in this file. Please review and address them.`,
      );
    } else {
      vscode.window.showInformationMessage("No risks detected");
    }
  }
}

function getRelativeFilePath(editor: VsCode.TextEditor): string | null {
  const currentFilePath = editor.document.uri.fsPath;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    editor.document.uri,
  );

  if (workspaceFolder) {
    return path.relative(workspaceFolder.uri.fsPath, currentFilePath);
  } else {
    return null;
  }
}
