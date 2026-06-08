import type { EmailMessageView, EmailThreadDetail, EmailThreadListItem } from "@/db/queries/email";

export type EmailAiCitation = {
  messageId: string;
  label: string;
  sentAt: string | null;
};

export type EmailAiSummary = {
  summary: string;
  openQuestions: string[];
  nextAction: string;
  citations: EmailAiCitation[];
};

export type EmailWorkloadBriefing = {
  overdueReplies: number;
  waitingThreads: number;
  unassignedSharedThreads: number;
  topNextActions: string[];
};

function messageTime(message: EmailMessageView) {
  return message.sentAt ?? message.receivedAt ?? message.createdAt;
}

function citationFor(message: EmailMessageView, index: number): EmailAiCitation {
  const time = messageTime(message);
  return {
    messageId: message.id,
    label: `M${index + 1} · ${time.toISOString()}`,
    sentAt: time.toISOString(),
  };
}

function sentence(value: string | null | undefined) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const first = text.match(/[^.!?]+[.!?]?/)?.[0]?.trim() ?? text;
  return first.length > 220 ? `${first.slice(0, 217)}...` : first;
}

function questionLines(messages: EmailMessageView[]) {
  const questions = messages
    .flatMap((message) => message.bodyText.match(/[^.!?]*\?/g) ?? [])
    .map((question) => question.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (questions.length > 0) return questions.slice(0, 3);
  return ["Confirm owner, timeline, and next required response before sending."];
}

export function buildEmailAiSummary(thread: EmailThreadDetail): EmailAiSummary {
  const messages = thread.messages.slice(-4);
  const latest = messages[messages.length - 1] ?? thread.messages[thread.messages.length - 1];
  const inbound = [...thread.messages].reverse().find((message) => message.direction === "inbound");
  const citations = messages.map(citationFor);
  const summarySource = sentence(latest?.bodyText) || thread.lastMessagePreview || thread.subject;
  const sender = inbound?.fromName ?? inbound?.fromAddress ?? "the sender";
  const links = thread.links.map((link) => link.label).slice(0, 2);
  return {
    summary: `${sender} is discussing "${thread.subject}". Latest signal: ${summarySource}`,
    openQuestions: questionLines(messages),
    nextAction:
      thread.status === "waiting"
        ? "Keep this in Waiting until the external dependency or answer arrives."
        : links.length > 0
          ? `Reply with the next concrete step and keep ${links.join(" / ")} updated.`
          : "Reply with a concrete next step, then link the thread to a Contact or Project.",
    citations,
  };
}

export function buildEmailAiDraft(thread: EmailThreadDetail, summary: EmailAiSummary) {
  const inbound = [...thread.messages].reverse().find((message) => message.direction === "inbound");
  const name = inbound?.fromName?.split(" ")[0] || inbound?.fromAddress?.split("@")[0] || "there";
  return [
    `Hi ${name},`,
    "",
    "Thanks for the context. I reviewed the thread and can move this forward from here.",
    "",
    summary.nextAction,
    "",
    "I will keep this tracked in AGB CRM and follow up with the next concrete step.",
  ].join("\n");
}

export function buildEmailWorkloadBriefing(threads: EmailThreadListItem[], userId: string): EmailWorkloadBriefing {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const owned = threads.filter((thread) => thread.assignedToId === userId || !thread.assignedToId);
  const overdueReplies = owned.filter(
    (thread) =>
      thread.status === "open" &&
      thread.isUnread &&
      now - thread.lastMessageAt.getTime() > dayMs,
  ).length;
  const waitingThreads = owned.filter((thread) => thread.status === "waiting").length;
  const unassignedSharedThreads = threads.filter(
    (thread) => thread.mailboxType === "shared" && !thread.assignedToId && thread.status !== "done",
  ).length;
  const topNextActions = threads
    .filter((thread) => thread.status !== "done")
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
    .slice(0, 3)
    .map((thread) =>
      thread.assignedToId === userId
        ? `Reply to assigned thread: ${thread.subject}`
        : !thread.assignedToId
          ? `Assign or triage: ${thread.subject}`
          : `Monitor: ${thread.subject}`,
    );
  return { overdueReplies, waitingThreads, unassignedSharedThreads, topNextActions };
}
