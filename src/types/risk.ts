export interface Risk {
  remediationSuggestion: { nearestFixVersion: string };
  id: string;
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
  actionsTaken: any[]; // You might want to define a more specific type for actionsTaken
  findingCategory: string;
  findingName: string | null;
}
