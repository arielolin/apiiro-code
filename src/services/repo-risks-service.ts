import { Risk, riskLevels, riskCategories, isAPIRisk } from "../types/risk";
import { createApiiroRestApiClient } from "./apiiro-rest-api-provider";
import * as vscode from "vscode";
import NodeCache from "node-cache";
import axios from "axios";
import * as path from "path";

const RISK_API_BASE_URL = `/rest-api/v1` as const;
const MIN_CONCURRENT_REQUESTS = 3 as const;
const MAX_CONCURRENT_REQUESTS = 5 as const;
const PAGE_SIZE = 100 as const;

const cache = new NodeCache({ stdTTL: 600 });

type AxiosInstance = axios.AxiosInstance;

export class RiskService {
  private static instance: RiskService;
  private apiClient: ReturnType<typeof createApiiroRestApiClient>;

  private constructor() {
    this.apiClient = createApiiroRestApiClient(RISK_API_BASE_URL);
  }

  static getInstance(): RiskService {
    if (!RiskService.instance) {
      RiskService.instance = new RiskService();
    }
    return RiskService.instance;
  }

  private async fetchRisksPage(
    axiosInstance: AxiosInstance,
    riskCategory: string,
    params: Record<string, string[]>,
    paramsSerializer: (params: Record<string, string[]>) => string,
    skip: number,
  ): Promise<{ risks: Risk[]; totalItemCount: number }> {
    const endpoint =
      riskCategory === "Api"
        ? `/risks`
        : `/risks/${riskCategory.toLowerCase()}`;

    const requestParams = {
      ...params,
      ...(riskCategory !== "Api" && {
        "filters[RiskCategory]": [riskCategory],
      }),
      "filters[RiskLevel][0]": [riskLevels.Critical],
      "filters[RiskLevel][1]": [riskLevels.High],
      "filters[RiskLevel][2]": [riskLevels.Medium],
      "filters[RiskLevel][3]": [riskLevels.Low],
      skip: [skip.toString()],
    };

    const response = await axiosInstance.get(endpoint, {
      params: requestParams,
      paramsSerializer,
    });

    let risks = response.data.items || [];
    const originalTotalCount = response.data.paging.totalItemCount;

    if (riskCategory === "Api") {
      risks = risks.filter(
        (risk: Risk) =>
          risk.riskCategory === "Entry Point Changes" ||
          risk.riskCategory === "Sensitive Data",
      );
    }

    return {
      risks,
      totalItemCount: originalTotalCount, // Keep original count for pagination!
    };
  }

  private async fetchAllRisks(
    axiosInstance: AxiosInstance,
    riskCategory: string,
    params: Record<string, string[]>,
    paramsSerializer: (params: Record<string, string[]>) => string,
  ): Promise<Risk[]> {
    const initialPage = await this.fetchRisksPage(
      axiosInstance,
      riskCategory,
      params,
      paramsSerializer,
      0,
    );

    let allRisks = initialPage.risks;
    const totalItemCount = initialPage.totalItemCount;

    if (totalItemCount <= PAGE_SIZE) {
      return allRisks;
    }

    // Fix pagination calculation to include the last page
    const remainingPages = Math.ceil(totalItemCount / PAGE_SIZE);
    const concurrentRequests = Math.min(
      MAX_CONCURRENT_REQUESTS,
      Math.max(MIN_CONCURRENT_REQUESTS, Math.floor(remainingPages / 2)),
    );

    // Start from page 1 since we already have page 0
    for (let i = 1; i < remainingPages; i += concurrentRequests) {
      const pagePromises = [];
      for (let j = 0; j < concurrentRequests && i + j < remainingPages; j++) {
        const skip = (i + j) * PAGE_SIZE;

        pagePromises.push(
          this.fetchRisksPage(
            axiosInstance,
            riskCategory,
            params,
            paramsSerializer,
            skip,
          ),
        );
      }

      const pages = await Promise.all(pagePromises);
      const newRisks = pages.flatMap((page) => page.risks);
      allRisks = allRisks.concat(newRisks);
    }

    return allRisks;
  }

  async getRisksForRepo(
    repoId: string,
  ): Promise<{ risks: Risk[]; totalCount: number }> {
    const cacheKey = `repo_risks_${repoId}`;
    const cachedRisks = cache.get<{ risks: Risk[]; totalCount: number }>(
      cacheKey,
    );

    if (cachedRisks) {
      return cachedRisks;
    }

    try {
      const params = {
        "filters[RepositoryID]": [repoId],
        pageSize: [PAGE_SIZE.toString()],
      };

      const paramsSerializer = (params: Record<string, string[]>) => {
        return Object.entries(params)
          .flatMap(([key, values]) =>
            values.map((value) => `${key}=${encodeURIComponent(value)}`),
          )
          .join("&");
      };

      const [ossRisks, secretsRisks, apiRisks, sastRisks] = await Promise.all([
        this.fetchAllRisks(this.apiClient!, "OSS", params, paramsSerializer),
        this.fetchAllRisks(
          this.apiClient!,
          "Secrets",
          params,
          paramsSerializer,
        ),
        this.fetchAllRisks(this.apiClient!, "Api", params, paramsSerializer),
        this.fetchAllRisks(this.apiClient!, "SAST", params, paramsSerializer),
      ]);

      const allRisks = [
        ...ossRisks,
        ...secretsRisks,
        ...apiRisks,
        ...sastRisks,
      ];

      const normalizedRisks = allRisks.map((risk) => ({
        ...risk,
        sourceCode: risk.sourceCode
          ? {
              ...risk.sourceCode,
              filePath: this.normalizeFilePath(risk.sourceCode.filePath),
            }
          : risk.sourceCode,
      }));

      const result = {
        risks: normalizedRisks,
        totalCount: normalizedRisks.length,
      };

      cache.set(cacheKey, result);
      return result;
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Error retrieving risks: ${error.message}`,
      );
      return { risks: [], totalCount: 0 };
    }
  }

  private normalizeFilePath(filePath: string): string {
    if (!filePath) return filePath;

    const normalizedPath = filePath.replace(/\\/g, "/");

    if (
      path.isAbsolute(normalizedPath) &&
      vscode.workspace.workspaceFolders?.length
    ) {
      const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const relativePath = path.relative(workspacePath, normalizedPath);
      return relativePath.replace(/\\/g, "/");
    }

    return normalizedPath.replace(/^\/+/, "");
  }
}

export const riskService = RiskService.getInstance();
