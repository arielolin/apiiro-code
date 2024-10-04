import axios from "axios";
import vscode from "vscode";
import { Risk } from "./types/risk";
import NodeCache from "node-cache";

const API_BASE_URL = "https://app-staging.apiiro.com/rest-api/v1";
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

function createAxiosInstance() {
  const token = getApiToken();
  if (!token) {
    return null;
  }
  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function findRisks(relativeFilePath: string): Promise<Risk[]> {
  const cacheKey = `risks_${relativeFilePath}`;
  const cachedRisks = cache.get<Risk[]>(cacheKey);
  if (cachedRisks) {
    vscode.window.showInformationMessage("Retrieved risks from cache");
    return cachedRisks;
  }

  const axiosInstance = createAxiosInstance();
  if (!axiosInstance) {
    return [];
  }

  try {
    vscode.window.showInformationMessage(
      "Searching for risks: " + relativeFilePath,
    );
    const params = {
      "filters[CodeReference]": relativeFilePath,
    };
    const paramsSerializer = (params: Record<string, string>) => {
      return Object.entries(params)
        .map(
          ([key, value]) => `${key}=${encodeURIComponent(value)}`,
        )
        .join("&");
    };

    const [ossResponse, secretsResponse] = await Promise.all([
      axiosInstance.get("/risks/oss", {
        params: { ...params, "filters[riskCategory]": "OSS" },
        paramsSerializer,
      }),
      axiosInstance.get("/risks/secrets", {
        params: { ...params, "filters[riskCategory]": "Secrets" },
        paramsSerializer,
      }),
    ]);

    const response = {
      data: {
        items: [...(ossResponse.data.items || []), ...(secretsResponse.data.items || [])],
      },
    };

    const ossCount = ossResponse.data.items?.length || 0;
    const secretsCount = secretsResponse.data.items?.length || 0;
    vscode.window.showInformationMessage(
      `Retrieved ${ossCount} OSS risks and ${secretsCount} Secrets risks`
    );

    if (response.data && response.data.items) {
      vscode.window.showInformationMessage(
        `Retrieved ${response.data.items.length} risks`,
      );
      cache.set(cacheKey, response.data.items);
      return response.data.items;
    } else {
      console.error("Unexpected response structure:", response.data);
      vscode.window.showErrorMessage("Unexpected response structure from API");
      return [];
    }
  } catch (error: any) {
    console.error("API Error:", error.response?.data || error.message); // Debug log
    vscode.window.showErrorMessage("Error retrieving risks: " + error.message);
    return [];
  }
}
