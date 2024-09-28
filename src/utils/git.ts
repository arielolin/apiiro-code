import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface LineChangeInfo {
  hasChanged: boolean;
  hasMoved: boolean;
  newLineNum: number | null;
}

export async function hasFileDiffedFromRemote(
  filePath: string,
): Promise<boolean> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found");
      throw new Error("No workspace folder found");
    }

    console.log("Workspace folder:", workspaceFolder);

    // Fetch the latest changes
    await runGitCommand(`cd "${workspaceFolder}" && git fetch origin`);
    vscode.window.showErrorMessage(
      `cd "${workspaceFolder}" && git fetch origin`,
    );

    vscode.window.showErrorMessage(
      `cd "${workspaceFolder}" && git diff --name-only origin/main -- "${filePath}"`,
    );
    // Get the diff
    const diffOutput = await runGitCommand(
      `cd "${workspaceFolder}" && git diff --name-only origin/main -- "${filePath}"`,
    );

    const hasDiffed = diffOutput.trim().length > 0;
    console.log(
      `File ${filePath} has ${hasDiffed ? "diffed" : "not diffed"} from remote`,
    );

    vscode.window.showErrorMessage(
      `File ${filePath} has ${hasDiffed ? "diffed" : "not diffed"} from remote`,
    );

    return hasDiffed;
  } catch (error) {
    console.error("Error checking if file has diffed from remote:", error);
    //@ts-ignore
    vscode.window.showErrorMessage(`Error: ${error.message}`);
    throw error;
  }
}

export async function detectLineChanges(
  filePath: string,
  lineNumber: number,
): Promise<LineChangeInfo> {
  let logInfo: string[] = [];

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }

    logInfo.push(`Input - filePath: ${filePath}, lineNumber: ${lineNumber}`);

    // Fetch the latest changes
    await runGitCommand(`cd "${workspaceFolder}" && git fetch origin`);

    // Get the diff with line numbers and detect moves
    const diffOutput = await runGitCommand(
      `cd "${workspaceFolder}" && git diff -M --color-moved=zebra -U0 origin/main -- "${filePath}"`,
    );

    logInfo.push(`Diff output length: ${diffOutput.length}`);
    logInfo.push(`Full diff output: ${diffOutput}`); // Sanity check: print full diff output

    const lines = diffOutput.split("\n");
    logInfo.push(`Number of diff lines: ${lines.length}`);

    let hasChanged = false;
    let hasMoved = false;
    let newLineNum: number | null = null;
    let currentOldLineNum = 1;
    let currentNewLineNum = 1;
    let totalLinesAdded = 0;

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

          // Check if the target line is affected by this hunk
          if (lineNumber > hunkOldStart) {
            hasChanged = true;
            totalLinesAdded += linesAddedInHunk;
            newLineNum = lineNumber + totalLinesAdded;
            logInfo.push(
              `Target line affected by hunk - Original: ${lineNumber}, New: ${newLineNum}, Total lines added: ${totalLinesAdded}`,
            );
          }

          currentOldLineNum = hunkOldStart;
          currentNewLineNum = hunkNewStart;
        } else {
          logInfo.push(`WARNING: Failed to parse hunk header: ${line}`);
        }
      } else if (line.startsWith("-")) {
        logInfo.push(`Removed line ${currentOldLineNum}: ${line}`);
        if (currentOldLineNum === lineNumber) {
          hasChanged = true;
          hasMoved = false;
          newLineNum = null;
          logInfo.push(`Line removal detected at target line ${lineNumber}`);
        }
        currentOldLineNum++;
      } else if (line.startsWith("+")) {
        logInfo.push(`Added line ${currentNewLineNum}: ${line}`);
        currentNewLineNum++;
      } else {
        logInfo.push(
          `Unchanged line ${currentOldLineNum} -> ${currentNewLineNum}: ${line}`,
        );
        if (currentOldLineNum === lineNumber && !hasChanged) {
          newLineNum = currentNewLineNum;
          logInfo.push(
            `Target line unchanged - Original: ${lineNumber}, New: ${newLineNum}`,
          );
        }
        currentOldLineNum++;
        currentNewLineNum++;
      }

      // Sanity check after each line
      logInfo.push(
        `After line ${i} - Current Old: ${currentOldLineNum}, Current New: ${currentNewLineNum}, HasChanged: ${hasChanged}, NewLineNum: ${newLineNum}`,
      );
    }

    // Final sanity check
    logInfo.push(
      `Final state - HasChanged: ${hasChanged}, HasMoved: ${hasMoved}, NewLineNum: ${newLineNum}, TotalLinesAdded: ${totalLinesAdded}`,
    );

    // Log all collected information at once with a setTimeout
    setTimeout(() => {
      vscode.window.showInformationMessage(
        `Line Change Detection Log:\n${logInfo.join("\n")}`,
      );
    }, 100); // 100ms delay

    return { hasChanged, hasMoved, newLineNum };
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
