import axios from "axios";
import vscode from "vscode";
import { Risk } from "./types/risk";
import NodeCache from "node-cache";
import { Repository } from "./types/repository";

const REPO_API_BASE_URL = "https://app-staging.apiiro.com/rest-api/v2";
const RISK_API_BASE_URL = "https://app-staging.apiiro.com/rest-api/v1";
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

function getApiToken(): string | null {
  const config = vscode.workspace.getConfiguration("apiiroCode");
  const token = config.get("token");
  if (!token) {
    vscode.window.showErrorMessage(
      "Please define the Apiiro API token in the settings.",
    );
    return null;
  }
  return token as string;
}

function createAxiosInstance(baseURL: string) {
  const token = getApiToken();
  if (!token) {
    return null;
  }
  return axios.create({
    baseURL,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getRepo(
  repoName: string,
): Promise<Repository | undefined> {
  const axiosInstance = createAxiosInstance(REPO_API_BASE_URL);
  if (!axiosInstance) {
    return;
  }

  try {
    const params = {
      "filters[RepositoryName]": repoName,
      pageSize: 1,
    };

    const paramsSerializer = (params: Record<string, string>) => {
      return Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("&");
    };

    const response = await axiosInstance.get("/repositories", {
      params,
      paramsSerializer,
    });

    if (
      response.data &&
      response.data.items &&
      response.data.items.length > 0
    ) {
      return response.data.items[0];
    } else {
      vscode.window.showWarningMessage(`Repository "${repoName}" not found.`);
      return;
    }
  } catch (error: any) {
    console.error("API Error:", error.response?.data || error.message);
    vscode.window.showErrorMessage(
      `Error retrieving repository: ${error.message}`,
    );
    return;
  }
}

export async function findRisks(
  relativeFilePath: string,
  repoData: Repository,
): Promise<Risk[]> {
  const cacheKey = `risks_${relativeFilePath}`;
  const cachedRisks = cache.get<Risk[]>(cacheKey);
  if (cachedRisks) {
    vscode.window.showInformationMessage(
      `Retrieved ${cachedRisks.length} risks from cache`,
    );
    return cachedRisks;
  }

  const axiosInstance = createAxiosInstance(RISK_API_BASE_URL);
  if (!axiosInstance) {
    return [];
  }

  try {
    vscode.window.showInformationMessage(
      `Searching for key: ${repoData.key} path:${relativeFilePath}`,
    );
    const params = {
      "filters[CodeReference]": relativeFilePath,
      "filters[RepositoryID]": repoData.key,
    };
    const paramsSerializer = (params: Record<string, string>) => {
      return Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("&");
    };

    const [ossResponse, secretsResponse] = await Promise.all([
      axiosInstance.get("/risks/oss", {
        params: {
          ...params,
          "filters[RiskCategory]": "OSS",
        },
        paramsSerializer,
      }),
      axiosInstance.get("/risks/secrets", {
        params: {
          ...params,
          "filters[RiskCategory]": "Secrets",
        },
        paramsSerializer,
      }),
    ]);

    console.log("OSS Response:", ossResponse.data); // Debug log
    console.log("Secrets Response:", secretsResponse.data); // Debug log

    const ossRisks = ossResponse.data.items || [];
    const secretsRisks = secretsResponse.data.items || [];
    const allRisks = [...ossRisks, ...secretsRisks];

    const ossCount = ossRisks.length;
    const secretsCount = secretsRisks.length;
    if (ossCount > 0 || secretsCount > 0) {
      vscode.window.showInformationMessage(
        `Retrieved ${ossCount > 0 ? `${ossCount} OSS risks` : ""}${ossCount > 0 && secretsCount > 0 ? " and " : ""}${secretsCount > 0 ? `${secretsCount} Secrets risks` : ""}`,
      );
    } else {
      vscode.window.showInformationMessage("No risks found.");
    }

    cache.set(cacheKey, allRisks);
    return allRisks;
  } catch (error: any) {
    console.error("API Error:", error.response?.data || error.message);
    vscode.window.showErrorMessage(`Error retrieving risks: ${error.message}`);
    return [];
  }
}
