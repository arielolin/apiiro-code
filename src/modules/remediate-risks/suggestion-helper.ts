import * as vscode from "vscode";

let suggestedLineDecorationType: vscode.TextEditorDecorationType;
let suggestedLineNumber: number | undefined;
let suggestedLineContent: string | undefined;
let riskyLineDecorationType: vscode.TextEditorDecorationType;

export async function addSuggestionLine(
  editor: vscode.TextEditor,
  lineNumber: number,
  originalText: string,
  fixedText: string,
  onRiskRemediation: () => void,
): Promise<void> {
  const document = editor.document;
  const position = new vscode.Position(lineNumber, 0);
  const suggestionLine = fixedText;
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, position, suggestionLine + "\n");
  await vscode.workspace.applyEdit(edit);

  // Save the file after adding the suggestion
  await document.save();

  suggestedLineNumber = lineNumber;
  suggestedLineContent = suggestionLine;

  suggestedLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(0, 255, 0, 0.2)",
    isWholeLine: true,
  });

  riskyLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 0, 0, 0.2)",
    isWholeLine: true,
  });

  // Apply highlight decorations
  updateDecorations(editor);

  const disposable = vscode.languages.registerCodeLensProvider(
    {
      language: "*",
      scheme: "file",
    },
    {
      provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        // Find the current position of the suggested line
        const lines = document.getText().split("\n");
        const suggestedLine = lines.findIndex(
          (line) => line.trim() === suggestionLine.trim(),
        );
        const originalLine = lines.findIndex(
          (line) => line.trim() === originalText.trim(),
        );

        if (suggestedLine === -1) {
          return []; // Suggestion line not found, don't provide CodeLens
        }

        const suggestionRange = new vscode.Range(
          suggestedLine,
          0,
          suggestedLine,
          suggestionLine.length,
        );
        return [
          new vscode.CodeLens(suggestionRange, {
            title: "Accept",
            command: "extension.acceptSuggestion",
            arguments: [disposable, originalLine],
          }),
          new vscode.CodeLens(suggestionRange, {
            title: "Decline",
            command: "extension.ignoreSuggestion",
            arguments: [disposable, suggestedLine],
          }),
        ];
      },
    },
  );

  vscode.commands.registerCommand(
    "extension.acceptSuggestion",
    async (disp: vscode.Disposable, originalLineNum: number) => {
      await acceptSuggestion(disp, originalLineNum);
      onRiskRemediation();
    },
  );

  vscode.commands.registerCommand(
    "extension.ignoreSuggestion",
    async (disp: vscode.Disposable, lineNum: number) => {
      await ignoreRemediation(disp, lineNum);
    },
  );
}

function updateDecorations(editor: vscode.TextEditor) {
  if (suggestedLineNumber === undefined) return;

  // Apply green highlight to the suggested line
  editor.setDecorations(suggestedLineDecorationType, [
    new vscode.Range(suggestedLineNumber, 0, suggestedLineNumber, 0),
  ]);

  // Apply red highlight to the original line
  editor.setDecorations(riskyLineDecorationType, [
    new vscode.Range(suggestedLineNumber - 1, 0, suggestedLineNumber - 1, 0),
  ]);
}

async function acceptSuggestion(
  disp: vscode.Disposable,
  originalLineNum: number,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    log("Error: No active text editor found after action execution");
    return;
  }

  try {
    const success = await editor.edit(
      (editBuilder) => {
        editBuilder.delete(
          new vscode.Range(originalLineNum, 0, originalLineNum + 1, 0),
        );
      },
      { undoStopBefore: true, undoStopAfter: true },
    );

    if (success) {
      await editor.document.save();
      log("Risk remediated and document saved successfully");
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error during edit operation: ${error}`);
  }

  // Clean up decorations and dispose of the CodeLens provider
  cleanUpDecorations();
  disp.dispose();
}

async function ignoreRemediation(
  disp: vscode.Disposable,
  lineNum: number,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("Error: No active text editor found");
    return;
  }

  try {
    const success = await editor.edit(
      (editBuilder) => {
        editBuilder.delete(new vscode.Range(lineNum, 0, lineNum + 1, 0));
      },
      { undoStopBefore: true, undoStopAfter: true },
    );

    if (success) {
      await editor.document.save();
      log("Suggestion ignored and document saved successfully");
    } else {
      throw "Edit operation failed";
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error during edit operation: ${error}`);
  }

  cleanUpDecorations();
  disp.dispose();
}

function cleanUpDecorations() {
  if (vscode.window.activeTextEditor) {
    vscode.window.activeTextEditor.setDecorations(
      suggestedLineDecorationType,
      [],
    );
    vscode.window.activeTextEditor.setDecorations(riskyLineDecorationType, []);
  }
  suggestedLineDecorationType.dispose();
  riskyLineDecorationType.dispose();
  suggestedLineNumber = undefined;
  suggestedLineContent = undefined;
}

function log(message: string) {
  vscode.window.showInformationMessage(`${message}`);
}
