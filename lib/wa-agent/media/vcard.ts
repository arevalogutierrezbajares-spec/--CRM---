/**
 * vCard / contact card parsing from WhatsApp webhook payload.
 *
 * WA sends shared contacts as `type=contacts` with structured JSON —
 * no vCard library needed.
 */

export type ParsedContact = {
  formattedName: string;
  phones: Array<{ number: string; type: string }>;
  emails: Array<{ email: string; type: string }>;
  organization: string | null;
};

/**
 * WA contacts message payload shape:
 * {
 *   contacts: [{
 *     name: { formatted_name: "..." },
 *     phones: [{ phone: "+1...", type: "CELL" }],
 *     emails: [{ email: "...", type: "WORK" }],
 *     org: { company: "..." }
 *   }]
 * }
 */
export type WaContactPayload = {
  contacts?: Array<{
    name?: { formatted_name?: string; first_name?: string; last_name?: string };
    phones?: Array<{ phone?: string; type?: string; wa_id?: string }>;
    emails?: Array<{ email?: string; type?: string }>;
    org?: { company?: string };
    urls?: Array<{ url?: string; type?: string }>;
  }>;
};

export function parseWaContacts(payload: WaContactPayload): ParsedContact[] {
  return (payload.contacts ?? []).map((c) => {
    const formattedName =
      c.name?.formatted_name ??
      [c.name?.first_name, c.name?.last_name].filter(Boolean).join(" ") ??
      "Unknown";

    const phones = (c.phones ?? [])
      .filter((p) => p.phone)
      .map((p) => ({ number: p.phone!, type: p.type ?? "MOBILE" }));

    const emails = (c.emails ?? [])
      .filter((e) => e.email)
      .map((e) => ({ email: e.email!, type: e.type ?? "OTHER" }));

    return {
      formattedName,
      phones,
      emails,
      organization: c.org?.company ?? null,
    };
  });
}

/** Build a human-readable summary of a parsed contact for the agent prompt. */
export function contactCardSummary(c: ParsedContact): string {
  const parts = [`Contact card: ${c.formattedName}`];
  if (c.organization) parts.push(`Company: ${c.organization}`);
  if (c.phones.length) parts.push(`Phone: ${c.phones.map((p) => p.number).join(", ")}`);
  if (c.emails.length) parts.push(`Email: ${c.emails.map((e) => e.email).join(", ")}`);
  return parts.join(" | ");
}
