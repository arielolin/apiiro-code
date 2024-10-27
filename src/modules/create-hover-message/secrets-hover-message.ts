import { SecretsRisk } from "../../types/risk";
import { getSeverityIcon } from "../highlight-risks/utils";
import { hasRemedy } from "../remediate-risks/remediate-risks";
import { getEnvironmentData } from "../../api";

export function createSecretsMessage(risk: SecretsRisk): string {
  const severityIcon = getSeverityIcon(risk.riskLevel);
  const encodedRisk = encodeURIComponent(JSON.stringify(risk));

  return `### ${severityIcon} ${risk.riskLevel} severity risk: ${risk.findingName || risk.ruleName}

**Secret type:**  ${risk.secretType ?? "N/A"}

**Discovered on:** ${new Date(risk.discoveredOn).toLocaleString()}

**Validity:** ${risk.validity}${risk.lastValidatedOn ? `. Last checked as invalid: ${new Date(risk.lastValidatedOn).toLocaleString()}` : ""}

**Exposure:** ${risk.exposure}


**Apiiro Link:** [View in Apiiro](${getEnvironmentData().AppUrl}/risks?fl&trigger=${risk.id})
 
${hasRemedy(risk) ? `\n[Remediate](command:apiiro-code.remediate?${encodedRisk})` : ""}
`;
}
