import axios from "axios";
import vscode from "vscode";
import { Risk } from "./types/risk";
import NodeCache from "node-cache";
import { Repository } from "./types/repository";
import { decodeJwt } from "./utils/string";
import { URL } from "url";

const REPO_API_BASE_URL = `${getEnvironmentData().AppUrl}/rest-api/v2`;
const RISK_API_BASE_URL = `${getEnvironmentData().AppUrl}/rest-api/v1`;
const cache = new NodeCache({ stdTTL: 300 }); //5 minutes cache

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

export function getEnvironmentData() {
  const token = getApiToken() as string;
  return decodeJwt(token);
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

function extractHostname(url: string): string {
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

export async function getMonitoredRepositoriesByName(
  repoName: string,
  remoteUrl: string,
): Promise<Repository[]> {
  const axiosInstance = createAxiosInstance(REPO_API_BASE_URL);
  if (!axiosInstance) {
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

    const response = await axiosInstance.get("/repositories", {
      params,
      paramsSerializer,
    });

    if (
      response.data &&
      response.data.items &&
      response.data.items.length > 0
    ) {
      const remoteUrlHostname = extractHostname(remoteUrl);

      const filteredRepos = response.data.items.filter((repo: Repository) => {
        const repoUrlHostname = extractHostname(repo.serverUrl);
        return repo.name === repoName && repoUrlHostname === remoteUrlHostname;
      });

      if (filteredRepos.length > 0) {
        vscode.window.showInformationMessage(
          `Found ${filteredRepos.length} matching repositories.`,
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

export async function findRisks(
  relativeFilePath: string,
  repoData: Repository,
): Promise<Risk[]> {
  const cacheKey = `risks_${relativeFilePath}`;
  const cachedRisks = cache.get<Risk[]>(cacheKey);
  if (cachedRisks) {
    return cachedRisks;
  }

  const axiosInstance = createAxiosInstance(RISK_API_BASE_URL);
  if (!axiosInstance) {
    return [];
  }

  try {
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

    const ossRisks = ossResponse.data.items || [];
    const secretsRisks = secretsResponse.data.items || [];
    const allRisks = [...ossRisks, ...secretsRisks];

    cache.set(cacheKey, allRisks);
    return allRisks;
  } catch (error: any) {
    console.error("API Error:", error.response?.data || error.message);
    vscode.window.showErrorMessage(`Error retrieving risks: ${error.message}`);
    return [];
  }
}
