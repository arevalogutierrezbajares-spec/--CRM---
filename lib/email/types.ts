import type { SessionUser } from "@/lib/current-user";

export type MailboxRights = {
  canView: boolean;
  canReply: boolean;
  canSendAs: boolean;
  canAssign: boolean;
  canManageAccess: boolean;
  canManageSettings: boolean;
};

export const EMPTY_RIGHTS: MailboxRights = {
  canView: false,
  canReply: false,
  canSendAs: false,
  canAssign: false,
  canManageAccess: false,
  canManageSettings: false,
};

export const FULL_RIGHTS: MailboxRights = {
  canView: true,
  canReply: true,
  canSendAs: true,
  canAssign: true,
  canManageAccess: true,
  canManageSettings: true,
};

export type MailboxRecord = {
  id: string;
  workspaceId: string;
  address: string;
  displayName: string;
  type: "personal" | "shared" | "system";
  status: "active" | "paused" | "error" | "deactivated";
  ownerUserId: string | null;
  syncEnabled: boolean;
  sendEnabled: boolean;
  aiEnabled: boolean;
  providerMetadata: {
    sendAsDeniedUserIds?: string[];
    folders?: string[];
    lastDeltaToken?: string;
    zohoAccountId?: string;
    zohoInboxFolderId?: string;
  };
};

export type SendInput = {
  mailboxId: string;
  threadId?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  idempotencyKey: string;
  attachments?: EmailAttachmentInput[];
};

export type EmailAttachmentInput = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentBase64?: string;
};

export type ProviderSendResult =
  | { ok: true; providerMessageId: string; sentAt: Date }
  | { ok: false; error: string; providerStatus?: number };

export type ProviderAttachmentDownloadResult =
  | { ok: true; filename: string; mimeType: string; content: Uint8Array }
  | { ok: false; error: string; providerStatus?: number };

export type ProviderMessageMutationResult =
  | { ok: true; changed: number }
  | { ok: false; error: string; providerStatus?: number };

export type ProviderInboundMessage = {
  providerThreadId: string;
  providerMessageId: string;
  internetMessageId: string;
  fromAddress: string;
  fromName?: string;
  toRecipients: string[];
  ccRecipients?: string[];
  subject: string;
  bodyText: string;
  receivedAt: Date;
  hasAttachments?: boolean;
  attachments?: Array<{
    providerAttachmentId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

export type ProviderMailbox = {
  providerMailboxId: string;
  address: string;
  displayName: string;
  typeHint?: "personal" | "shared" | "system";
  metadata?: {
    sendAsDeniedUserIds?: string[];
    folders?: string[];
    lastDeltaToken?: string;
    zohoAccountId?: string;
    zohoInboxFolderId?: string;
  };
};

export type ProviderMailboxListResult =
  | { ok: true; mailboxes: ProviderMailbox[] }
  | { ok: false; error: string; providerStatus?: number };

export type ProviderMailboxPermissionGrant = {
  userId?: string;
  userEmail: string;
  fullAccess: boolean;
  sendAs: boolean;
};

export type ProviderProvisioningResult =
  | {
      ok: true;
      mode: "completed" | "provider_pending";
      message: string;
      mailbox?: ProviderMailbox;
      providerUserId?: string;
      providerRequestId?: string;
      nextCheckAfter?: Date;
      manualSteps?: string[];
      metadata?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      providerStatus?: number;
      manualSteps?: string[];
      metadata?: Record<string, unknown>;
    };

export type ProviderSyncResult =
  | { ok: true; messages: ProviderInboundMessage[]; nextDeltaToken?: string }
  | { ok: false; error: string; providerStatus?: number };

export type EmailProvider = {
  kind: "sandbox" | "microsoft_365" | "zoho_mail";
  send(args: {
    user: SessionUser;
    mailbox: MailboxRecord;
    input: SendInput;
  }): Promise<ProviderSendResult>;
  listMailboxes(args: {
    domain: string;
  }): Promise<ProviderMailboxListResult>;
  provisionSharedMailbox?(args: {
    domain: string;
    address: string;
    displayName: string;
    requestedByEmail: string;
  }): Promise<ProviderProvisioningResult>;
  provisionTeamMemberMailbox?(args: {
    domain: string;
    email: string;
    displayName: string;
    requestedByEmail: string;
    temporaryPassword?: string;
    usageLocation?: string;
    licenseSkuId?: string;
  }): Promise<ProviderProvisioningResult>;
  applyMailboxPermissions?(args: {
    mailboxAddress: string;
    grants: ProviderMailboxPermissionGrant[];
    requestedByEmail: string;
  }): Promise<ProviderProvisioningResult>;
  syncMailbox(args: {
    mailbox: MailboxRecord;
    limit?: number;
  }): Promise<ProviderSyncResult>;
  downloadAttachment(args: {
    mailbox: MailboxRecord;
    providerMessageId: string;
    providerAttachmentId: string;
    filename: string;
    mimeType: string;
  }): Promise<ProviderAttachmentDownloadResult>;
  archiveMessages(args: {
    mailbox: MailboxRecord;
    providerMessageIds: string[];
  }): Promise<ProviderMessageMutationResult>;
  markMessagesRead(args: {
    mailbox: MailboxRecord;
    providerMessageIds: string[];
    isRead: boolean;
  }): Promise<ProviderMessageMutationResult>;
  health(): Promise<{ ok: true; detail: string } | { ok: false; detail: string }>;
};
