import type {
  EmailProvider,
  ProviderAttachmentDownloadResult,
  ProviderInboundMessage,
  ProviderMailbox,
  ProviderMailboxListResult,
  ProviderMessageMutationResult,
  ProviderSendResult,
  ProviderSyncResult,
  SendInput,
} from "@/lib/email/types";
import type { SessionUser } from "@/lib/current-user";
import type { MailboxRecord } from "@/lib/email/types";
import { normalizeEmail } from "@/lib/email/format";

const DEFAULT_ACCOUNTS_BASE = "https://accounts.zoho.com";
const DEFAULT_MAIL_BASE = "https://mail.zoho.com/api";

type ZohoTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type ZohoEnvelope<T> = {
  data?: T;
  status?: {
    code?: number;
    description?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type ZohoAccount = {
  accountId?: string | number;
  accountID?: string | number;
  primaryEmailAddress?: string;
  emailAddress?: string;
  mailAddress?: string;
  displayName?: string;
  accountDisplayName?: string;
  firstName?: string;
  lastName?: string;
};

type ZohoFolder = {
  folderId?: string | number;
  folderID?: string | number;
  folderName?: string;
  folderType?: string;
};

type ZohoMessage = {
  messageId?: string | number;
  messageID?: string | number;
  threadId?: string | number;
  threadID?: string | number;
  fromAddress?: string;
  sender?: string;
  senderEmailAddress?: string;
  senderName?: string;
  toAddress?: string;
  ccAddress?: string;
  subject?: string;
  summary?: string;
  content?: string;
  htmlContent?: string;
  receivedTime?: string | number;
  sentDateInGMT?: string;
  hasAttachment?: boolean;
  hasAttachments?: boolean;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function zohoAccountsBase() {
  return (process.env.ZOHO_ACCOUNTS_BASE_URL ?? DEFAULT_ACCOUNTS_BASE).replace(/\/$/, "");
}

function zohoMailBase() {
  return (process.env.ZOHO_MAIL_API_BASE_URL ?? DEFAULT_MAIL_BASE).replace(/\/$/, "");
}

async function getZohoAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: requiredEnv("ZOHO_REFRESH_TOKEN"),
    client_id: requiredEnv("ZOHO_CLIENT_ID"),
    client_secret: requiredEnv("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const res = await fetch(`${zohoAccountsBase()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await res.json().catch(() => ({}))) as ZohoTokenResponse;
  if (!res.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? `Zoho OAuth refresh failed with ${res.status}`);
  }
  return payload.access_token;
}

async function zohoFetch(path: string, init: RequestInit = {}) {
  const token = await getZohoAccessToken();
  return fetch(`${zohoMailBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function parseZohoJson<T>(res: Response): Promise<ZohoEnvelope<T> | T | null> {
  return (await res.json().catch(() => null)) as ZohoEnvelope<T> | T | null;
}

function unwrapZohoData<T>(payload: ZohoEnvelope<T> | T | null): T | null {
  if (!payload) return null;
  if (typeof payload === "object" && "data" in payload) return (payload as ZohoEnvelope<T>).data ?? null;
  return payload as T;
}

function zohoError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const envelope = payload as ZohoEnvelope<unknown>;
    return envelope.error?.message ?? envelope.status?.description ?? fallback;
  }
  return fallback;
}

function accountId(account: ZohoAccount): string {
  return String(account.accountId ?? account.accountID ?? "");
}

function accountAddress(account: ZohoAccount): string {
  return normalizeEmail(account.primaryEmailAddress ?? account.emailAddress ?? account.mailAddress ?? "");
}

function displayName(account: ZohoAccount, address: string): string {
  const combined = `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim();
  return account.displayName?.trim() || account.accountDisplayName?.trim() || combined || address;
}

function classifyZohoAddress(address: string): "personal" | "shared" | "system" {
  const localPart = address.split("@")[0] ?? "";
  const sharedPrefixes = new Set(["admin", "sales", "ops", "support", "finance", "hello", "info", "billing"]);
  return sharedPrefixes.has(localPart) ? "shared" : "personal";
}

export function mapZohoAccountToMailbox(account: ZohoAccount, domain: string): ProviderMailbox | null {
  const id = accountId(account);
  const address = accountAddress(account);
  if (!id || !address || !address.endsWith(`@${domain.toLowerCase()}`)) return null;
  return {
    providerMailboxId: `zoho:${id}`,
    address,
    displayName: displayName(account, address),
    typeHint: classifyZohoAddress(address),
    metadata: {
      zohoAccountId: id,
      folders: [`zoho-account:${id}`],
      lastDeltaToken: `zoho:${id}`,
    },
  };
}

async function listZohoAccounts(): Promise<{ ok: true; accounts: ZohoAccount[] } | { ok: false; error: string; providerStatus?: number }> {
  const res = await zohoFetch("/accounts", { method: "GET" });
  const payload = await parseZohoJson<ZohoAccount[]>(res);
  if (!res.ok) {
    return {
      ok: false,
      error: zohoError(payload, `Zoho accounts list failed with ${res.status}`),
      providerStatus: res.status,
    };
  }
  const data = unwrapZohoData<ZohoAccount[]>(payload) ?? [];
  return { ok: true, accounts: Array.isArray(data) ? data : [] };
}

async function listZohoMailboxes(domain: string): Promise<ProviderMailboxListResult> {
  const result = await listZohoAccounts();
  if (!result.ok) return result;
  return {
    ok: true,
    mailboxes: result.accounts
      .map((account) => mapZohoAccountToMailbox(account, domain))
      .filter((mailbox): mailbox is ProviderMailbox => Boolean(mailbox)),
  };
}

function accountIdFromMailbox(mailbox: MailboxRecord): string {
  const metadataAccountId = mailbox.providerMetadata.zohoAccountId;
  if (metadataAccountId) return metadataAccountId;
  if (mailbox.providerMetadata.lastDeltaToken?.startsWith("zoho:")) {
    return mailbox.providerMetadata.lastDeltaToken.replace(/^zoho:/, "");
  }
  if (mailbox.providerMetadata.folders?.[0]?.startsWith("zoho-account:")) {
    return mailbox.providerMetadata.folders[0].replace(/^zoho-account:/, "");
  }
  if (mailbox.id.startsWith("zoho:")) return mailbox.id.replace(/^zoho:/, "");
  return mailbox.providerMetadata.zohoAccountId ?? mailbox.address;
}

function splitAddressList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((item) => normalizeEmail(item.trim()))
    .filter(Boolean);
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseZohoDate(value?: string | number): Date {
  if (typeof value === "number") return new Date(value);
  if (!value) return new Date();
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.length >= 10) return new Date(numeric);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function mapZohoMessageToInbound(message: ZohoMessage): ProviderInboundMessage | null {
  const messageId = String(message.messageId ?? message.messageID ?? "");
  if (!messageId) return null;
  const fromAddress = normalizeEmail(message.fromAddress ?? message.senderEmailAddress ?? message.sender ?? "");
  if (!fromAddress) return null;
  const body = message.content ?? message.htmlContent ?? message.summary ?? "(No message preview)";
  return {
    providerThreadId: String(message.threadId ?? message.threadID ?? messageId),
    providerMessageId: messageId,
    internetMessageId: `<zoho-${messageId}@caneycloud.com>`,
    fromAddress,
    fromName: message.senderName?.trim() || undefined,
    toRecipients: splitAddressList(message.toAddress),
    ccRecipients: splitAddressList(message.ccAddress),
    subject: message.subject?.trim() || "(No subject)",
    bodyText: stripHtml(body),
    receivedAt: parseZohoDate(message.receivedTime ?? message.sentDateInGMT),
    hasAttachments: Boolean(message.hasAttachment ?? message.hasAttachments),
  };
}

async function findInboxFolderId(accountIdValue: string): Promise<string | null> {
  const res = await zohoFetch(`/accounts/${encodeURIComponent(accountIdValue)}/folders`, { method: "GET" });
  const payload = await parseZohoJson<ZohoFolder[]>(res);
  if (!res.ok) return null;
  const folders = unwrapZohoData<ZohoFolder[]>(payload) ?? [];
  const inbox =
    folders.find((folder) => folder.folderType?.toLowerCase() === "inbox") ??
    folders.find((folder) => folder.folderName?.toLowerCase() === "inbox") ??
    folders[0];
  const id = inbox?.folderId ?? inbox?.folderID;
  return id ? String(id) : null;
}

async function syncZohoMailbox(args: {
  mailbox: MailboxRecord;
  limit?: number;
}): Promise<ProviderSyncResult> {
  const accountIdValue = accountIdFromMailbox(args.mailbox);
  const folderId = args.mailbox.providerMetadata.zohoInboxFolderId ?? (await findInboxFolderId(accountIdValue));
  if (!folderId) return { ok: false, error: "Zoho inbox folder was not found." };
  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.min(args.limit ?? 25, 50))),
    status: "unread",
  });
  const res = await zohoFetch(
    `/accounts/${encodeURIComponent(accountIdValue)}/folders/${encodeURIComponent(folderId)}/messages/view?${query.toString()}`,
    { method: "GET" },
  );
  const payload = await parseZohoJson<ZohoMessage[]>(res);
  if (!res.ok) {
    return {
      ok: false,
      error: zohoError(payload, `Zoho message sync failed with ${res.status}`),
      providerStatus: res.status,
    };
  }
  const data = unwrapZohoData<ZohoMessage[]>(payload) ?? [];
  return {
    ok: true,
    messages: (Array.isArray(data) ? data : [])
      .map(mapZohoMessageToInbound)
      .filter((message): message is ProviderInboundMessage => Boolean(message)),
    nextDeltaToken: `zoho:${accountIdValue}`,
  };
}

function buildZohoSendPayload(input: SendInput, mailbox: MailboxRecord) {
  return {
    fromAddress: mailbox.address,
    toAddress: input.to.join(","),
    ccAddress: (input.cc ?? []).join(","),
    bccAddress: (input.bcc ?? []).join(","),
    subject: input.subject,
    content: input.bodyText,
    mailFormat: "plaintext",
  };
}

export async function zohoSendMail(args: {
  user: SessionUser;
  mailbox: MailboxRecord;
  input: SendInput;
}): Promise<ProviderSendResult> {
  void args.user;
  if ((args.input.attachments ?? []).length > 0) {
    return { ok: false, error: "Zoho attachment sending is not enabled in CRM V1. Send without attachments." };
  }
  const accountIdValue = accountIdFromMailbox(args.mailbox);
  const res = await zohoFetch(`/accounts/${encodeURIComponent(accountIdValue)}/messages`, {
    method: "POST",
    body: JSON.stringify(buildZohoSendPayload(args.input, args.mailbox)),
  });
  const payload = await parseZohoJson<{ messageId?: string | number }>(res);
  if (!res.ok) {
    return {
      ok: false,
      error: zohoError(payload, `Zoho send failed with ${res.status}`),
      providerStatus: res.status,
    };
  }
  const data = unwrapZohoData<{ messageId?: string | number }>(payload);
  return {
    ok: true,
    providerMessageId: String(data?.messageId ?? `zoho-send-${args.input.idempotencyKey}`),
    sentAt: new Date(),
  };
}

function manualZohoSharedMailboxSteps(address: string, displayName: string) {
  return [
    `In Zoho Mail Admin Console, create ${address} as a real user mailbox named ${displayName}. For Zoho Free, do not use a forwarding-only alias if CRM read/sync/send is required.`,
    "Verify the mailbox can receive email in Zoho webmail.",
    "Run Import Zoho mailboxes in AGB CRM, then classify the mailbox as shared and assign CRM access.",
  ];
}

function manualZohoTeamMemberSteps(email: string, displayName: string) {
  return [
    `In Zoho Mail Admin Console, create or invite ${displayName} with mailbox ${email}.`,
    "Ask the user to activate the account and confirm Zoho webmail can send and receive.",
    "Run Import Zoho mailboxes in AGB CRM, then classify it as a personal mailbox if needed.",
  ];
}

function zohoPermissionSteps(mailboxAddress: string) {
  return [
    `Keep ${mailboxAddress} as a CRM-managed shared mailbox. Zoho Free provider permissions are verified through OAuth/account access; CRM access grants are mirrored internally.`,
    "If the mailbox does not appear during import, authorize the Zoho account that owns that mailbox or upgrade/configure Zoho delegation.",
  ];
}

async function mutateZohoMessages(args: {
  mailbox: MailboxRecord;
  providerMessageIds: string[];
  action: "archive" | "read" | "unread";
}): Promise<ProviderMessageMutationResult> {
  if (args.providerMessageIds.length === 0) return { ok: true, changed: 0 };
  const accountIdValue = accountIdFromMailbox(args.mailbox);
  const body =
    args.action === "archive"
      ? { mode: "archive", messageId: args.providerMessageIds }
      : { mode: args.action === "read" ? "markAsRead" : "markAsUnread", messageId: args.providerMessageIds };
  const res = await zohoFetch(`/accounts/${encodeURIComponent(accountIdValue)}/updatemessage`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  const payload = await parseZohoJson<unknown>(res);
  if (!res.ok) {
    return {
      ok: false,
      error: zohoError(payload, `Zoho message update failed with ${res.status}`),
      providerStatus: res.status,
    };
  }
  return { ok: true, changed: args.providerMessageIds.length };
}

export const zohoMailEmailProvider: EmailProvider = {
  kind: "zoho_mail",
  async send(args) {
    return zohoSendMail(args);
  },
  async listMailboxes({ domain }) {
    return listZohoMailboxes(domain);
  },
  async provisionSharedMailbox({ address, displayName, domain }) {
    return {
      ok: true,
      mode: "provider_pending",
      message: "Create this Zoho mailbox in Zoho Admin Console, then import it into AGB CRM.",
      manualSteps: manualZohoSharedMailboxSteps(address, displayName),
      metadata: {
        provider: "zoho_mail",
        domain,
        mailboxAuthority: "zoho_admin_console",
        crmAuthority: "workflow_access_audit",
      },
    };
  },
  async provisionTeamMemberMailbox({ email, displayName, domain }) {
    return {
      ok: true,
      mode: "provider_pending",
      message: "Create this Zoho user/mailbox in Zoho Admin Console, then import it into AGB CRM.",
      manualSteps: manualZohoTeamMemberSteps(email, displayName),
      metadata: {
        provider: "zoho_mail",
        domain,
        mailboxAuthority: "zoho_admin_console",
      },
    };
  },
  async applyMailboxPermissions({ mailboxAddress }) {
    return {
      ok: true,
      mode: "provider_pending",
      message: "Zoho Free mailbox access is controlled by authorized Zoho accounts plus CRM access grants.",
      manualSteps: zohoPermissionSteps(mailboxAddress),
      metadata: {
        provider: "zoho_mail",
        mailboxAuthority: "zoho_admin_console",
      },
    };
  },
  async syncMailbox(args) {
    return syncZohoMailbox(args);
  },
  async downloadAttachment(args): Promise<ProviderAttachmentDownloadResult> {
    void args;
    return { ok: false, error: "Zoho attachment download is not enabled in CRM V1." };
  },
  async archiveMessages(args) {
    return mutateZohoMessages({ ...args, action: "archive" });
  },
  async markMessagesRead(args) {
    return mutateZohoMessages({ ...args, action: args.isRead ? "read" : "unread" });
  },
  async health() {
    try {
      const result = await listZohoAccounts();
      if (!result.ok) return { ok: false, detail: result.error };
      return { ok: true, detail: `Zoho Mail API credentials accepted. ${result.accounts.length} account(s) visible.` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : "Zoho Mail health check failed" };
    }
  },
};
