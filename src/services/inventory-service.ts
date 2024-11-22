// src/services/inventoryService.ts

import axios, { AxiosInstance } from "axios";
import * as vscode from "vscode";
import { get } from "lodash";
import {
  ApiItem,
  CategorizedInventory,
  DependencyItem,
  SecurityControlItem,
  SensitiveDataItem,
  SourceLocation,
} from "../types/inventory";
import { createApiiroRestApiClient } from "./apiiro-rest-api-provider";

export class InventoryService {
  private apiClient: AxiosInstance;
  private static instance: InventoryService;

  private constructor() {
    const token = vscode.workspace.getConfiguration("apiiroCode").get("token");
    this.apiClient = createApiiroRestApiClient("");
  }

  public static getInstance(): InventoryService {
    if (!InventoryService.instance) {
      InventoryService.instance = new InventoryService();
    }
    return InventoryService.instance;
  }

  async getInventoryData(repoKey: string): Promise<CategorizedInventory> {
    try {
      const response = await this.apiClient.get("/rest-api/v1/inventory", {
        params: {
          "filters[RepositoryID]": repoKey,
          pageSize: 1000,
        },
      });

      return this.categorizeInventoryItems(response.data.items);
    } catch (error) {
      throw new Error(`${error}`);
    }
  }

  private categorizeInventoryItems(items: any[]): CategorizedInventory {
    const categorized: CategorizedInventory = {
      dependencies: {
        direct: [],
        sub: [],
        total: 0,
      },
      apis: {
        items: [],
        total: 0,
        byHttpMethod: new Map(),
      },
      sensitiveData: {
        items: [],
        total: 0,
        byType: new Map(),
      },
      security: {
        items: [],
        total: 0,
      },
    };

    items.forEach((item) => {
      // Process Dependencies
      if (item.dependency) {
        if (item.dependencyType === "Direct") {
          categorized.dependencies.direct.push(this.transformDependency(item));
        } else {
          categorized.dependencies.sub.push(this.transformDependency(item));
        }
        categorized.dependencies.total++;
      }

      // Process APIs
      else if (item.apiMethodName) {
        const apiItem = this.transformApi(item);
        categorized.apis.items.push(apiItem);
        categorized.apis.total++;

        const httpMethod = item.httpMethod || "UNKNOWN";
        const currentCount = categorized.apis.byHttpMethod.get(httpMethod) || 0;
        categorized.apis.byHttpMethod.set(httpMethod, currentCount + 1);
      }

      // Process Sensitive Data
      else if (item.sensitiveDataTypes) {
        const sensitiveItem = this.transformSensitiveData(item);
        categorized.sensitiveData.items.push(sensitiveItem);
        categorized.sensitiveData.total++;

        item.sensitiveDataTypes.forEach((type: string) => {
          const currentCount = categorized.sensitiveData.byType.get(type) || 0;
          categorized.sensitiveData.byType.set(type, currentCount + 1);
        });
      }

      // Process Security Controls
      if (item.apiSecurityControls) {
        const securityItem = this.transformSecurityControl(item);
        categorized.security.items.push(securityItem);
        categorized.security.total++;
      }
    });

    return categorized;
  }

  private transformDependency(item: any): DependencyItem {
    return {
      name: item.dependency,
      version: item.version,
      type: item.dependencyType,
      scope: item.scope,
      licenses: item.licenses,
      insights: item.insights,
      sourceLocation: this.extractSourceLocation(item),
      riskLevel: get(item, "entity.details.riskLevel", "Unknown"),
    };
  }

  private transformApi(item: any): ApiItem {
    return {
      name: item.apiMethodName,
      endpoint: item.endpoint,
      httpMethod: item.httpMethod,
      securityControls: item.apiSecurityControls,
      isPublic: item.hasPublicRole,
      sourceLocation: this.extractSourceLocation(item),
      methodSignature: item.methodSignature,
    };
  }

  private transformSensitiveData(item: any): SensitiveDataItem {
    return {
      fieldName: item.fieldName,
      className: item.className,
      types: item.sensitiveDataTypes,
      isExposed: item.exposedByApi,
      writtenToLogs: item.writtenToLogs,
      sourceLocation: this.extractSourceLocation(item),
    };
  }

  private transformSecurityControl(item: any): SecurityControlItem {
    return {
      type: item.apiSecurityControls?.join(", ") || "",
      endpoint: item.endpoint,
      httpMethod: item.httpMethod,
      sourceLocation: this.extractSourceLocation(item),
    };
  }

  private extractSourceLocation(item: any): SourceLocation {
    return {
      filePath: get(item, "sourceCode.filePath", ""),
      lineNumber: get(item, "sourceCode.lineNumber", 0),
      url: get(item, "sourceCode.url", ""),
    };
  }
}

export const inventoryService = InventoryService.getInstance();
