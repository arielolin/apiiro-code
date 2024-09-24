export interface Risk {
  id: string;
  array: string[];
  documentCreationTime: string; // ISO 8601 date string
  profileCalculationId: null;
  repositoryStatuses: string[];
  cweIdentifiers: any[]; // Empty array in the image
  elementType: string;
  elementKey: string;
  shortSummary: string;
  triggerKey: string;
  riskCalculationId: string[];
  riskLevel: string;
  riskStatus: string;
  ruleRiskLevel: string;
  processTags: string[];
  tags: string[];
  codeOwnershipTarget: string;
  ruleName: string;
  ruleSummary: string;
  riskName: string;
  profileKey: string;
  profileType: string;
  firstDetected: string; // ISO 8601 date string
  sentMessages: null;
  createdIssues: null;
  riskType: string;
  riskCategory: string;
  fingerprint: string;
  businessImpact: string;
  sources: any[]; // Array with one item in the image
  codeReference: {
    systemReference: string;
    relativePath: string;
    lineNumber: number;
    lastLineInFile: number;
  };
  repositoryReference: {
    repositoryKey: string;
    httpCloneUrl: string;
    httpRoute: string;
    methodName: string;
    methodSignature: string;
    className: string;
    moduleName: string;
    serverUrl: string;
    projectId: string;
  };
  discoveredAt: string; // ISO 8601 date string
  simpleRanges: any[]; // Array with 3 items in the image
  dueDate: string; // ISO 8601 date string
  primaryDataModelReference: {
    findingName: null;
    displayName: null;
    alias: null;
    confidence: null;
    staticityMetadata: {
      key: string;
      name: string;
      staticityKey: string;
    };
  };
  actionsTaken: any[]; // Empty array in the image
  artifactKey: null;
  profileKeys: string[];
  riskId: string;
  riskStatusNumeric: number;
  httpRoute: string;
  httpMethod: string;
  language: string;
  vulnerabilityTags: any[]; // Empty array in the image
}
