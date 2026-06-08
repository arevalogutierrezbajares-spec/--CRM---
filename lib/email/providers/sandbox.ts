import { canProviderSendAs } from "@/lib/email/access";
import type { EmailProvider } from "@/lib/email/types";

export const sandboxEmailProvider: EmailProvider = {
  kind: "sandbox",
  async send({ user, mailbox, input }) {
    if (!mailbox.sendEnabled) {
      return { ok: false, error: "Sending is disabled for this mailbox." };
    }
    if (!canProviderSendAs(mailbox, user.id)) {
      return {
        ok: false,
        error:
          "Microsoft 365 Send As permission is missing for this mailbox. Grant Send As in Exchange, then retry.",
        providerStatus: 403,
      };
    }
    if (input.to.length === 0) {
      return { ok: false, error: "Add at least one recipient before sending." };
    }
    return {
      ok: true,
      providerMessageId: `sandbox-sent-${input.idempotencyKey}`,
      sentAt: new Date(),
    };
  },
  async listMailboxes() {
    return { ok: true, mailboxes: [] };
  },
  async provisionSharedMailbox({ address, displayName }) {
    return {
      ok: true,
      mode: "completed",
      message: `Sandbox shared mailbox ${address} created.`,
      mailbox: {
        providerMailboxId: `sandbox:${address}`,
        address,
        displayName,
        typeHint: "shared",
      },
      metadata: {
        provider: "sandbox",
        fullAccessReady: true,
        sendAsReady: true,
      },
    };
  },
  async provisionTeamMemberMailbox({ email, displayName }) {
    return {
      ok: true,
      mode: "completed",
      message: `Sandbox team mailbox ${email} created.`,
      mailbox: {
        providerMailboxId: `sandbox:${email}`,
        address: email,
        displayName,
        typeHint: "personal",
      },
      providerUserId: `sandbox-user:${email}`,
      metadata: {
        provider: "sandbox",
        userReady: true,
        licenseReady: true,
        mailboxReady: true,
      },
    };
  },
  async applyMailboxPermissions({ mailboxAddress, grants }) {
    return {
      ok: true,
      mode: "completed",
      message: `Sandbox permissions mirrored for ${mailboxAddress}.`,
      metadata: {
        provider: "sandbox",
        mailboxAddress,
        grantCount: grants.length,
        grants,
      },
    };
  },
  async syncMailbox() {
    return { ok: true, messages: [] };
  },
  async downloadAttachment({ filename, mimeType, providerAttachmentId }) {
    return {
      ok: true,
      filename,
      mimeType,
      content: new TextEncoder().encode(
        `Sandbox attachment ${filename}\nProvider attachment id: ${providerAttachmentId}\n`,
      ),
    };
  },
  async archiveMessages({ providerMessageIds }) {
    return { ok: true, changed: providerMessageIds.length };
  },
  async markMessagesRead({ providerMessageIds }) {
    return { ok: true, changed: providerMessageIds.length };
  },
  async health() {
    return { ok: true, detail: "Sandbox provider ready." };
  },
};
