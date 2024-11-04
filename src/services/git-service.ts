import * as vscode from "vscode";
import { spawn } from "child_process";
import * as diff from "diff";
import * as path from "path";
import NodeCache from "node-cache";
import { Repository } from "../types/repository";
import { URL } from "url";
import { createApiiroRestApiClient } from "../apiiro-rest-api-provider";

const cache = new NodeCache({ stdTTL: 600 }); // 5 minutes cache
const REPO_API_BASE_URL = `/rest-api/v2`;

interface LineChangeInfo {
  originalLineNumber: number;
  hasChanged: boolean;
  hasMoved: boolean;
  newLineNum: number | null;
}

export async function getRepoName(workspacePath: string): Promise<string> {
  try {
    const remoteUrl = await runGitCommand(workspacePath, [
      "config",
      "--get",
      "remote.origin.url",
    ]);

    const match = remoteUrl.match(/\/([^\/]+)\.git$/);
    if (match && match[1]) {
      return match[1];
    } else {
      throw new Error(
        "Apiiro: Unable to extract repository name from remote URL",
      );
    }
  } catch (error) {
    throw error;
  }
}

export async function getRemoteUrl(workspacePath: string): Promise<string> {
  try {
    return await runGitCommand(workspacePath, [
      "config",
      "--get",
      "remote.origin.url",
    ]);
  } catch (error) {
    throw error;
  }
}

export async function detectLineChanges(
  lineNumbers: number[],
  repoData: Repository,
): Promise<LineChangeInfo[]> {
  const baseBranch = repoData.branchName;
  if (!baseBranch) {
    const error = new Error("Apiiro: Repository data is missing or incomplete");

    vscode.window.showErrorMessage(error.message);
    return [];
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    const error = new Error("Apiiro: No active text editor");
    vscode.window.showErrorMessage(error.message);
    return [];
  }

  const document = editor.document;
  const absoluteFilePath = document.uri.fsPath;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    const error = new Error("Apiiro: File is not part of a workspace");
    vscode.window.showErrorMessage(error.message);
    return [];
  }

  try {
    const workspacePath = workspaceFolder.uri.fsPath;
    const relativeFilePath = path.relative(workspacePath, absoluteFilePath);

    // Fetch the latest changes
    const fetchOrigin = cache.get("fetchOrigin");

    if (!fetchOrigin) {
      await runGitCommand(workspacePath, ["fetch", "origin"]);
      cache.set("fetchOrigin", true);
    }

    // Get the content of the file in the base branch
    let baseBranchContent: string;
    try {
      baseBranchContent = await runGitCommand(workspacePath, [
        "show",
        `origin/${baseBranch}:${relativeFilePath}`,
      ]);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error fetching base branch content: ${error instanceof Error ? error.message : String(error)}`,
      );
      baseBranchContent = "";
    }

    // Get the content of the current file from the active editor
    const currentContent = document.getText();

    // Calculate the diff
    const diffResult = diff.structuredPatch(
      "base",
      "current",
      baseBranchContent,
      currentContent,
      "",
      "",
    );

    let results: LineChangeInfo[] = lineNumbers.map((lineNumber) => ({
      originalLineNumber: lineNumber,
      hasChanged: baseBranchContent === "", // If base content is empty, all lines are new
      hasMoved: false,
      newLineNum: lineNumber,
    }));

    if (baseBranchContent !== "") {
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
          if (line.startsWith("-")) {
            // Removed line
            currentOldLine++;
          } else if (line.startsWith("+")) {
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
      while (currentOldLine <= baseBranchContent.split("\n").length) {
        lineMapping.set(currentOldLine, currentNewLine);
        currentOldLine++;
        currentNewLine++;
      }

      // Update results based on the mapping
      results.forEach((result) => {
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
    const errorMessage = `Apiiro: Error detecting line changes: ${error}`;

    vscode.window.showErrorMessage(errorMessage);
    throw error;
  }
}

async function runGitCommand(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Git command failed: ${stderr}`));
      }
    });
  });
}

export async function getMonitoredRepositoriesByName(
  repoName: string,
  remoteUrl: string,
): Promise<Repository[]> {
  const apiiroRestApiClient = createApiiroRestApiClient(REPO_API_BASE_URL);
  if (!apiiroRestApiClient) {
    return [];
  }

  try {
    const params = {
      "filters[RepositoryName]": repoName,
    };

    const paramsSerializer = (params: Record<string, string>) => {
      return Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("&");
    };

    const response = await apiiroRestApiClient.get("/repositories", {
      params,
      paramsSerializer,
    });

    if (
      response.data &&
      response.data.items &&
      response.data.items.length > 0
    ) {
      const remoteUrlHostname = extractGitHostnameFromUrl(remoteUrl);

      const filteredRepos = response.data.items.filter((repo: Repository) => {
        const repoUrlHostname = extractGitHostnameFromUrl(repo.serverUrl);
        return repo.name === repoName && repoUrlHostname === remoteUrlHostname;
      });

      if (filteredRepos.length > 0) {
        vscode.window.showInformationMessage(
          `Connected to repository "${repoName}" at ${remoteUrl}.`,
        );
        return filteredRepos;
      } else {
        vscode.window.showWarningMessage(
          `No repositories found matching name "${repoName}" and URL "${remoteUrl}".`,
        );
        return [];
      }
    } else {
      vscode.window.showWarningMessage(`Repository "${repoName}" not found.`);
      return [];
    }
  } catch (error: any) {
    console.error("API Error:", error.response?.data || error.message);
    vscode.window.showErrorMessage(
      `Error retrieving repository: ${error.message}`,
    );
    return [];
  }
}

function extractGitHostnameFromUrl(url: string): string {
  try {
    // Handle SSH URLs
    if (url.startsWith("git@")) {
      const parts = url.split("@")[1].split(":");
      return parts[0];
    }
    // Handle HTTPS URLs
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch (error) {
    console.error(`Error parsing URL: ${url}`, error);
    return "";
  }
}
