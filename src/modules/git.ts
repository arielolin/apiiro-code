import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";
import * as diff from "diff";
import * as path from "path";

const execAsync = promisify(exec);

interface LineChangeInfo {
  originalLineNumber: number;
  hasChanged: boolean;
  hasMoved: boolean;
  newLineNum: number | null;
}

export async function detectLineChanges(
  lineNumbers: number[],
): Promise<LineChangeInfo[]> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("No active text editor");
    }

    const document = editor.document;
    const absoluteFilePath = document.uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      throw new Error("File is not part of a workspace");
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const relativeFilePath = path.relative(workspacePath, absoluteFilePath);

    // Fetch the latest changes
    await runGitCommand(workspacePath, "git fetch origin");

    // Get the content of the file in the main branch
    let mainContent: string;
    try {
      mainContent = await runGitCommand(workspacePath, `git show origin/main:"${relativeFilePath}"`);
    } catch (error) {
      console.log(`File not found in main branch: ${error}`);
      mainContent = ""; // Treat as empty file if not found in main branch
    }

    // Get the content of the current file from the active editor
    const currentContent = document.getText();

    // Calculate the diff
    const diffResult = diff.structuredPatch(
      "main",
      "current",
      mainContent,
      currentContent,
      "",
      ""
    );

    let results: LineChangeInfo[] = lineNumbers.map((lineNumber) => ({
      originalLineNumber: lineNumber,
      hasChanged: mainContent === "", // If main content is empty, all lines are new
      hasMoved: false,
      newLineNum: lineNumber,
    }));

    if (mainContent !== "") {
      let lineMapping = new Map<number, number>();
      let currentOldLine = 1;
      let currentNewLine = 1;

      for (const hunk of diffResult.hunks) {
        // Map unchanged lines before the hunk
        while (currentOldLine < hunk.oldStart) {
          lineMapping.set(currentOldLine, currentNewLine);
          currentOldLine++;
          currentNewLine++;
        }

        for (const line of hunk.lines) {
          if (line.startsWith('-')) {
            // Removed line
            currentOldLine++;
          } else if (line.startsWith('+')) {
            // Added line
            currentNewLine++;
          } else {
            // Unchanged line
            lineMapping.set(currentOldLine, currentNewLine);
            currentOldLine++;
            currentNewLine++;
          }
        }
      }

      // Map any remaining unchanged lines
      while (currentOldLine <= mainContent.split('\n').length) {
        lineMapping.set(currentOldLine, currentNewLine);
        currentOldLine++;
        currentNewLine++;
      }

      // Update results based on the mapping
      results.forEach(result => {
        const newLineNum = lineMapping.get(result.originalLineNumber);
        if (newLineNum === undefined) {
          result.hasChanged = true;
          result.hasMoved = false;
          result.newLineNum = null;
        } else {
          result.newLineNum = newLineNum;
          result.hasMoved = newLineNum !== result.originalLineNumber;
        }
      });
    }

    return results;
  } catch (error) {
    vscode.window.showErrorMessage(`Error detecting line changes: ${error}`);
    throw error;
  }
}

async function runGitCommand(cwd: string, command: string): Promise<string> {
  console.log(`Running command in ${cwd}: ${command}`);
  try {
    const { stdout } = await execAsync(command, { cwd });
    return stdout.trim();
  } catch (error) {
    console.error(`Error running git command: ${command}`, error);
    throw error;
  }
}