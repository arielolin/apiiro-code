import vscode, { TreeItemCollapsibleState } from "vscode";
import { Risk, riskLevels } from "../../../types/risk";
import { Repository } from "../../../types/repository";
import { riskService } from "../../../services/repo-risks-service";

export class RisksTreeProvider
  implements vscode.TreeDataProvider<RiskTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    RiskTreeItem | undefined | null | void
  > = new vscode.EventEmitter<RiskTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    RiskTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private risks: Risk[] = [];
  private loading: boolean = false;
  private categories: { [key: string]: Risk[] } = {};
  private initialized: boolean = false;

  constructor(private repoData: Repository) {}

  refresh(): void {
    this.initialized = false;
    this.risks = [];
    this.categories = {};
    this._onDidChangeTreeData.fire();
  }

  async filter() {
    const levels = Object.values(riskLevels);

    const quickPickItems = levels.map((level) => ({
      label: level,
      picked: true,
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: "Select risk levels to show",
      canPickMany: true,
    });

    if (selected) {
      const selectedLevels = selected.map((item) => item.label);

      this.filterRisksByLevel(selectedLevels);
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: RiskTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RiskTreeItem): Promise<RiskTreeItem[]> {
    if (!this.initialized) {
      await this.loadRisks();
      this.initialized = true;
    }

    if (this.loading) {
      return [
        new RiskTreeItem(
          "Loading...",
          "",
          TreeItemCollapsibleState.None,
          "loading",
        ),
      ];
    }

    if (!element) {
      return this.getRootItems();
    }

    return this.getChildItems(element);
  }

  private getRootItems(): RiskTreeItem[] {
    const categories = ["OSS", "Secrets", "SAST", "Api"];

    const categoryStatus = categories.map((category) => {
      let count = 0;
      if (category === "Api") {
        count =
          (this.categories["Entry Point Changes"]?.length || 0) +
          (this.categories["Sensitive Data"]?.length || 0);
      } else {
        const displayCategory = this.getDisplayCategory(category);
        count = this.categories[displayCategory]?.length || 0;
      }
      return { category, count };
    });

    const rootItems = categories
      .filter((category) => {
        if (category === "Api") {
          const apiCount =
            (this.categories["Entry Point Changes"]?.length || 0) +
            (this.categories["Sensitive Data"]?.length || 0);

          return apiCount > 0;
        }

        const displayCategory = this.getDisplayCategory(category);
        const count = this.categories[displayCategory]?.length || 0;

        return count > 0;
      })
      .map((category) => {
        let count = 0;
        if (category === "Api") {
          count =
            (this.categories["Entry Point Changes"]?.length || 0) +
            (this.categories["Sensitive Data"]?.length || 0);
        } else {
          const displayCategory = this.getDisplayCategory(category);
          count = this.categories[displayCategory]?.length || 0;
        }

        return new RiskTreeItem(
          this.getDisplayCategory(category),
          `(${count})`,
          TreeItemCollapsibleState.Collapsed,
          "category",
        );
      });

    return rootItems;
  }

  private getChildItems(element: RiskTreeItem): RiskTreeItem[] {
    if (element.contextValue !== "category") {
      return [];
    }

    if (element.label === "Api") {
      const apiRisks = [
        ...(this.categories["Entry Point Changes"] || []),
        ...(this.categories["Sensitive Data"] || []),
      ];

      return apiRisks.map((risk) => this.createRiskTreeItem(risk));
    }

    const categoryRisks = this.categories[element.label] || [];

    return categoryRisks.map((risk) => this.createRiskTreeItem(risk));
  }

  private async loadRisks() {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this._onDidChangeTreeData.fire();

    try {
      const { risks } = await riskService.getRisksForRepo(this.repoData.key);

      this.risks = risks;
      this.categorizeRisks();
    } catch (error: any) {
      const errorMessage = `Error loading risks: ${error.message}`;

      vscode.window.showErrorMessage(errorMessage);
      this.risks = [];
    } finally {
      this.loading = false;
      this._onDidChangeTreeData.fire();
    }
  }

  private categorizeRisks() {
    this.categories = {
      "OSS Security": [],
      Secrets: [],
      "SAST Findings": [],
      "Entry Point Changes": [],
      "Sensitive Data": [],
    };

    const categoryDistribution = new Map<string, number>();

    for (const risk of this.risks) {
      categoryDistribution.set(
        risk.riskCategory,
        (categoryDistribution.get(risk.riskCategory) || 0) + 1,
      );

      if (this.categories[risk.riskCategory]) {
        this.categories[risk.riskCategory].push(risk);
      }
    }
  }

  private getDisplayCategory(category: string): string {
    switch (category) {
      case "OSS":
        return "OSS Security";
      case "SAST":
        return "SAST Findings";
      case "Api":
        return "Api";
      default:
        return category;
    }
  }

  private filterRisksByLevel(levels: string[]) {
    this.risks = this.risks.filter((risk) => levels.includes(risk.riskLevel));

    this.categorizeRisks();
  }

  private createRiskTreeItem(risk: Risk): RiskTreeItem {
    const label = risk.ruleName;
    const description = `${risk.riskLevel} - ${risk.riskStatus}`;
    const treeItem = new RiskTreeItem(
      label,
      description,
      TreeItemCollapsibleState.None,
      "risk",
    );

    let iconName = "info";
    switch (risk.riskLevel) {
      case riskLevels.Critical:
        iconName = "error";
        break;
      case riskLevels.High:
      case riskLevels.Medium:
        iconName = "warning";
        break;
      case riskLevels.Low:
        iconName = "info";
        break;
    }
    treeItem.iconPath = new vscode.ThemeIcon(iconName);

    if (risk.sourceCode?.filePath) {
      treeItem.command = {
        command: "risks.openFile",
        title: "Open File",
        arguments: [risk.sourceCode.filePath, risk.sourceCode.lineNumber],
      };
      treeItem.tooltip = `${risk.sourceCode.filePath}:${risk.sourceCode.lineNumber}`;
    }

    return treeItem;
  }
}

class RiskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly contextValue: string,
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.contextValue = contextValue;
  }
}
