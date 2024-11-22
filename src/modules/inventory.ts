import * as vscode from "vscode";
import { inventoryService } from "../services/inventory-service";
import {
  ApiItem,
  CategorizedInventory,
  DependencyItem,
  SensitiveDataItem,
} from "../types/inventory";
import { TreeItemCollapsibleState } from "vscode";

export class InventoryTreeProvider
  implements vscode.TreeDataProvider<InventoryTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    InventoryTreeItem | undefined | null | void
  > = new vscode.EventEmitter<InventoryTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    InventoryTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private data: CategorizedInventory | undefined;

  constructor(private repoKey: string) {}

  refresh(): void {
    this.data = undefined;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: InventoryTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: InventoryTreeItem): Promise<InventoryTreeItem[]> {
    if (!this.data) {
      try {
        this.data = await inventoryService.getInventoryData(this.repoKey);
      } catch (error) {
        vscode.window.showErrorMessage(`${error}`);
        return [];
      }
    }

    if (!element) {
      // Root level - categories
      return [
        new InventoryTreeItem(
          "Dependencies",
          `(${this.data.dependencies.total})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          "category",
        ),
        new InventoryTreeItem(
          "APIs",
          `(${this.data.apis.total})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          "category",
        ),
        new InventoryTreeItem(
          "Sensitive Data",
          `(${this.data.sensitiveData.total})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          "category",
        ),
        new InventoryTreeItem(
          "Security Controls",
          `(${this.data.security.total})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          "category",
        ),
      ];
    }

    // Handle subcategories based on parent item
    switch (element.label) {
      case "Dependencies":
        return this.getDependencyItems();
      case "APIs":
        return this.getApiItems();
      case "Sensitive Data":
        return this.getSensitiveDataItems();
      case "Security Controls":
        return this.getSecurityItems();
      default:
        return [];
    }
  }

  private getDependencyItems(): InventoryTreeItem[] {
    if (!this.data) return [];

    const directItems = this.data.dependencies.direct.map((dep) =>
      this.createDependencyTreeItem(dep, "Direct"),
    );
    const subItems = this.data.dependencies.sub.map((dep) =>
      this.createDependencyTreeItem(dep, "Transitive"),
    );

    return [...directItems, ...subItems];
  }

  private getApiItems(): InventoryTreeItem[] {
    if (!this.data) return [];

    return this.data.apis.items.map((api) => this.createApiTreeItem(api));
  }

  private getSensitiveDataItems(): InventoryTreeItem[] {
    if (!this.data) return [];

    return this.data.sensitiveData.items.map((item) =>
      this.createSensitiveDataTreeItem(item),
    );
  }

  private getSecurityItems(): InventoryTreeItem[] {
    if (!this.data) return [];

    return this.data.security.items.map((item) => {
      const treeItem = new InventoryTreeItem(
        item.type,
        `${item.httpMethod} ${item.endpoint}`,
        vscode.TreeItemCollapsibleState.None,
        "item",
      );

      if (item.sourceLocation.filePath) {
        treeItem.command = {
          command: "inventory.openFile",
          title: "Open File",
          arguments: [
            item.sourceLocation.filePath,
            item.sourceLocation.lineNumber,
          ],
        };
        treeItem.tooltip = `${item.sourceLocation.filePath}:${item.sourceLocation.lineNumber}`;
      }

      return treeItem;
    });
  }

  private createDependencyTreeItem(
    dep: DependencyItem,
    type: string,
  ): InventoryTreeItem {
    const treeItem = new InventoryTreeItem(
      dep.name,
      `${dep.version} (${type})`,
      vscode.TreeItemCollapsibleState.None,
      "item",
    );

    if (dep.sourceLocation.filePath) {
      treeItem.command = {
        command: "inventory.openFile",
        title: "Open File",
        arguments: [dep.sourceLocation.filePath, dep.sourceLocation.lineNumber],
      };
      treeItem.tooltip = `${dep.sourceLocation.filePath}:${dep.sourceLocation.lineNumber}`;
    }

    // Add icon based on risk level
    if (dep.riskLevel.toLowerCase() === "critical") {
      treeItem.iconPath = new vscode.ThemeIcon("error");
    } else if (dep.riskLevel.toLowerCase() === "high") {
      treeItem.iconPath = new vscode.ThemeIcon("warning");
    }

    return treeItem;
  }

  private createApiTreeItem(api: ApiItem): InventoryTreeItem {
    const treeItem = new InventoryTreeItem(
      api.name,
      `${api.httpMethod} ${api.endpoint}`,
      vscode.TreeItemCollapsibleState.None,
      "item",
    );

    if (api.sourceLocation.filePath) {
      treeItem.command = {
        command: "inventory.openFile",
        title: "Open File",
        arguments: [api.sourceLocation.filePath, api.sourceLocation.lineNumber],
      };
      treeItem.tooltip = `${api.sourceLocation.filePath}:${api.sourceLocation.lineNumber}`;
    }

    // Add icon for public APIs
    if (api.isPublic) {
      treeItem.iconPath = new vscode.ThemeIcon("globe");
    }

    return treeItem;
  }

  private createSensitiveDataTreeItem(
    item: SensitiveDataItem,
  ): InventoryTreeItem {
    const treeItem = new InventoryTreeItem(
      item.fieldName,
      `${item.className} (${item.types.join(", ")})`,
      vscode.TreeItemCollapsibleState.None,
      "item",
    );

    if (item.sourceLocation.filePath) {
      treeItem.command = {
        command: "inventory.openFile",
        title: "Open File",
        arguments: [
          item.sourceLocation.filePath,
          item.sourceLocation.lineNumber,
        ],
      };
      treeItem.tooltip = `${item.sourceLocation.filePath}:${item.sourceLocation.lineNumber}`;
    }

    // Add icon for exposed sensitive data
    if (item.isExposed) {
      treeItem.iconPath = new vscode.ThemeIcon("shield");
    }

    return treeItem;
  }
}

class InventoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly itemType: "category" | "item",
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.contextValue = itemType;
  }
}
