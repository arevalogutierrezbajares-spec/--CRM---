import type {
  EmailProvider,
  ProviderInboundMessage,
  ProviderMailbox,
  ProviderMailboxListResult,
  ProviderMailboxPermissionGrant,
  ProviderMessageMutationResult,
  ProviderProvisioningResult,
  ProviderSendResult,
  ProviderSyncResult,
  SendInput,
} from "@/lib/email/types";
import type { SessionUser } from "@/lib/current-user";
import type { MailboxRecord } from "@/lib/email/types";
import { normalizeEmail } from "@/lib/email/format";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GraphCollection<T> = {
  value?: T[];
  "@odata.nextLink"?: string;
};

type GraphUser = {
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
  usageLocation?: string | null;
};

type GraphRecipient = {
  emailAddress?: {
    address?: string | null;
    name?: string | null;
  };
};

type GraphMessage = {
  id: string;
  conversationId?: string | null;
  internetMessageId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  body?: {
    contentType?: "text" | "html" | "Text" | "Html";
    content?: string | null;
  } | null;
  from?: GraphRecipient | null;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string | null;
  hasAttachments?: boolean;
};

type GraphAttachment = {
  id: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  isInline?: boolean | null;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function getAppToken(): Promise<string> {
  const tenantId = requiredEnv("MS_GRAPH_TENANT_ID");
  const clientId = requiredEnv("MS_GRAPH_CLIENT_ID");
  const clientSecret = requiredEnv("MS_GRAPH_CLIENT_SECRET");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? "Microsoft token request failed");
  }
  return json.access_token;
}

function recipients(addresses: string[]) {
  return addresses.map((address) => ({ emailAddress: { address } }));
}

function mailNickname(address: string) {
  return (address.split("@")[0] ?? "user").replace(/[^a-z0-9._-]/gi, "").slice(0, 64) || "user";
}

function manualSharedMailboxSteps(address: string, displayName: string, grants: ProviderMailboxPermissionGrant[] = []) {
  const escapedName = displayName.replace(/"/g, '\\"');
  const steps = [
    `Create the shared mailbox in Exchange admin center or Exchange Online PowerShell: New-Mailbox -Shared -Name "${escapedName}" -DisplayName "${escapedName}" -PrimarySmtpAddress ${address}`,
    "Wait until Microsoft 365 shows the shared mailbox as ready, then run Import Microsoft mailboxes in AGB CRM.",
  ];
  for (const grant of grants) {
    if (grant.fullAccess) {
      steps.push(
        `Grant Full Access: Add-MailboxPermission -Identity ${address} -User ${grant.userEmail} -AccessRights FullAccess -InheritanceType All`,
      );
    }
    if (grant.sendAs) {
      steps.push(
        `Grant Send As: Add-RecipientPermission -Identity ${address} -Trustee ${grant.userEmail} -AccessRights SendAs -Confirm:$false`,
      );
    }
  }
  return steps;
}

function manualTeamMemberSteps(email: string, displayName: string) {
  return [
    `Create or invite ${displayName} as a Microsoft 365 user with user principal name ${email}.`,
    "Assign an Exchange Online-capable Microsoft 365 license and usage location.",
    "Wait until Exchange provisions the mailbox, then run Check/import ready in AGB CRM.",
  ];
}

export function buildGraphSendPayload(input: SendInput) {
  const attachments = (input.attachments ?? [])
    .filter((attachment) => attachment.contentBase64)
    .map((attachment) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: attachment.filename,
      contentType: attachment.mimeType,
      contentBytes: attachment.contentBase64,
    }));
  return {
    message: {
      subject: input.subject,
      body: {
        contentType: "Text",
        content: input.bodyText,
      },
      toRecipients: recipients(input.to),
      ccRecipients: recipients(input.cc ?? []),
      bccRecipients: recipients(input.bcc ?? []),
      ...(attachments.length > 0 ? { attachments } : {}),
    },
    saveToSentItems: true,
  };
}

async function graphFetch(path: string, init: RequestInit = {}) {
  const token = await getAppToken();
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
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

function recipientAddresses(recipientsList?: GraphRecipient[]): string[] {
  return (recipientsList ?? [])
    .map((recipient) => recipient.emailAddress?.address)
    .filter((address): address is string => Boolean(address))
    .map(normalizeEmail);
}

export function mapGraphUserToMailbox(user: GraphUser, domain: string): ProviderMailbox | null {
  const address = normalizeEmail(user.mail ?? user.userPrincipalName ?? "");
  if (!address || !address.endsWith(`@${domain.toLowerCase()}`)) return null;
  const localPart = address.split("@")[0] ?? "";
  const sharedPrefixes = new Set(["admin", "sales", "ops", "support", "finance", "hello", "info"]);
  return {
    providerMailboxId: user.id,
    address,
    displayName: user.displayName?.trim() || address,
    typeHint: sharedPrefixes.has(localPart) ? "shared" : "personal",
  };
}

async function createMicrosoftUser(args: {
  email: string;
  displayName: string;
  temporaryPassword: string;
  usageLocation: string;
}): Promise<{ ok: true; user: GraphUser } | { ok: false; error: string; providerStatus?: number }> {
  const res = await graphFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      accountEnabled: true,
      displayName: args.displayName,
      mailNickname: mailNickname(args.email),
      userPrincipalName: args.email,
      usageLocation: args.usageLocation,
      passwordProfile: {
        forceChangePasswordNextSignIn: true,
        password: args.temporaryPassword,
      },
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as GraphUser & { error?: { message?: string } };
  if (!res.ok || !payload.id) {
    return {
      ok: false,
      error: payload.error?.message ?? `Graph user create failed with ${res.status}`,
      providerStatus: res.status,
    };
  }
  return { ok: true, user: payload };
}

async function assignMicrosoftLicense(args: {
  userId: string;
  licenseSkuId: string;
}): Promise<{ ok: true } | { ok: false; error: string; providerStatus?: number }> {
  const res = await graphFetch(`/users/${encodeURIComponent(args.userId)}/assignLicense`, {
    method: "POST",
    body: JSON.stringify({
      addLicenses: [{ skuId: args.licenseSkuId }],
      removeLicenses: [],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: text || `Graph license assignment failed with ${res.status}`,
      providerStatus: res.status,
    };
  }
  return { ok: true };
}

async function provisionMicrosoftTeamMemberMailbox(args: {
  domain: string;
  email: string;
  displayName: string;
  temporaryPassword?: string;
  usageLocation?: string;
  licenseSkuId?: string;
}): Promise<ProviderProvisioningResult> {
  const enabled = process.env.MS_GRAPH_PROVISIONING_ENABLED === "true";
  const licenseSkuId = args.licenseSkuId ?? process.env.MS_GRAPH_LICENSE_SKU_ID;
  const usageLocation = args.usageLocation ?? process.env.MS_GRAPH_USAGE_LOCATION ?? "US";
  if (!enabled) {
    return {
      ok: true,
      mode: "provider_pending",
      message: "Microsoft Graph user provisioning is not enabled for this CRM environment.",
      manualSteps: manualTeamMemberSteps(args.email, args.displayName),
      metadata: {
        provider: "microsoft_365",
        domain: args.domain,
        provisioningEnabled: false,
      },
    };
  }
  if (!licenseSkuId) {
    return {
      ok: true,
      mode: "provider_pending",
      message: "Set MS_GRAPH_LICENSE_SKU_ID before automatic Microsoft 365 license assignment.",
      manualSteps: manualTeamMemberSteps(args.email, args.displayName),
      metadata: {
        provider: "microsoft_365",
        domain: args.domain,
        provisioningEnabled: true,
        missing: "MS_GRAPH_LICENSE_SKU_ID",
      },
    };
  }
  if (!args.temporaryPassword) {
    return {
      ok: false,
      error: "Enter a temporary Microsoft 365 password for automatic user provisioning.",
      manualSteps: manualTeamMemberSteps(args.email, args.displayName),
      metadata: {
        provider: "microsoft_365",
        domain: args.domain,
        provisioningEnabled: true,
        missing: "temporaryPassword",
      },
    };
  }
  const created = await createMicrosoftUser({
    email: args.email,
    displayName: args.displayName,
    temporaryPassword: args.temporaryPassword,
    usageLocation,
  });
  if (!created.ok) return created;
  const licensed = await assignMicrosoftLicense({
    userId: created.user.id,
    licenseSkuId,
  });
  if (!licensed.ok) return licensed;
  return {
    ok: true,
    mode: "provider_pending",
    message: "Microsoft 365 user and license were created; mailbox readiness is pending Exchange provisioning.",
    providerUserId: created.user.id,
    nextCheckAfter: new Date(Date.now() + 15 * 60 * 1000),
    manualSteps: [
      "Wait for Exchange Online to finish mailbox provisioning.",
      "Run Check/import ready in AGB CRM.",
      "If the mailbox is not visible after propagation, verify the assigned license includes Exchange Online.",
    ],
    metadata: {
      provider: "microsoft_365",
      domain: args.domain,
      provisioningEnabled: true,
      usageLocation,
      userPrincipalName: args.email,
      mailboxAuthority: "microsoft_365",
    },
  };
}

export function mapGraphMessageToInbound(message: GraphMessage): ProviderInboundMessage | null {
  const fromAddress = normalizeEmail(message.from?.emailAddress?.address ?? "");
  if (!fromAddress) return null;
  const bodyContent = message.body?.content?.trim();
  const isHtml = message.body?.contentType?.toLowerCase() === "html";
  const bodyText = bodyContent
    ? isHtml
      ? stripHtml(bodyContent)
      : bodyContent
    : message.bodyPreview?.trim() || "(No message preview)";
  return {
    providerThreadId: message.conversationId || message.id,
    providerMessageId: message.id,
    internetMessageId: message.internetMessageId || `<graph-${message.id}@caneycloud.com>`,
    fromAddress,
    fromName: message.from?.emailAddress?.name ?? undefined,
    toRecipients: recipientAddresses(message.toRecipients),
    ccRecipients: recipientAddresses(message.ccRecipients),
    subject: message.subject?.trim() || "(No subject)",
    bodyText,
    receivedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : new Date(),
    hasAttachments: Boolean(message.hasAttachments),
  };
}

async function listMicrosoftMailboxes(domain: string): Promise<ProviderMailboxListResult> {
  const query = new URLSearchParams({
    "$select": "id,displayName,mail,userPrincipalName",
    "$top": "999",
  });
  const res = await graphFetch(`/users?${query.toString()}`, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: text || `Graph users list failed with ${res.status}`, providerStatus: res.status };
  }
  const payload = (await res.json()) as GraphCollection<GraphUser>;
  return {
    ok: true,
    mailboxes: (payload.value ?? [])
      .map((user) => mapGraphUserToMailbox(user, domain))
      .filter((mailbox): mailbox is ProviderMailbox => Boolean(mailbox)),
  };
}

async function listMessageAttachments(mailboxAddress: string, messageId: string) {
  const res = await graphFetch(
    `/users/${encodeURIComponent(mailboxAddress)}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`,
    { method: "GET" },
  );
  if (!res.ok) return [];
  const payload = (await res.json()) as GraphCollection<GraphAttachment>;
  return (payload.value ?? [])
    .filter((attachment) => !attachment.isInline)
    .map((attachment) => ({
      providerAttachmentId: attachment.id,
      filename: attachment.name ?? "attachment",
      mimeType: attachment.contentType ?? "application/octet-stream",
      sizeBytes: attachment.size ?? 0,
    }));
}

async function syncMicrosoftMailbox(args: {
  mailbox: MailboxRecord;
  limit?: number;
}): Promise<ProviderSyncResult> {
  const top = Math.max(1, Math.min(args.limit ?? 25, 50));
  const query = new URLSearchParams({
    "$top": String(top),
    "$orderby": "receivedDateTime desc",
    "$select": "id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments",
  });
  const res = await graphFetch(
    `/users/${encodeURIComponent(args.mailbox.address)}/mailFolders/inbox/messages?${query.toString()}`,
    { method: "GET" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: text || `Graph message sync failed with ${res.status}`, providerStatus: res.status };
  }
  const payload = (await res.json()) as GraphCollection<GraphMessage>;
  const messages: ProviderInboundMessage[] = [];
  for (const message of payload.value ?? []) {
    const inbound = mapGraphMessageToInbound(message);
    if (!inbound) continue;
    if (message.hasAttachments) {
      inbound.attachments = await listMessageAttachments(args.mailbox.address, message.id);
    }
    messages.push(inbound);
  }
  return { ok: true, messages };
}

export async function microsoftSendMail(args: {
  user: SessionUser;
  mailbox: MailboxRecord;
  input: SendInput;
}): Promise<ProviderSendResult> {
  void args.user;
  const res = await graphFetch(`/users/${encodeURIComponent(args.mailbox.address)}/sendMail`, {
    method: "POST",
    body: JSON.stringify(buildGraphSendPayload(args.input)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: text || `Microsoft Graph sendMail failed with ${res.status}`,
      providerStatus: res.status,
    };
  }
  return {
    ok: true,
    providerMessageId: `graph-send-${args.input.idempotencyKey}`,
    sentAt: new Date(),
  };
}

async function downloadMicrosoftAttachment(args: {
  mailbox: MailboxRecord;
  providerMessageId: string;
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
}) {
  const res = await graphFetch(
    `/users/${encodeURIComponent(args.mailbox.address)}/messages/${encodeURIComponent(args.providerMessageId)}/attachments/${encodeURIComponent(args.providerAttachmentId)}/$value`,
    { method: "GET", headers: { "Content-Type": "application/octet-stream" } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false as const,
      error: text || `Graph attachment download failed with ${res.status}`,
      providerStatus: res.status,
    };
  }
  return {
    ok: true as const,
    filename: args.filename,
    mimeType: args.mimeType,
    content: new Uint8Array(await res.arrayBuffer()),
  };
}

async function archiveMicrosoftMessages(args: {
  mailbox: MailboxRecord;
  providerMessageIds: string[];
}): Promise<ProviderMessageMutationResult> {
  let changed = 0;
  for (const messageId of args.providerMessageIds) {
    const res = await graphFetch(
      `/users/${encodeURIComponent(args.mailbox.address)}/messages/${encodeURIComponent(messageId)}/move`,
      {
        method: "POST",
        body: JSON.stringify({ destinationId: "archive" }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: text || `Graph archive failed with ${res.status}`,
        providerStatus: res.status,
      };
    }
    changed += 1;
  }
  return { ok: true, changed };
}

async function markMicrosoftMessagesRead(args: {
  mailbox: MailboxRecord;
  providerMessageIds: string[];
  isRead: boolean;
}): Promise<ProviderMessageMutationResult> {
  let changed = 0;
  for (const messageId of args.providerMessageIds) {
    const res = await graphFetch(
      `/users/${encodeURIComponent(args.mailbox.address)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ isRead: args.isRead }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: text || `Graph read-state update failed with ${res.status}`,
        providerStatus: res.status,
      };
    }
    changed += 1;
  }
  return { ok: true, changed };
}

export const microsoftGraphEmailProvider: EmailProvider = {
  kind: "microsoft_365",
  async send(args) {
    return microsoftSendMail(args);
  },
  async listMailboxes({ domain }) {
    return listMicrosoftMailboxes(domain);
  },
  async provisionSharedMailbox({ address, displayName }) {
    return {
      ok: true,
      mode: "provider_pending",
      message: "Create this shared mailbox in Microsoft 365, then import it into AGB CRM.",
      manualSteps: manualSharedMailboxSteps(address, displayName),
      metadata: {
        provider: "microsoft_365",
        mailboxAuthority: "exchange_online",
        crmAuthority: "workflow_access_audit",
      },
    };
  },
  async provisionTeamMemberMailbox(args) {
    return provisionMicrosoftTeamMemberMailbox(args);
  },
  async applyMailboxPermissions({ mailboxAddress, grants }) {
    return {
      ok: true,
      mode: "provider_pending",
      message: "Apply Full Access and Send As in Exchange Online, then mirror access in AGB CRM.",
      manualSteps: manualSharedMailboxSteps(mailboxAddress, mailboxAddress.split("@")[0] ?? mailboxAddress, grants).slice(2),
      metadata: {
        provider: "microsoft_365",
        mailboxAuthority: "exchange_online",
        grantCount: grants.length,
      },
    };
  },
  async syncMailbox(args) {
    return syncMicrosoftMailbox(args);
  },
  async downloadAttachment(args) {
    return downloadMicrosoftAttachment(args);
  },
  async archiveMessages(args) {
    return archiveMicrosoftMessages(args);
  },
  async markMessagesRead(args) {
    return markMicrosoftMessagesRead(args);
  },
  async health() {
    try {
      const res = await graphFetch("/organization?$select=id,displayName", { method: "GET" });
      if (!res.ok) return { ok: false, detail: `Graph health check failed: ${res.status}` };
      return { ok: true, detail: "Microsoft Graph credentials accepted." };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : "Graph health check failed" };
    }
  },
};
