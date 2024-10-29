import * as vscode from "vscode";

import { Risk } from "../../types/risk";
import { OSSRiskRemediation } from "./remediate-oss";
import { Repository } from "../../types/repository";

export interface RiskRemediation {
  remediate(
    editor: vscode.TextEditor,
    risk: Risk,
    repoData: Repository | undefined,
  ): Promise<void>;
}

class RiskRemediationFactory {
  static createRemediation(
    riskCategory: string,
    onRiskRemediation: () => void,
  ): RiskRemediation {
    switch (riskCategory) {
      case "OSS Security":
        return new OSSRiskRemediation(onRiskRemediation);
      default:
        throw new Error(`Unsupported risk category: ${riskCategory}`);
    }
  }
}

export async function remediateRisk(
  editor: vscode.TextEditor,
  risk: Risk,
  repoData: Repository | undefined,
  onRiskRemediation: () => void,
): Promise<void> {
  try {
    const remediation = RiskRemediationFactory.createRemediation(
      risk.riskCategory,
      onRiskRemediation,
    );
    await remediation.remediate(editor, risk, repoData);
  } catch (error: any) {
    console.error("Error remediating risk:", error);
    vscode.window.showErrorMessage(`Error remediating risk: ${error.message}`);
  }
}

export function hasRemedy(risk: Risk): boolean {
  return (
    risk.sourceCode.filePath.includes("package.json") &&
    !!("remediationSuggestion" in risk && risk.remediationSuggestion)
  );
}
