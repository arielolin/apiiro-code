export interface BaseRisk {
  id: string;
  type: string;
  riskLevel: string;
  riskStatus: string;
  ruleName: string;
  riskCategory: string;
  component: string;
  discoveredOn: string;
  insights: any[]; // You might want to define a more specific type for insights
  apiiroRiskUrl: string;
  source: Array<{
    name: string;
    url: string;
  }>;
  entity: {
    details: {
      branchName: string;
      businessImpact: string;
      isArchived: boolean;
      key: string;
      monitoringStatus: {
        ignoredBy: string | null;
        ignoredOn: string | null;
        ignoreReason: string | null;
        status: string;
      };
      name: string;
      privacySettings: string;
      profileUrl: string;
      repositoryGroup: string;
      riskLevel: string;
      serverUrl: string;
      url: string;
    };
    type: string;
  };
  remediationSuggestion?: {
    codeReference: any;
    nearestFixVersion: string;
  };
  applications: Array<{
    apiiroUrl: string;
    businessImpact: string;
    id: string;
    name: string;
  }>;
  applicationGroups: Array<{
    apiiroUrl: string;
    businessImpact: string;
    id: string;
    name: string;
  }>;
  sourceCode: {
    filePath: string;
    lineNumber: number;
    url: string;
  };
  contributors: Array<{
    email: string;
    name: string;
    reason: string;
  }>;
  actionsTaken: unknown;
  findingCategory: string;
  findingName: string | null;
}

export interface OSSRisk extends BaseRisk {
  dependencyName: string;
  dependencyVersion: string;
  vulnerabilities?: Array<{
    exploitMaturity: string;
    cvss: number;
    epss?: {
      percentile: number;
      score: number;
      scoreSeverity: string;
    };
    id: string;
    identifiers: string[];
  }>;
}

export interface SecretsRisk extends BaseRisk {
  secretType: string;
  fileType: string;
  exposure: string;
  validity: string;
  lastValidatedOn?: string;
  previewLines: string[];
}

export type Risk = OSSRisk | SecretsRisk;
