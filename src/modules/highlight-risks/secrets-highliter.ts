import { SecretsRisk } from "../../types/risk";
import { getSeverityIcon } from "./utils";
import { hasRemedy } from "../remediate-risks/remediate-risks";
import { getEnvironmentData } from "../../api";

export function createSecretsMessage(
  risk: SecretsRisk,
  encodedRisk: string,
): string {
  const severityIcon = getSeverityIcon(risk.riskLevel);
  const secretTypeIcon = getSecretTypeIcon(risk.secretType);

  return `### ${severityIcon} ${risk.riskLevel} severity risk: ${risk.findingName || risk.ruleName}

**Secret type:** ${secretTypeIcon} ${risk.secretType}

**Discovered on:** ${new Date(risk.discoveredOn).toLocaleString()}

**Validity:** ${risk.validity}${risk.lastValidatedOn ? `. Last checked as invalid: ${new Date(risk.lastValidatedOn).toLocaleString()}` : ""}

**Exposure:** ${risk.exposure}

**Appearances:** Appears ${risk.previewLines.length} time${risk.previewLines.length > 1 ? "s" : ""} in the file

**Apiiro Link:** [View in Apiiro](${getEnvironmentData().AppUrl}/risks?fl&trigger=${risk.id})
 
${hasRemedy(risk) ? `\n[Remediate](command:apiiro-code.remediate?${encodedRisk})` : ""}
`;
}

function getSecretTypeIcon(secretType: string): string {
  switch (secretType.toLowerCase()) {
    case "github access token":
      return "🐙";
    case "aws access key":
      return "☁️";
    case "private key":
      return "🔑";
    default:
      return "🔒";
  }
}
