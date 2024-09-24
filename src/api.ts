import vscode from "vscode";
import mongoClient from "./mongo-client";
import { Risk } from "./types/risk";

export async function findRisks(relativeFilePath: string) {
  try {
    vscode.window.showInformationMessage(
      "Searching for risks: " + relativeFilePath,
    );

    const query = {
      "CodeReference.RelativeFilePath": relativeFilePath,
    };

    const risks = (await mongoClient.find("riskTriggers", query)) as Risk[];

    vscode.window.showInformationMessage(`Found ${risks.length} risks`);

    return risks;
  } catch (err: any) {
    vscode.window.showErrorMessage("An error occurred: " + err.message);
    return [];
  }
}
