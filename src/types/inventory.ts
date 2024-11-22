// Types
export interface SourceLocation {
  filePath: string;
  lineNumber: number;
  url: string;
}

export interface DependencyItem {
  name: string;
  version: string;
  type: string;
  scope: string;
  licenses: Array<{ name: string; url: string | null }>;
  insights: Array<{ name: string; reason: string }>;
  sourceLocation: SourceLocation;
  riskLevel: string;
}

export interface ApiItem {
  name: string;
  endpoint: string;
  httpMethod: string;
  securityControls: string[];
  isPublic: boolean;
  sourceLocation: SourceLocation;
  methodSignature: string;
}

export interface SensitiveDataItem {
  fieldName: string;
  className: string;
  types: string[];
  isExposed: boolean;
  writtenToLogs: boolean;
  sourceLocation: SourceLocation;
}

export interface SecurityControlItem {
  type: string;
  endpoint: string;
  httpMethod: string;
  sourceLocation: SourceLocation;
}

export interface CategorizedInventory {
  dependencies: {
    direct: DependencyItem[];
    sub: DependencyItem[];
    total: number;
  };
  apis: {
    items: ApiItem[];
    total: number;
    byHttpMethod: Map<string, number>;
  };
  sensitiveData: {
    items: SensitiveDataItem[];
    total: number;
    byType: Map<string, number>;
  };
  security: {
    items: SecurityControlItem[];
    total: number;
  };
}
