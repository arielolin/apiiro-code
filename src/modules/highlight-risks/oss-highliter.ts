import { OSSRisk } from "../../types/risk";
import { hasRemedy } from "../remediate-risks/remediate-risks";
import { getSeverityIcon } from "./utils";
import { getEnvironmentData } from "../../api";

export function createOSSMessage(risk: OSSRisk, encodedRisk: string): string {
  const severityEmoji = getSeverityIcon(risk.riskLevel);

  let vulnerabilitiesInfo = "";
  if (risk.vulnerabilities && risk.vulnerabilities.length > 0) {
    vulnerabilitiesInfo = risk.vulnerabilities
      .map(
        (v, index) => `
🔍 Vulnerability ${index + 1}
**ID:** ${v.identifiers.join(", ")}
**Issue:** ${v.id}
**CVSS:** ${getCVSSEmoji(v.cvss)} ${v.cvss}
**Exploit Maturity:** ${v.exploitMaturity || "N/A"}
**EPSS:** ${v.epss ? `${getEPSSEmoji(v.epss.score)} ${v.epss.score} (${v.epss.scoreSeverity})` : "N/A"}
**CWE:** ${v.identifiers.find((id) => id.startsWith("CWE")) || "N/A"}
**Fix Version:** ${risk.remediationSuggestion?.nearestFixVersion || "N/A"}
`,
      )
      .join("\n");
  }

  let remediationSuggestions = "";
  if (risk.remediationSuggestion) {
    remediationSuggestions = `
### 💡 Remediation Suggestions

1. Update the ${risk.dependencyName.split(":")[0]} package to version ${risk.remediationSuggestion.nearestFixVersion} or later.
2. Location: ${risk.remediationSuggestion.codeReference.filePath}
3. Regularly scan and update all dependencies to minimize exposure to known vulnerabilities.
`;
  }

  return `### ${severityEmoji} ${risk.riskLevel} severity risk: ${risk.findingName || risk.ruleName}
  ${hasRemedy(risk) ? `\n🔧 [Remediate](command:apiiro-code.remediate?${encodedRisk})` : ""}

📦 **Dependency:** ${risk.dependencyName}

🔗 **Type:** ${risk.type}

**Discovered on:** ${new Date(risk.discoveredOn).toLocaleString()}


${vulnerabilitiesInfo}

${remediationSuggestions}

 **Apiiro Link:** [View in Apiiro](${getEnvironmentData().AppUrl}/risks?fl&trigger=${risk.id})
 
  ${hasRemedy(risk) ? `\n🔧 [Remediate](command:apiiro-code.remediate?${encodedRisk})` : ""}
}

function getCVSSEmoji(cvss: number): string {
  if (cvss >= 9.0) return "🔴";
  if (cvss >= 7.0) return "🟠";
  if (cvss >= 4.0) return "🟡";
  return "🟢";
}

function getEPSSEmoji(epss: number): string {
  if (epss >= 0.5) return "🔴";
  if (epss >= 0.1) return "🟠";
  if (epss >= 0.01) return "🟡";
  return "🟢";
}
