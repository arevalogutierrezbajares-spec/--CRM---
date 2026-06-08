import type { SessionUser } from "@/lib/current-user";
import type { MailboxRecord, MailboxRights } from "./types";
import { EMPTY_RIGHTS, FULL_RIGHTS } from "./types";

type GrantLike = {
  mailboxId: string;
  userId: string;
  canView: boolean;
  canReply: boolean;
  canSendAs: boolean;
  canAssign: boolean;
  canManageAccess: boolean;
  canManageSettings: boolean;
};

export function resolveMailboxRights(args: {
  user: Pick<SessionUser, "id" | "workspaceRole">;
  mailbox: Pick<MailboxRecord, "id" | "type" | "ownerUserId" | "sendEnabled" | "syncEnabled" | "status">;
  grant?: GrantLike | null;
}): MailboxRights {
  const { user, mailbox, grant } = args;
  if (mailbox.status === "deactivated") return EMPTY_RIGHTS;

  if (user.workspaceRole === "owner") {
    return {
      ...FULL_RIGHTS,
      canReply: mailbox.sendEnabled,
      canSendAs: mailbox.sendEnabled,
      canManageSettings: true,
      canManageAccess: true,
    };
  }

  if (mailbox.type === "personal" && mailbox.ownerUserId === user.id) {
    return {
      canView: mailbox.syncEnabled,
      canReply: mailbox.sendEnabled,
      canSendAs: mailbox.sendEnabled,
      canAssign: true,
      canManageAccess: false,
      canManageSettings: true,
    };
  }

  if (!grant) return EMPTY_RIGHTS;

  return {
    canView: grant.canView && mailbox.syncEnabled,
    canReply: grant.canReply && mailbox.sendEnabled,
    canSendAs: grant.canSendAs && mailbox.sendEnabled,
    canAssign: grant.canAssign,
    canManageAccess: grant.canManageAccess,
    canManageSettings: grant.canManageSettings,
  };
}

export function canProviderSendAs(mailbox: MailboxRecord, userId: string): boolean {
  const denied = mailbox.providerMetadata?.sendAsDeniedUserIds ?? [];
  return !denied.includes("*") && !denied.includes(userId);
}

export function hasAnyRight(rights: MailboxRights): boolean {
  return Object.values(rights).some(Boolean);
}
