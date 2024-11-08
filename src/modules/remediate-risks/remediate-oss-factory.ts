// remediate-oss-factory.ts
import * as vscode from "vscode";
import * as path from "path";
import { Risk } from "../../types/risk";
import { RiskRemediation } from "./remediate-risks";
import { Repository } from "../../types/repository";
import { addSuggestionLine } from "./suggestion-helper";

interface DependencyRemediation extends RiskRemediation {
  canHandle(filename: string): boolean;
}

export class DependencyRemediationFactory {
  private remediators: DependencyRemediation[] = [];

  constructor(onRiskRemediation: () => void) {
    this.remediators = [
      new PackageJsonRemediation(onRiskRemediation),
      new RequirementsTxtRemediation(onRiskRemediation),
      new PomXmlRemediation(onRiskRemediation),
    ];
  }

  getRemediator(filename: string): DependencyRemediation | undefined {
    const normalizedFilename = path.basename(filename).toLowerCase();
    return this.remediators.find((r) => r.canHandle(normalizedFilename));
  }
}

abstract class BaseRemediation implements DependencyRemediation {
  protected onRiskRemediation: () => void;

  constructor(onRiskRemediation: () => void) {
    this.onRiskRemediation = onRiskRemediation;
  }

  abstract canHandle(filename: string): boolean;

  protected abstract validateDependency(
    originalText: string,
    depKey: string,
    document: vscode.TextDocument,
    lineNumber: number,
  ): Promise<boolean>;

  protected abstract createUpdatedLineText(
    originalText: string,
    depKey: string,
    fixVersion: string,
    document: vscode.TextDocument,
    lineNumber: number,
  ): Promise<string>;

  async remediate(
    editor: vscode.TextEditor,
    risk: Risk,
    repoData: Repository | undefined,
  ): Promise<void> {
    try {
      if (!editor) {
        throw new Error("No active text editor");
      }

      const document = editor.document;
      const componentName = risk.component;
      const depKey = risk.component.split(":")[0];
      let fixVersion = risk.remediationSuggestion?.nearestFixVersion;

      if (!fixVersion) {
        vscode.window.showInformationMessage(
          "No fix version found for the specified dependency",
        );
        return;
      }

      const lineNumber = risk.sourceCode.lineNumber;
      const line = document.lineAt(lineNumber - 1);
      const originalText = line.text;

      const isValid = await this.validateDependency(
        originalText,
        depKey,
        document,
        lineNumber - 1,
      );

      if (!isValid) {
        vscode.window.showInformationMessage(
          `${depKey} was not found in the specified location or is in an invalid format`,
        );
        return;
      }

      const updatedLineText = await this.createUpdatedLineText(
        originalText,
        depKey,
        fixVersion,
        document,
        lineNumber - 1,
      );

      await addSuggestionLine(
        editor,
        lineNumber,
        originalText,
        updatedLineText,
        this.onRiskRemediation,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`Failed to remediate: ${message}`);
      throw error;
    }
  }
}

class PackageJsonRemediation extends BaseRemediation {
  canHandle(filename: string): boolean {
    return filename === "package.json";
  }

  async validateDependency(
    originalText: string,
    depKey: string,
    document: vscode.TextDocument,
    lineNumber: number,
  ): Promise<boolean> {
    const trimmedLine = originalText.trim();
    const previousText = document.getText(
      new vscode.Range(0, 0, lineNumber, 0),
    );
    const inDependencyBlock = /["'](?:dev)?dependencies["']\s*:\s*{/.test(
      previousText,
    );

    return (
      inDependencyBlock &&
      new RegExp(`"${depKey}"\\s*:\\s*["'].*?["']`).test(trimmedLine)
    );
  }

  async createUpdatedLineText(
    originalText: string,
    depKey: string,
    fixVersion: string,
  ): Promise<string> {
    const regex = new RegExp(`("${depKey}"\\s*:\\s*)["'].*?["']`);
    return originalText.replace(regex, `$1"${fixVersion}"`);
  }
}

class RequirementsTxtRemediation extends BaseRemediation {
  canHandle(filename: string): boolean {
    return filename === "requirements.txt";
  }

  async validateDependency(
    originalText: string,
    depKey: string,
    document: vscode.TextDocument,
    lineNumber: number,
  ): Promise<boolean> {
    const line = originalText.trim();
    if (line.startsWith("#")) return false;

    const packagePattern = new RegExp(
      `^${depKey}(?:\\[.*?\\])?(?:==|>=|<=|~=|!=|>|<).+$`,
    );
    return packagePattern.test(line);
  }

  async createUpdatedLineText(
    originalText: string,
    depKey: string,
    fixVersion: string,
  ): Promise<string> {
    const extrasMatch = originalText.match(/^[^[\s]+(\[.*?\])?/);
    const packageWithExtras = extrasMatch ? extrasMatch[0] : depKey;
    const indentation = originalText.match(/^\s*/)?.[0] || "";
    const versionOperator = originalText.match(/[~<>=]+=/)?.[0] || "==";
    return `${indentation}${packageWithExtras}${versionOperator}${fixVersion}`;
  }
}

class PomXmlRemediation extends BaseRemediation {
  canHandle(filename: string): boolean {
    return filename === "pom.xml";
  }

  private async findDependencyContext(
    document: vscode.TextDocument,
    lineNumber: number,
    groupId: string,
    artifactId: string,
  ): Promise<{ startLine: number; endLine: number } | null> {
    let dependencyStart = -1;
    let dependencyEnd = -1;
    let currentGroupId = "";
    let currentArtifactId = "";
    let inDependency = false;

    const startSearch = Math.max(0, lineNumber - 10);
    const endSearch = Math.min(document.lineCount, lineNumber + 10);

    for (let i = startSearch; i < endSearch; i++) {
      const line = document.lineAt(i).text.trim();

      if (line.includes("<dependency>")) {
        dependencyStart = i;
        inDependency = true;
        currentGroupId = "";
        currentArtifactId = "";
      } else if (line.includes("</dependency>")) {
        dependencyEnd = i;
        if (currentGroupId === groupId && currentArtifactId === artifactId) {
          return { startLine: dependencyStart, endLine: dependencyEnd };
        }
        inDependency = false;
      } else if (inDependency) {
        if (line.includes("<groupId>")) {
          currentGroupId = line.replace(/<\/?groupId>/g, "").trim();
        } else if (line.includes("<artifactId>")) {
          currentArtifactId = line.replace(/<\/?artifactId>/g, "").trim();
        }
      }
    }

    return null;
  }

  async validateDependency(
    originalText: string,
    depKey: string,
    document: vscode.TextDocument,
    lineNumber: number,
  ): Promise<boolean> {
    try {
      const [groupId, artifactId] = depKey.split(":");
      if (!groupId || !artifactId) return false;

      if (originalText.includes("<version>")) {
        const context = await this.findDependencyContext(
          document,
          lineNumber,
          groupId,
          artifactId,
        );
        return context !== null;
      }

      return false;
    } catch {
      return false;
    }
  }

  async createUpdatedLineText(
    originalText: string,
    depKey: string,
    fixVersion: string,
    document: vscode.TextDocument,
    lineNumber: number,
  ): Promise<string> {
    if (originalText.includes("<version>")) {
      const indentation = originalText.match(/^\s*/)?.[0] || "";
      return `${indentation}<version>${fixVersion}</version>`;
    }

    const [groupId, artifactId] = depKey.split(":");
    const context = await this.findDependencyContext(
      document,
      lineNumber,
      groupId,
      artifactId,
    );

    if (context) {
      const indentation = originalText.match(/^\s*/)?.[0] || "";
      return `${indentation}<version>${fixVersion}</version>`;
    }

    throw new Error("Could not locate appropriate position for version update");
  }
}
