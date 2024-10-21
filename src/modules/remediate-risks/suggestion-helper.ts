import * as vscode from "vscode";

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

  const disposable = vscode.languages.registerCodeLensProvider(
    {
      language: "*",
      scheme: "file",
    },
    {
      provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const originalRange = new vscode.Range(
          lineNumber - 1,
          0,
          lineNumber - 1,
          originalText.length,
        );
        const suggestionRange = new vscode.Range(
          lineNumber,
          0,
          lineNumber,
          suggestionLine.length,
        );

        return [
          new vscode.CodeLens(originalRange, {
            title: "Remediation Suggestion",
            command: "extension.showRemediationMenu",
            arguments: [
              remediateAction,
              disposable,
              lineNumber,
              fixedText,
              originalText,
            ],
          }),
          new vscode.CodeLens(suggestionRange, {
            title: "Accept",
            command: "extension.remediateRisk",
            arguments: [
              remediateAction,
              disposable,
              lineNumber,
              fixedText,
              originalText,
            ],
          }),
          new vscode.CodeLens(suggestionRange, {
            title: "Ignore",
            command: "extension.ignoreRemediation",
            arguments: [disposable, lineNumber],
          }),
        ];
      },
    },
  );

  vscode.commands.registerCommand(
    "extension.showRemediationMenu",
    async (
      action: () => Promise<void>,
      disp: vscode.Disposable,
      lineNum: number,
      fixedLine: string,
      originalLine: string,
    ) => {
      const choice = await vscode.window.showQuickPick(
        ["Apply Remediation", "Ignore"],
        { placeHolder: "Choose an action" },
      );

      if (choice === "Apply Remediation") {
        await remediateRisk(
          editor,
          action,
          disp,
          lineNum,
          fixedLine,
          originalLine,
        );
      } else if (choice === "Ignore") {
        await ignoreRemediation(editor, disp, lineNum);
      }
    },
  );

  vscode.commands.registerCommand(
    "extension.remediateRisk",
    async (
      action: () => Promise<void>,
      disp: vscode.Disposable,
      lineNum: number,
      fixedLine: string,
      originalLine: string,
    ) => {
      await remediateRisk(
        editor,
        action,
        disp,
        lineNum,
        fixedLine,
        originalLine,
      );
    },
  );

  vscode.commands.registerCommand(
    "extension.ignoreRemediation",
    async (disp: vscode.Disposable, lineNum: number) => {
      await ignoreRemediation(editor, disp, lineNum);
    },
  );
}

async function remediateRisk(
  editor: vscode.TextEditor,
  action: () => Promise<void>,
  disp: vscode.Disposable,
  lineNum: number,
  fixedLine: string,
  originalLine: string,
): Promise<void> {
  await action();
  await editor.edit((editBuilder) => {
    editBuilder.replace(
      new vscode.Range(lineNum - 1, 0, lineNum - 1, originalLine.length),
      fixedLine,
    );
    editBuilder.delete(new vscode.Range(lineNum, 0, lineNum + 1, 0));
  });
  disp.dispose();
}

async function ignoreRemediation(
  editor: vscode.TextEditor,
  disp: vscode.Disposable,
  lineNum: number,
): Promise<void> {
  await editor.edit((editBuilder) => {
    editBuilder.delete(new vscode.Range(lineNum, 0, lineNum + 1, 0));
  });
  disp.dispose();
}
