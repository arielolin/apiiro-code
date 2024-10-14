import axios from "axios";
import vscode from "vscode";
import { Risk } from "./types/risk";
import NodeCache from "node-cache";
import { Repository } from "./types/repository";
import { decodeJwt } from "./utils/string";
import { URL } from "url";

const REPO_API_BASE_URL = `${getEnvironmentData().AppUrl}/rest-api/v2`;
const RISK_API_BASE_URL = `${getEnvironmentData().AppUrl}/rest-api/v1`;
const MAX_CONCURRENT_REQUESTS = 50;
const MAX_PAGE_SIZE = 1000; // Increase page size to reduce number of requests

const cache = new NodeCache({ stdTTL: 600 }); //5 minutes cache

type AxiosInstance = axios.AxiosInstance;

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
async function fetchRisksPage(
  axiosInstance: AxiosInstance,
  riskCategory: string,
  params: Record<string, any>,
  paramsSerializer: (params: Record<string, string>) => string,
  skip: number,
): Promise<{ risks: Risk[]; totalItemCount: number }> {
  const response = await axiosInstance.get(
    `/risks/${riskCategory.toLowerCase()}`,
    {
      params: {
        ...params,
        "filters[RiskCategory]": riskCategory,
        skip,
      },
      paramsSerializer,
    },
  );

  return {
    risks: response.data.items || [],
    totalItemCount: response.data.paging.totalItemCount,
  };
}

async function fetchAllRisks(
  axiosInstance: AxiosInstance,
  riskCategory: string,
  params: Record<string, any>,
  paramsSerializer: (params: Record<string, string>) => string,
): Promise<Risk[]> {
  let allRisks: Risk[] = [];
  let skip = 0;
  let emptyPageCount = 0;
  let totalItemCount = Infinity;

  const fetchPage = async (pageSkip: number) => {
    const page = await fetchRisksPage(
      axiosInstance,
      riskCategory,
      params,
      paramsSerializer,
      pageSkip,
    );
    if (page.risks.length === 0) emptyPageCount++;
    else emptyPageCount = 0;
    totalItemCount = page.totalItemCount;
    return page.risks;
  };

  while (skip < totalItemCount && emptyPageCount < 1) {
    const pagePromises = [];
    for (
      let i = 0;
      i < MAX_CONCURRENT_REQUESTS &&
      skip + i * params.pageSize < totalItemCount;
      i++
    ) {
      pagePromises.push(fetchPage(skip + i * params.pageSize));
    }
    const pages = await Promise.all(pagePromises);
    allRisks = allRisks.concat(pages.flat());
    skip += MAX_CONCURRENT_REQUESTS * params.pageSize;
  }

  return allRisks;
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
      pageSize: MAX_PAGE_SIZE,
    };

    const paramsSerializer = (params: Record<string, string>) => {
      return Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("&");
    };

    const [ossRisks, secretsRisks] = await Promise.all([
      fetchAllRisks(axiosInstance, "OSS", params, paramsSerializer),
      fetchAllRisks(axiosInstance, "Secrets", params, paramsSerializer),
    ]);

    const allRisks = [...ossRisks, ...secretsRisks];

    cache.set(cacheKey, allRisks);
    return allRisks;
  } catch (error: any) {
    console.error("API Error:", error.response?.data || error.message);
    vscode.window.showErrorMessage(`Error retrieving risks: ${error.message}`);
    return [];
  }
}
