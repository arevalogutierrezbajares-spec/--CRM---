import { describe, expect, it } from "vitest";
import {
  buildEmailAiDraft,
  buildEmailAiSummary,
  buildEmailWorkloadBriefing,
} from "@/lib/email/active-brain";
import type { EmailThreadDetail, EmailThreadListItem } from "@/db/queries/email";

const baseThread = {
  id: "thread-1",
  workspaceId: "workspace-1",
  mailboxId: "mailbox-1",
  providerThreadId: "provider-thread-1",
  subject: "CaneyCloud demo",
  status: "open",
  assignedToId: null,
  lastMessageAt: new Date("2026-06-07T12:00:00.000Z"),
  lastMessagePreview: "Can you send proposal slots for Friday?",
  isUnread: true,
  hasAttachments: false,
  snoozedUntil: null,
  createdAt: new Date("2026-06-07T12:00:00.000Z"),
  updatedAt: new Date("2026-06-07T12:00:00.000Z"),
  mailboxAddress: "sales@caneycloud.com",
  mailboxDisplayName: "Sales",
  mailboxType: "shared",
  assignedToName: null,
  lastMessageDirection: "inbound",
  lastProviderFolder: "inbox",
  lastSenderName: "Marta Lopez",
  lastSenderAddress: "marta@example.com",
  lastRecipientSummary: "sales@caneycloud.com",
  hasOutboundMessage: false,
  searchText: "Marta Lopez marta@example.com sales@caneycloud.com CaneyCloud demo",
  links: [{ id: "link-1", linkType: "contact", refId: "contact-1", label: "Marta Lopez" }],
} satisfies Omit<EmailThreadDetail, "messages" | "notes">;

describe("email Active Brain helpers", () => {
  it("builds cited summaries and editable draft text", () => {
    const thread: EmailThreadDetail = {
      ...baseThread,
      notes: [],
      messages: [
        {
          id: "message-1",
          workspaceId: "workspace-1",
          threadId: "thread-1",
          mailboxId: "mailbox-1",
          providerMessageId: "provider-message-1",
          internetMessageId: "<message-1@example.com>",
          direction: "inbound",
          fromAddress: "marta@example.com",
          fromName: "Marta Lopez",
          toRecipients: ["sales@caneycloud.com"],
          ccRecipients: [],
          bccRecipients: [],
          subject: "CaneyCloud demo",
          bodyText: "Can you send a proposal and available slots for Friday?",
          bodyHtml: null,
          sentAt: null,
          receivedAt: new Date("2026-06-07T12:00:00.000Z"),
          isRead: false,
          providerFolder: "inbox",
          inReplyTo: null,
          createdAt: new Date("2026-06-07T12:00:00.000Z"),
          attachments: [],
        },
      ],
    };

    const summary = buildEmailAiSummary(thread);
    expect(summary.summary).toContain("Marta Lopez");
    expect(summary.openQuestions).toEqual(["Can you send a proposal and available slots for Friday?"]);
    expect(summary.citations).toEqual([
      expect.objectContaining({ messageId: "message-1", label: expect.stringContaining("M1") }),
    ]);
    expect(buildEmailAiDraft(thread, summary)).toContain("Hi Marta,");
  });

  it("builds workload briefing counts from permitted thread rows", () => {
    const rows: EmailThreadListItem[] = [
      { ...baseThread, id: "a", assignedToId: "user-1", lastMessageAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      { ...baseThread, id: "b", status: "waiting", assignedToId: "user-1" },
      { ...baseThread, id: "c", mailboxType: "shared", assignedToId: null },
    ];
    const briefing = buildEmailWorkloadBriefing(rows, "user-1");
    expect(briefing.overdueReplies).toBeGreaterThanOrEqual(1);
    expect(briefing.waitingThreads).toBe(1);
    expect(briefing.unassignedSharedThreads).toBeGreaterThanOrEqual(1);
  });
});
