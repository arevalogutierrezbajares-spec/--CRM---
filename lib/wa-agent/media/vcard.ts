export type WaPhone = {
  phone: string;
  wa_id?: string;
  type?: string;
};

export type WaEmail = {
  email: string;
  type?: string;
};

export type WaContactPayload = {
  name?: { formatted_name: string; first_name?: string; last_name?: string };
  phones?: WaPhone[];
  emails?: WaEmail[];
  org?: { company?: string; title?: string };
  birthday?: string;
}[];

export type ParsedContact = {
  name: string;
  phones: string[];
  whatsappNumbers: string[];
  emails: string[];
  company?: string;
  title?: string;
};

export function parseWaContacts(payload: WaContactPayload): ParsedContact[] {
  return payload.map((c) => {
    const name = c.name?.formatted_name ?? "Unknown";
    const phones = (c.phones ?? []).filter((p) => p.type !== "WHATSAPP").map((p) => p.phone);
    const whatsappNumbers = (c.phones ?? [])
      .filter((p) => p.type === "WHATSAPP" || p.wa_id)
      .map((p) => p.wa_id ?? p.phone);
    const emails = (c.emails ?? []).map((e) => e.email);
    const company = c.org?.company;
    const title = c.org?.title;
    return { name, phones, whatsappNumbers, emails, company, title };
  });
}

export function contactCardSummary(c: ParsedContact): string {
  const parts: string[] = [c.name];
  if (c.company) parts.push(`(${c.company}${c.title ? ` — ${c.title}` : ""})`);
  if (c.whatsappNumbers.length) parts.push(`WA: ${c.whatsappNumbers[0]}`);
  else if (c.phones.length) parts.push(`📞 ${c.phones[0]}`);
  if (c.emails.length) parts.push(`✉️ ${c.emails[0]}`);
  return parts.join(" ");
}
