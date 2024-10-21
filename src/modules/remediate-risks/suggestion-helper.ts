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

  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: "  [Remediate]",
      color: "green",
      fontWeight: "bold",
      border: "1px solid green",
      margin: "0 0 0 10px",
    },
  });

  const suggestionLine = `${originalText} // Suggestion: ${fixedText}`;

  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, position, suggestionLine + "\n");

  await vscode.workspace.applyEdit(edit);

  editor.setDecorations(decorationType, [
    new vscode.Range(lineNumber, 0, lineNumber, suggestionLine.length),
  ]);

  const disposable = vscode.languages.registerCodeLensProvider(
    {
      language: "*",
      scheme: "file",
    },
    {
      provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const range = new vscode.Range(
          lineNumber,
          0,
          lineNumber,
          suggestionLine.length,
        );
        return [
          new vscode.CodeLens(range, {
            title: "Remediate",
            command: "extension.remediateRisk",
            arguments: [
              remediateAction,
              decorationType,
              disposable,
              lineNumber,
              fixedText,
            ],
          }),
        ];
      },
    },
  );

  vscode.commands.registerCommand(
    "extension.remediateRisk",
    async (
      action: () => Promise<void>,
      decType: vscode.TextEditorDecorationType,
      disp: vscode.Disposable,
      lineNum: number,
      fixedLine: string,
    ) => {
      await action();
      editor.edit((editBuilder) => {
        editBuilder.replace(
          new vscode.Range(lineNum - 1, 0, lineNum - 1, originalText.length),
          fixedLine,
        );
        editBuilder.delete(new vscode.Range(lineNum, 0, lineNum + 1, 0));
      });
      editor.setDecorations(decType, []);
      decType.dispose();
      disp.dispose();
    },
  );
}
