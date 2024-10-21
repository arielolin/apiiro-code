import * as vscode from "vscode";

let isFileLocked = false;
let lockedEditor: vscode.TextEditor | undefined;
let lockDisposables: vscode.Disposable[] = [];
let readonlyDecorationType: vscode.TextEditorDecorationType;
let suggestedLineDecorationType: vscode.TextEditorDecorationType;
let suggestedLineNumber: number | undefined;
let suggestedLineContent: string | undefined;
let riskyLineDecorationType: vscode.TextEditorDecorationType;

export async function addSuggestionLine(
  editor: vscode.TextEditor,
  lineNumber: number,
  originalText: string,
  fixedText: string,
  remediateAction: () => Promise<void>,
): Promise<void> {
  const document = editor.document;
  const position = new vscode.Position(lineNumber, 0);
  const suggestionLine = fixedText;
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, position, suggestionLine + "\n");
  await vscode.workspace.applyEdit(edit);

  // Save the file after adding the suggestion
  await document.save();

  // Lock the file
  isFileLocked = false;
  lockedEditor = editor;
  suggestedLineNumber = lineNumber;
  suggestedLineContent = suggestionLine;

  readonlyDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: "0.1",
  });

  suggestedLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(0, 255, 0, 0.2)",
    isWholeLine: true,
  });

  riskyLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 0, 0, 0.2)",
    isWholeLine: true,
  });

  // Apply read-only decoration to the entire document except the suggested line
  updateReadonlyDecorations(editor);

  // Prevent edits by immediately undoing them, except for the suggested line
  const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document === document && isFileLocked) {
      const changes = event.contentChanges;
      let needsUndo = false;

      for (const change of changes) {
        if (change.range.start.line !== suggestedLineNumber) {
          needsUndo = true;
          break;
        }
      }

      if (needsUndo) {
        setTimeout(async () => {
          await vscode.commands.executeCommand("undo");
          await restoreSuggestedLineIfNeeded(editor);
          vscode.window.showWarningMessage(
            "This file is locked. Please accept or ignore the suggestion before editing.",
          );
        }, 0);
      }
    }
  });

  lockDisposables.push(changeDisposable);

  const disposable = vscode.languages.registerCodeLensProvider(
    {
      language: "*",
      scheme: "file",
    },
    {
      provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        // Find the current position of the suggested line
        const lines = document.getText().split("\n");
        const currentIndex = lines.findIndex(
          (line) => line.trim() === suggestionLine.trim(),
        );

        if (currentIndex === -1) {
          return []; // Suggestion line not found, don't provide CodeLens
        }

        const suggestionRange = new vscode.Range(
          currentIndex,
          0,
          currentIndex,
          suggestionLine.length,
        );
        return [
          new vscode.CodeLens(suggestionRange, {
            title: "Accept",
            command: "extension.remediateRisk",
            arguments: [
              remediateAction,
              disposable,
              currentIndex,
              fixedText,
              originalText,
            ],
          }),
          new vscode.CodeLens(suggestionRange, {
            title: "Ignore",
            command: "extension.ignoreRemediation",
            arguments: [disposable, currentIndex],
          }),
        ];
      },
    },
  );

  lockDisposables.push(disposable);

  vscode.commands.registerCommand(
    "extension.remediateRisk",
    async (
      action: () => Promise<void>,
      disp: vscode.Disposable,
      lineNum: number,
      fixedLine: string,
      originalLine: string,
    ) => {
      await remediateRisk(action, disp, lineNum, fixedLine, originalLine);
    },
  );

  vscode.commands.registerCommand(
    "extension.ignoreRemediation",
    async (disp: vscode.Disposable, lineNum: number) => {
      await ignoreRemediation(disp, lineNum);
    },
  );
}

function updateReadonlyDecorations(editor: vscode.TextEditor) {
  if (suggestedLineNumber === undefined) return;

  const document = editor.document;
  const ranges: vscode.Range[] = [];

  // Apply readonly decoration to all lines before the original line
  if (suggestedLineNumber > 1) {
    ranges.push(new vscode.Range(0, 0, suggestedLineNumber - 1, 0));
  }

  // Apply readonly decoration to all lines after the suggested line
  if (suggestedLineNumber < document.lineCount - 1) {
    ranges.push(
      new vscode.Range(suggestedLineNumber + 1, 0, document.lineCount, 0),
    );
  }

  editor.setDecorations(readonlyDecorationType, ranges);

  // Apply green highlight to the suggested line
  editor.setDecorations(suggestedLineDecorationType, [
    new vscode.Range(suggestedLineNumber, 0, suggestedLineNumber, 0),
  ]);

  editor.setDecorations(riskyLineDecorationType, [
    new vscode.Range(suggestedLineNumber - 1, 0, suggestedLineNumber - 1, 0),
  ]);
}

async function restoreSuggestedLineIfNeeded(editor: vscode.TextEditor) {
  if (suggestedLineNumber === undefined || suggestedLineContent === undefined)
    return;

  const document = editor.document;
  if (
    suggestedLineNumber >= document.lineCount ||
    document.lineAt(suggestedLineNumber).text !== suggestedLineContent
  ) {
    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      document.uri,
      new vscode.Position(suggestedLineNumber, 0),
      suggestedLineContent + "\n",
    );
    await vscode.workspace.applyEdit(edit);
    updateReadonlyDecorations(editor);
  }
}

async function remediateRisk(
  action: () => Promise<void>,
  disp: vscode.Disposable,
  lineNum: number,
  fixedLine: string,
  originalLine: string,
): Promise<void> {
  unlockFile();

  await action();

  // Get the active text editor after the action is executed
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    log("Error: No active text editor found after action execution");
    return;
  }

  try {
    const success = await editor.edit(
      (editBuilder) => {
        // Replace the original line with the fixed line
        editBuilder.replace(
          new vscode.Range(lineNum - 1, 0, lineNum - 1, originalLine.length),
          fixedLine,
        );

        editBuilder.delete(new vscode.Range(lineNum, 0, lineNum + 1, 0));
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

  disp.dispose();
}

function unlockFile() {
  log("Entering unlockFile function");
  if (isFileLocked) {
    isFileLocked = false;
    if (lockedEditor) {
      lockedEditor.setDecorations(readonlyDecorationType, []);
      lockedEditor.setDecorations(suggestedLineDecorationType, []);
      lockedEditor.setDecorations(riskyLineDecorationType, []);
    }
    readonlyDecorationType.dispose();
    suggestedLineDecorationType.dispose();
    riskyLineDecorationType.dispose();
    lockDisposables.forEach((d) => d.dispose());
    lockDisposables = [];
    lockedEditor = undefined;
    suggestedLineNumber = undefined;
    suggestedLineContent = undefined;
    log("File unlocked and state reset");
  } else {
    log("File was not locked");
  }
}

async function ignoreRemediation(
  disp: vscode.Disposable,
  lineNum: number,
): Promise<void> {
  unlockFile();

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
      log("Document saved successfully");
    } else {
      throw "Edit operation failed";
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error during edit operation: ${error}`);
  }

  disp.dispose();
}

function log(message: string) {
  vscode.window.showInformationMessage(`[RemediateRisk] ${message}`);
}
