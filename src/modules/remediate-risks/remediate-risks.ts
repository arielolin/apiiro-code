import * as vscode from "vscode";
import { detectLineChanges } from "../../utils/git";
import { OSSRisk, Risk } from "../../types/risk";
import { OSSRiskRemediator } from "./remediate-oss";
import { Repository } from "../../types/repository";

export interface RiskRemediator {
  remediate(
    editor: vscode.TextEditor,
    risk: Risk,
    repoData: Repository | undefined,
  ): Promise<void>;
}

class RiskRemediationFactory {
  static createRemediator(riskCategory: string): RiskRemediator {
    switch (riskCategory) {
      case "OSS Security":
        return new OSSRiskRemediator();
      default:
        throw new Error(`Unsupported risk category: ${riskCategory}`);
    }
  }
}

export async function remediateRisk(
  editor: vscode.TextEditor,
  risk: Risk,
  repoData: Repository | undefined,
): Promise<void> {
  try {
    const remediator = RiskRemediationFactory.createRemediator(
      risk.riskCategory,
    );
    await remediator.remediate(editor, risk, repoData);
  } catch (error: any) {
    console.error("Error remediating risk:", error);
    vscode.window.showErrorMessage(`Error remediating risk: ${error.message}`);
  }
}

export function hasRemedy(risk: Risk): boolean {
  return !!("remediationSuggestion" in risk && risk.remediationSuggestion);
}
