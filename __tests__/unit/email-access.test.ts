import { describe, expect, it } from "vitest";
import { canProviderSendAs, resolveMailboxRights } from "@/lib/email/access";
import type { MailboxRecord } from "@/lib/email/types";

const baseMailbox: MailboxRecord = {
  id: "mailbox-1",
  workspaceId: "workspace-1",
  address: "sales@caneycloud.com",
  displayName: "Sales",
  type: "shared",
  status: "active",
  ownerUserId: null,
  syncEnabled: true,
  sendEnabled: true,
  aiEnabled: true,
  providerMetadata: {},
};

describe("email access model", () => {
  it("gives workspace owner full rights on active mailboxes", () => {
    const rights = resolveMailboxRights({
      user: { id: "owner", workspaceRole: "owner" },
      mailbox: baseMailbox,
    });
    expect(rights).toMatchObject({
      canView: true,
      canReply: true,
      canSendAs: true,
      canAssign: true,
      canManageAccess: true,
      canManageSettings: true,
    });
  });

  it("lets personal mailbox owner use their own mailbox without manage-access rights", () => {
    const rights = resolveMailboxRights({
      user: { id: "ana", workspaceRole: "member" },
      mailbox: { ...baseMailbox, type: "personal", ownerUserId: "ana" },
    });
    expect(rights.canView).toBe(true);
    expect(rights.canSendAs).toBe(true);
    expect(rights.canManageAccess).toBe(false);
    expect(rights.canManageSettings).toBe(true);
  });

  it("uses explicit grants for shared mailbox members", () => {
    const rights = resolveMailboxRights({
      user: { id: "diego", workspaceRole: "member" },
      mailbox: baseMailbox,
      grant: {
        mailboxId: baseMailbox.id,
        userId: "diego",
        canView: true,
        canReply: true,
        canSendAs: false,
        canAssign: true,
        canManageAccess: false,
        canManageSettings: false,
      },
    });
    expect(rights.canView).toBe(true);
    expect(rights.canReply).toBe(true);
    expect(rights.canSendAs).toBe(false);
    expect(rights.canAssign).toBe(true);
  });

  it("removes all rights for deactivated mailboxes", () => {
    const rights = resolveMailboxRights({
      user: { id: "owner", workspaceRole: "owner" },
      mailbox: { ...baseMailbox, status: "deactivated" },
    });
    expect(Object.values(rights).every((v) => !v)).toBe(true);
  });

  it("enforces provider send-as denial separately from CRM rights", () => {
    expect(canProviderSendAs(baseMailbox, "diego")).toBe(true);
    expect(canProviderSendAs({ ...baseMailbox, providerMetadata: { sendAsDeniedUserIds: ["diego"] } }, "diego")).toBe(false);
    expect(canProviderSendAs({ ...baseMailbox, providerMetadata: { sendAsDeniedUserIds: ["*"] } }, "owner")).toBe(false);
  });
});
