import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface LineChangeInfo {
  originalLineNumber: number;
  hasChanged: boolean;
  hasMoved: boolean;
  newLineNum: number | null;
}

export async function detectLineChanges(
  filePath: string,
  lineNumbers: number[],
): Promise<LineChangeInfo[]> {
  let logInfo: string[] = [];

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }

    logInfo.push(
      `Input - filePath: ${filePath}, lineNumbers: ${lineNumbers.join(", ")}`,
    );

    // Fetch the latest changes
    await runGitCommand(`cd "${workspaceFolder}" && git fetch origin`);

    // Get the diff with line numbers and detect moves
    const diffOutput = await runGitCommand(
      `cd "${workspaceFolder}" && git diff -M --color-moved=zebra -U0 origin/main -- "${filePath}"`,
    );

    logInfo.push(`Diff output length: ${diffOutput.length}`);
    logInfo.push(`Full diff output: ${diffOutput}`);

    const lines = diffOutput.split("\n");
    logInfo.push(`Number of diff lines: ${lines.length}`);

    let results: LineChangeInfo[] = lineNumbers.map((lineNumber) => ({
      originalLineNumber: lineNumber,
      hasChanged: false,
      hasMoved: false,
      newLineNum: lineNumber,
    }));

    let currentOldLineNum = 1;
    let currentNewLineNum = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      logInfo.push(`Processing Line ${i}: ${line}`);

      if (line.startsWith("@@")) {
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match) {
          const hunkOldStart = parseInt(match[1], 10);
          const hunkOldLines = parseInt(match[2] || "1", 10);
          const hunkNewStart = parseInt(match[3], 10);
          const hunkNewLines = parseInt(match[4] || "1", 10);
          const linesAddedInHunk = hunkNewLines - hunkOldLines;

          logInfo.push(
            `Hunk details - Old Start: ${hunkOldStart}, Old Lines: ${hunkOldLines}, New Start: ${hunkNewStart}, New Lines: ${hunkNewLines}, Lines Added: ${linesAddedInHunk}`,
          );

          // Adjust the newLineNum for all affected lines
          results.forEach((result) => {
            if (hunkOldStart <= result.originalLineNumber) {
              result.newLineNum =
                (result.newLineNum as number) + linesAddedInHunk;
              logInfo.push(
                `Adjusting newLineNum for line ${result.originalLineNumber}. New value: ${result.newLineNum}`,
              );
            }
          });

          currentOldLineNum = hunkOldStart;
          currentNewLineNum = hunkNewStart;
        } else {
          logInfo.push(`WARNING: Failed to parse hunk header: ${line}`);
        }
      } else if (line.startsWith("-")) {
        logInfo.push(`Removed line ${currentOldLineNum}: ${line}`);
        results.forEach((result) => {
          if (currentOldLineNum === result.originalLineNumber) {
            result.hasChanged = true;
            result.hasMoved = false;
            result.newLineNum = null;
            logInfo.push(
              `Line removal detected at target line ${result.originalLineNumber}`,
            );
          }
        });
        currentOldLineNum++;
      } else if (line.startsWith("+")) {
        logInfo.push(`Added line ${currentNewLineNum}: ${line}`);
        currentNewLineNum++;
      } else {
        logInfo.push(
          `Unchanged line ${currentOldLineNum} -> ${currentNewLineNum}: ${line}`,
        );
        results.forEach((result) => {
          if (currentOldLineNum === result.originalLineNumber) {
            if (currentNewLineNum !== result.newLineNum) {
              result.hasMoved = true;
              logInfo.push(
                `Target line moved - Original: ${result.originalLineNumber}, New: ${currentNewLineNum}`,
              );
            }
            result.newLineNum = currentNewLineNum;
          }
        });
        currentOldLineNum++;
        currentNewLineNum++;
      }

      logInfo.push(
        `After line ${i} - Current Old: ${currentOldLineNum}, Current New: ${currentNewLineNum}`,
      );
    }

    // Final sanity check
    results.forEach((result) => {
      logInfo.push(
        //@ts-ignore
        `Final state for line ${result.originalLineNumber} - HasChanged: ${result.hasChanged}, HasMoved: ${result.hasMoved}, NewLineNum: ${result.newLineNum}`,
      );
    });

    // Log all collected information at once with a setTimeout
    setTimeout(() => {
      vscode.window.showInformationMessage(
        `Line Change Detection Log:\n${logInfo.join("\n")}`,
      );
    }, 100); // 100ms delay

    return results;
  } catch (error) {
    vscode.window.showErrorMessage(`Error detecting line changes: ${error}`);
    throw error;
  }
}

async function runGitCommand(command: string): Promise<string> {
  console.log(`Running command: ${command}`);
  try {
    const { stdout } = await execAsync(command);
    return stdout;
  } catch (error) {
    console.error(`Error running git command: ${command}`, error);
    throw error;
  }
}
