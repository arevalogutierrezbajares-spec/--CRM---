import { microsoftGraphEmailProvider } from "./providers/microsoft-graph";
import { sandboxEmailProvider } from "./providers/sandbox";
import { zohoMailEmailProvider } from "./providers/zoho-mail";
import type { EmailProvider } from "./types";

export function getEmailProvider(kind: "sandbox" | "microsoft_365" | "zoho_mail"): EmailProvider {
  if (kind === "microsoft_365") return microsoftGraphEmailProvider;
  if (kind === "zoho_mail") return zohoMailEmailProvider;
  return sandboxEmailProvider;
}
