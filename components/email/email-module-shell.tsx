"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Inbox,
  KeyRound,
  Loader2,
  Mail,
  MailCheck,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Reply,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { EmailModuleData, EmailThreadListItem } from "@/db/queries/email";
import { relativeTime, splitEmails } from "@/lib/email/format";
import {
  addEmailInternalNoteAction,
  archiveEmailThreadAction,
  assignEmailThreadAction,
  bulkUpdateEmailThreadsAction,
  checkProvisioningRequestAction,
  classifyMailboxAction,
  connectMicrosoftProviderAction,
  connectZohoProviderAction,
  createActionItemFromEmailThreadAction,
  createContactFromEmailThreadAction,
  discardEmailDraftAction,
  exportEmailAuditAction,
  generateEmailActiveBrainAction,
  getEmailWorkloadBriefingAction,
  grantMailboxAccessAction,
  importMicrosoftMailboxesAction,
  importZohoMailboxesAction,
  initializeSandboxEmailAction,
  linkEmailThreadToContactAction,
  linkEmailThreadToInitiativeAction,
  linkEmailThreadToMilestoneAction,
  linkEmailThreadToProjectAction,
  logEmailThreadTouchAction,
  provisionSharedInboxAction,
  provisionTeamMemberMailboxAction,
  recordOwnerMailboxAccessAction,
  saveEmailDraftAction,
  sendEmailAction,
  setEmailThreadReadStateAction,
  setMailboxOperationalStateAction,
  syncSandboxMailboxAction,
  updateEmailThreadStatusAction,
  updateMailboxSignatureAction,
} from "@/app/(app)/email/actions";

type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "member";
};

type ViewFilter = "all" | "mine" | "unassigned" | "unread" | "open" | "waiting" | "done" | "sent" | "snoozed" | "drafts";
type ViewCounts = Record<ViewFilter, number>;
type ActiveBrainSummary = Extract<Awaited<ReturnType<typeof generateEmailActiveBrainAction>>, { ok: true }>["summary"];
type WorkloadBriefing = Extract<Awaited<ReturnType<typeof getEmailWorkloadBriefingAction>>, { ok: true }>["briefing"];
const EMAIL_SYNC_STALE_MS = 30 * 60 * 1000;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatFutureTime(value: Date | string) {
  const minutes = Math.ceil((new Date(value).getTime() - Date.now()) / 60000);
  if (minutes <= 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
}

function mailboxSyncIssue(mailbox: EmailModuleData["mailboxes"][number]) {
  if (!mailbox.syncEnabled) return null;
  if (mailbox.lastSyncError) return `Sync error: ${mailbox.lastSyncError}`;
  if (!mailbox.lastSyncedAt && mailbox.threadCount > 0) return "Provider sync has not run since this mailbox was seeded.";
  if (!mailbox.lastSyncedAt) return null;
  const ageMs = Date.now() - new Date(mailbox.lastSyncedAt).getTime();
  if (ageMs > EMAIL_SYNC_STALE_MS) return `Last sync ${relativeTime(mailbox.lastSyncedAt)} ago.`;
  return null;
}

function mailboxSyncIssues(mailboxes: EmailModuleData["mailboxes"]) {
  return mailboxes
    .map((mailbox) => ({ mailbox, issue: mailboxSyncIssue(mailbox) }))
    .filter((item): item is { mailbox: EmailModuleData["mailboxes"][number]; issue: string } => Boolean(item.issue));
}

function providerStatusIssue(provider: EmailModuleData["provider"]) {
  if (!provider || provider.status === "connected") return null;
  return `Provider ${provider.status}: cached mail is readable, but send, sync, archive, and read-state changes are disabled.`;
}

function providerLabel(provider?: EmailModuleData["provider"] | null) {
  if (!provider) return "No provider";
  if (provider.provider === "microsoft_365") return "Microsoft 365";
  if (provider.provider === "zoho_mail") return "Zoho Mail";
  return "Sandbox";
}

export function EmailModuleShell({
  initialData,
  currentUser,
}: {
  initialData: EmailModuleData;
  currentUser: CurrentUser;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [mailboxFilter, setMailboxFilter] = useState("all");
  const [view, setView] = useState<ViewFilter>("all");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"mail" | "settings">("mail");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [composeMailboxId, setComposeMailboxId] = useState<string | null>(null);
  const [composeDraftId, setComposeDraftId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setData(initialData));
    return () => cancelAnimationFrame(raf);
  }, [initialData]);

  const selectedThread = data.selectedThread;
  const selectedMailbox = selectedThread
    ? data.mailboxes.find((m) => m.id === selectedThread.mailboxId) ?? null
    : null;
  const composeMailbox = composeMailboxId ? data.mailboxes.find((m) => m.id === composeMailboxId) ?? null : null;
  const composeDraft = composeDraftId ? data.drafts.find((draft) => draft.id === composeDraftId) ?? null : null;
  const providerIssue = providerStatusIssue(data.provider);
  const providerOnline = !providerIssue;

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (view === "drafts") return [];
    return data.threads.filter((thread) => {
      if (mailboxFilter !== "all" && thread.mailboxId !== mailboxFilter) return false;
      if (view === "mine" && thread.assignedToId !== currentUser.id) return false;
      if (view === "unassigned" && thread.assignedToId) return false;
      if (view === "unread" && !thread.isUnread) return false;
      if (view === "open" && thread.status !== "open") return false;
      if (view === "waiting" && thread.status !== "waiting") return false;
      if (view === "done" && thread.status !== "done") return false;
      if (view === "sent" && !thread.hasOutboundMessage) return false;
      if (view === "snoozed" && thread.status !== "snoozed") return false;
      if (!q) return true;
      return [
        thread.subject,
        thread.lastMessagePreview ?? "",
        thread.mailboxAddress,
        thread.lastSenderName ?? "",
        thread.lastSenderAddress ?? "",
        thread.lastRecipientSummary ?? "",
        thread.lastProviderFolder ?? "",
        thread.lastMessageDirection ?? "",
        thread.assignedToName ?? "",
        thread.searchText,
        ...thread.links.map((l) => l.label),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [currentUser.id, data.threads, mailboxFilter, query, view]);

  const filteredDrafts = useMemo(() => {
    if (view !== "drafts") return [];
    const q = query.trim().toLowerCase();
    return data.drafts.filter((draft) => {
      if (mailboxFilter !== "all" && draft.mailboxId !== mailboxFilter) return false;
      if (!q) return true;
      return [
        draft.subject,
        draft.bodyText,
        draft.mailboxAddress,
        draft.toRecipients.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data.drafts, mailboxFilter, query, view]);

  const visibleSelectedIds = useMemo(() => {
    const visible = new Set(filteredThreads.map((thread) => thread.id));
    return new Set([...selectedIds].filter((id) => visible.has(id)));
  }, [filteredThreads, selectedIds]);

  const counts = useMemo(() => {
    return {
      all: data.threads.length,
      mine: data.threads.filter((t) => t.assignedToId === currentUser.id).length,
      unassigned: data.threads.filter((t) => !t.assignedToId).length,
      unread: data.threads.filter((t) => t.isUnread).length,
      open: data.threads.filter((t) => t.status === "open").length,
      waiting: data.threads.filter((t) => t.status === "waiting").length,
      done: data.threads.filter((t) => t.status === "done").length,
      sent: data.threads.filter((t) => t.hasOutboundMessage).length,
      snoozed: data.threads.filter((t) => t.status === "snoozed").length,
      drafts: data.drafts.length,
    };
  }, [currentUser.id, data.drafts.length, data.threads]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const run = useCallback((action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? success ?? "Updated");
        refresh();
      } else {
        toast.error(result.error ?? "Email action failed");
        refresh();
      }
    });
  }, [refresh]);

  const bulkUpdate = useCallback(
    (updates: { status?: "open" | "waiting" | "done" | "snoozed"; assigneeUserId?: string | null }) => {
      const threadIds = [...visibleSelectedIds];
      if (threadIds.length === 0) return;
      const assigneeName =
        updates.assigneeUserId === undefined
          ? undefined
          : data.members.find((member) => member.userId === updates.assigneeUserId)?.displayName ?? null;
      setData((prev) => ({
        ...prev,
        threads: prev.threads.map((thread) =>
          visibleSelectedIds.has(thread.id)
            ? {
                ...thread,
                ...(updates.status ? { status: updates.status } : {}),
                ...(updates.assigneeUserId !== undefined
                  ? { assignedToId: updates.assigneeUserId, assignedToName: assigneeName }
                  : {}),
              }
            : thread,
        ),
        selectedThread:
          prev.selectedThread && visibleSelectedIds.has(prev.selectedThread.id)
            ? {
                ...prev.selectedThread,
                ...(updates.status ? { status: updates.status } : {}),
                ...(updates.assigneeUserId !== undefined
                  ? { assignedToId: updates.assigneeUserId, assignedToName: assigneeName }
                  : {}),
              }
            : prev.selectedThread,
      }));
      run(
        () =>
          bulkUpdateEmailThreadsAction({
            threadIds,
            status: updates.status,
            assigneeUserId: updates.assigneeUserId,
          }),
        "Bulk update complete",
      );
      setSelectedIds(new Set());
    },
    [data.members, run, visibleSelectedIds],
  );

  useEffect(() => {
    function isTextInput(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;
    }

    function setSelectedStatus(status: "open" | "waiting" | "done" | "snoozed") {
      if (!selectedThread) return;
      setData((prev) => ({
        ...prev,
        threads: prev.threads.map((thread) =>
          thread.id === selectedThread.id ? { ...thread, status } : thread,
        ),
        selectedThread: prev.selectedThread ? { ...prev.selectedThread, status } : prev.selectedThread,
      }));
      run(() => updateEmailThreadStatusAction(selectedThread.id, status));
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTextInput(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        setMode((value) => (value === "settings" ? "mail" : "settings"));
        return;
      }
      if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        setSelectedStatus("done");
        return;
      }
      if (event.key.toLowerCase() === "u") {
        event.preventDefault();
        if (!selectedThread) return;
        if (!providerOnline) {
          toast.error("Provider is unavailable. Cached mail is readable, but read-state changes are disabled.");
          return;
        }
        setData((prev) => ({
          ...prev,
          threads: prev.threads.map((thread) =>
            thread.id === selectedThread.id ? { ...thread, isUnread: !thread.isUnread } : thread,
          ),
          selectedThread: prev.selectedThread
            ? { ...prev.selectedThread, isUnread: !prev.selectedThread.isUnread }
            : prev.selectedThread,
        }));
        run(() => setEmailThreadReadStateAction({ threadId: selectedThread.id, isUnread: !selectedThread.isUnread }));
        return;
      }
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (!selectedThread) return;
        if (!providerOnline) {
          toast.error("Provider is unavailable. Cached mail is readable, but archive is disabled.");
          return;
        }
        setData((prev) => ({
          ...prev,
          threads: prev.threads.map((thread) =>
            thread.id === selectedThread.id ? { ...thread, status: "done", isUnread: false } : thread,
          ),
          selectedThread: prev.selectedThread
            ? { ...prev.selectedThread, status: "done", isUnread: false }
            : prev.selectedThread,
        }));
        run(() => archiveEmailThreadAction(selectedThread.id), "Thread archived");
        return;
      }
      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        setSelectedStatus("waiting");
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        setSelectedStatus("snoozed");
        return;
      }
      if (event.key.toLowerCase() !== "j" && event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      const selectedIndex = filteredThreads.findIndex((thread) => thread.id === selectedThread?.id);
      const fallbackIndex = selectedIndex === -1 ? 0 : selectedIndex;
      const nextIndex =
        event.key.toLowerCase() === "j"
          ? Math.min(fallbackIndex + 1, filteredThreads.length - 1)
          : Math.max(fallbackIndex - 1, 0);
      const nextThread = filteredThreads[nextIndex];
      if (nextThread && nextThread.id !== selectedThread?.id) {
        router.push(`/email?thread=${nextThread.id}`);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredThreads, providerOnline, router, run, selectedThread]);

  function exportAudit() {
    startTransition(async () => {
      const result = await exportEmailAuditAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Email audit exported");
      refresh();
    });
  }

  if (!data.setupComplete) {
    return (
      <SetupWizard
        isPending={isPending}
        onSandbox={() => run(initializeSandboxEmailAction, "Sandbox email seeded")}
        onMicrosoft={() => run(connectMicrosoftProviderAction, "Microsoft 365 connected")}
        onZoho={() => run(connectZohoProviderAction, "Zoho Mail connected")}
      />
    );
  }

  return (
    <main className="h-[calc(100vh-3.5rem)] overflow-hidden bg-[var(--background)]">
      <div className="flex h-full flex-col lg:grid lg:grid-cols-[236px_minmax(320px,420px)_minmax(0,1fr)]">
        <MailboxRail
          data={data}
          mailboxFilter={mailboxFilter}
          view={view}
          counts={counts}
          mode={mode}
          isPending={isPending}
          onMailbox={(id) => {
            setMailboxFilter(id);
            setSelectedIds(new Set());
          }}
          onView={(nextView) => {
            setView(nextView);
            setSelectedIds(new Set());
          }}
          onMode={setMode}
          onCompose={() => {
            const mailbox =
              mailboxFilter !== "all"
                ? data.mailboxes.find((item) => item.id === mailboxFilter)
                : data.mailboxes.find((item) => item.rights.canReply && item.rights.canSendAs);
            if (!mailbox) {
              toast.error("Choose a mailbox you can send from.");
              return;
            }
            setMode("mail");
            setComposeMailboxId(mailbox.id);
            setComposeDraftId(null);
          }}
          onSync={() => run(() => syncSandboxMailboxAction(mailboxFilter === "all" ? undefined : mailboxFilter))}
        />

        <section className="min-h-0 border-r border-[var(--border)] lg:flex lg:flex-col">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search mail"
                className="h-9 w-full rounded-md border border-[var(--border)] bg-card pl-8 pr-2 text-[13px] outline-none focus:border-[var(--blue-text)]"
              />
            </div>
            <button
              type="button"
              onClick={() => setMode(mode === "settings" ? "mail" : "settings")}
              className={cx(
                "grid h-9 w-9 place-items-center rounded-md border border-[var(--border)] text-text-secondary hover:bg-surface",
                mode === "settings" && "bg-surface text-text-primary",
              )}
              aria-label="Email settings"
              title="Email settings"
            >
              <Settings size={16} />
            </button>
          </div>
          {providerIssue && (
            <div className="border-b border-amber-300/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700">
              {providerIssue}
            </div>
          )}
          {mode === "settings" ? (
            <SettingsPane
              data={data}
              currentUser={currentUser}
              isPending={isPending}
              run={run}
            />
          ) : view === "drafts" ? (
            <DraftList
              drafts={filteredDrafts}
              onOpen={(draft) => {
                if (draft.threadId) {
                  router.push(`/email?thread=${draft.threadId}`);
                  return;
                }
                setComposeMailboxId(draft.mailboxId);
                setComposeDraftId(draft.id);
              }}
            />
          ) : (
            <ThreadList
              threads={filteredThreads}
              selectedId={selectedThread?.id ?? null}
              selectedIds={visibleSelectedIds}
              members={data.members}
              providerOnline={providerOnline}
              onSelect={(threadId) => router.push(`/email?thread=${threadId}`)}
              onToggleSelected={(threadId, selected) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (selected) next.add(threadId);
                  else next.delete(threadId);
                  return next;
                });
              }}
              onSelectAll={(checked) => {
                setSelectedIds(checked ? new Set(filteredThreads.map((thread) => thread.id)) : new Set());
              }}
              onBulk={bulkUpdate}
              onStatus={(threadId, status) => {
                setData((prev) => ({
                  ...prev,
                  threads: prev.threads.map((t) => (t.id === threadId ? { ...t, status } : t)),
                }));
                run(() => updateEmailThreadStatusAction(threadId, status));
              }}
              onReadState={(threadId, isUnread) => {
                setData((prev) => ({
                  ...prev,
                  threads: prev.threads.map((t) => (t.id === threadId ? { ...t, isUnread } : t)),
                  selectedThread:
                    prev.selectedThread?.id === threadId
                      ? { ...prev.selectedThread, isUnread }
                      : prev.selectedThread,
                }));
                run(() => setEmailThreadReadStateAction({ threadId, isUnread }));
              }}
              onArchive={(threadId) => {
                setData((prev) => ({
                  ...prev,
                  threads: prev.threads.map((t) =>
                    t.id === threadId ? { ...t, status: "done", isUnread: false } : t,
                  ),
                  selectedThread:
                    prev.selectedThread?.id === threadId
                      ? { ...prev.selectedThread, status: "done", isUnread: false }
                      : prev.selectedThread,
                }));
                run(() => archiveEmailThreadAction(threadId), "Thread archived");
              }}
            />
          )}
        </section>

        {mode === "settings" ? (
          <OperationsPane data={data} isPending={isPending} run={run} onExportAudit={exportAudit} />
        ) : composeMailbox ? (
          <NewMessagePane
            mailbox={composeMailbox}
            draft={composeDraft}
            providerOnline={providerOnline}
            isPending={isPending}
            run={run}
            onClose={() => {
              setComposeMailboxId(null);
              setComposeDraftId(null);
            }}
          />
        ) : (
          <ReaderPane
            key={selectedThread?.id ?? "empty"}
            data={data}
            currentUser={currentUser}
            thread={selectedThread}
            mailbox={selectedMailbox}
            providerOnline={providerOnline}
            isPending={isPending}
            run={run}
            onAssign={(thread, assignee) => {
              setData((prev) => ({
                ...prev,
                threads: prev.threads.map((t) =>
                  t.id === thread.id ? { ...t, assignedToId: assignee, assignedToName: data.members.find((m) => m.userId === assignee)?.displayName ?? null } : t,
                ),
              }));
              run(() => assignEmailThreadAction(thread.id, assignee));
            }}
          />
        )}
      </div>
    </main>
  );
}

function SetupWizard({
  isPending,
  onSandbox,
  onMicrosoft,
  onZoho,
}: {
  isPending: boolean;
  onSandbox: () => void;
  onMicrosoft: () => void;
  onZoho: () => void;
}) {
  const steps = [
    "Connect Zoho Mail, Microsoft 365, or load provider sandbox",
    "Register personal and shared mailboxes",
    "Grant access for sales, ops, and support inboxes",
    "Run test inbound, outbound, permission, and outage flows",
  ];
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl items-center px-4 py-8">
      <section className="w-full rounded-lg border border-[var(--border)] bg-card p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-tiny font-semibold uppercase tracking-wide text-text-tertiary">Email setup</p>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-text-primary">
              Company inboxes, inside AGB CRM
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-text-secondary">
              Start with Zoho Mail Free for a low-cost production provider, use Microsoft 365 later if you need deeper
              enterprise permission automation, or load the sandbox for local testing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSandbox}
              disabled={isPending}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-text-primary px-3 text-[13px] font-medium text-[var(--background)] disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Load sandbox
            </button>
            <button
              type="button"
              onClick={onMicrosoft}
              disabled={isPending}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-[13px] text-text-secondary hover:bg-surface disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" />
              Connect Microsoft
            </button>
            <button
              type="button"
              onClick={onZoho}
              disabled={isPending}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-[13px] text-text-secondary hover:bg-surface disabled:opacity-60"
            >
              <MailCheck className="h-4 w-4" />
              Connect Zoho Free
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((step, i) => (
            <div key={step} className="flex gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-tiny font-semibold">
                {i + 1}
              </span>
              <p className="text-[13px] text-text-secondary">{step}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function MailboxRail({
  data,
  mailboxFilter,
  view,
  counts,
  mode,
  isPending,
  onMailbox,
  onView,
  onMode,
  onCompose,
  onSync,
}: {
  data: EmailModuleData;
  mailboxFilter: string;
  view: ViewFilter;
  counts: ViewCounts;
  mode: "mail" | "settings";
  isPending: boolean;
  onMailbox: (id: string) => void;
  onView: (view: ViewFilter) => void;
  onMode: (mode: "mail" | "settings") => void;
  onCompose: () => void;
  onSync: () => void;
}) {
  const syncIssues = mailboxSyncIssues(data.mailboxes);
  const providerIssue = providerStatusIssue(data.provider);
  const views: Array<{ id: ViewFilter; label: string; icon: typeof Inbox }> = [
    { id: "all", label: "All mail", icon: Inbox },
    { id: "mine", label: "Assigned to me", icon: MailCheck },
    { id: "unassigned", label: "Unassigned", icon: Users },
    { id: "unread", label: "Unread", icon: Mail },
    { id: "open", label: "Open", icon: MessageSquare },
    { id: "waiting", label: "Waiting", icon: AlertTriangle },
    { id: "done", label: "Done", icon: Check },
    { id: "sent", label: "Sent", icon: Send },
    { id: "snoozed", label: "Snoozed", icon: Clock },
    { id: "drafts", label: "Drafts", icon: FileText },
  ];
  return (
    <aside className="min-h-0 border-b border-[var(--border)] bg-card lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">Email</p>
          <p className="truncate text-tiny text-text-tertiary">
            {providerLabel(data.provider)} · {data.provider?.domain ?? "not connected"}
          </p>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={isPending || Boolean(providerIssue)}
          className="grid h-8 w-8 place-items-center rounded-md text-text-tertiary hover:bg-surface hover:text-text-primary disabled:opacity-60"
          aria-label="Sync email"
          title={providerIssue ?? "Sync email"}
        >
          <RefreshCw size={15} className={isPending ? "animate-spin" : ""} />
        </button>
      </div>
      {syncIssues.length > 0 && (
        <div className="border-b border-[var(--border)] px-3 py-2">
          <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-500/10 p-2 text-[12px] text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">
              {syncIssues.length} mailbox{syncIssues.length === 1 ? "" : "es"} need sync attention · {syncIssues[0].mailbox.address}
            </span>
          </div>
        </div>
      )}
      <div className="border-b border-[var(--border)] px-3 py-2">
        <button
          type="button"
          onClick={onCompose}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-text-primary px-3 text-[13px] font-medium text-[var(--background)]"
        >
          <Send size={14} /> Compose
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 py-2 lg:block lg:space-y-4 lg:overflow-visible">
        <div className="flex shrink-0 gap-1 lg:block lg:space-y-1">
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onView(id);
                onMode("mail");
              }}
              className={cx(
                "flex h-9 min-w-max items-center gap-2 rounded-md px-2.5 text-[12.5px] lg:w-full",
                view === id && mode === "mail" ? "bg-surface text-text-primary" : "text-text-secondary hover:bg-surface",
              )}
            >
              <Icon size={14} />
              <span>{label}</span>
              <span className="ml-auto rounded bg-[var(--background)] px-1.5 text-tiny text-text-tertiary">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="min-w-[220px] shrink-0 lg:min-w-0">
          <p className="mb-1.5 px-1 text-tiny font-semibold uppercase tracking-wide text-text-tertiary">Mailboxes</p>
          <button
            type="button"
            onClick={() => onMailbox("all")}
            className={cx(
              "mb-1 flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12.5px]",
              mailboxFilter === "all" ? "bg-surface text-text-primary" : "text-text-secondary hover:bg-surface",
            )}
          >
            <Mail size={14} />
            <span className="min-w-0 flex-1 truncate">All accessible</span>
            <span className="text-tiny text-text-tertiary">{data.threads.length}</span>
          </button>
          <div className="space-y-1">
            {data.mailboxes.map((mailbox) => (
              <MailboxButton
                key={mailbox.id}
                mailbox={mailbox}
                selected={mailboxFilter === mailbox.id}
                issue={mailboxSyncIssue(mailbox)}
                onClick={() => onMailbox(mailbox.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function MailboxButton({
  mailbox,
  selected,
  issue,
  onClick,
}: {
  mailbox: EmailModuleData["mailboxes"][number];
  selected: boolean;
  issue: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12.5px]",
        selected ? "bg-surface text-text-primary" : "text-text-secondary hover:bg-surface",
      )}
    >
      <span className={cx("h-2 w-2 rounded-full", mailbox.type === "personal" ? "bg-[var(--blue-text)]" : "bg-amber-mid")} />
      <span className="min-w-0 flex-1 truncate">{mailbox.address}</span>
      {issue && <AlertTriangle size={12} className="shrink-0 text-amber-700" aria-label={issue} />}
      <span className="text-tiny text-text-tertiary">{mailbox.unreadCount}</span>
    </button>
  );
}

function ThreadList({
  threads,
  selectedId,
  selectedIds,
  members,
  providerOnline,
  onSelect,
  onToggleSelected,
  onSelectAll,
  onBulk,
  onStatus,
  onReadState,
  onArchive,
}: {
  threads: EmailThreadListItem[];
  selectedId: string | null;
  selectedIds: Set<string>;
  members: EmailModuleData["members"];
  providerOnline: boolean;
  onSelect: (threadId: string) => void;
  onToggleSelected: (threadId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onBulk: (updates: { status?: "open" | "waiting" | "done" | "snoozed"; assigneeUserId?: string | null }) => void;
  onStatus: (threadId: string, status: "open" | "waiting" | "done" | "snoozed") => void;
  onReadState: (threadId: string, isUnread: boolean) => void;
  onArchive: (threadId: string) => void;
}) {
  if (threads.length === 0) {
    return (
      <div className="grid min-h-[240px] place-items-center p-6 text-center">
        <div>
          <Inbox className="mx-auto h-7 w-7 text-text-tertiary" />
          <p className="mt-2 text-[13px] font-medium text-text-primary">No matching threads</p>
          <p className="mt-1 text-[12.5px] text-text-tertiary">Change filters or sync the sandbox provider.</p>
        </div>
      </div>
    );
  }
  const allSelected = threads.length > 0 && threads.every((thread) => selectedIds.has(thread.id));
  return (
    <div className="min-h-0 overflow-y-auto">
      <div className="sticky top-0 z-10 flex min-h-10 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-card px-3 py-2">
        <label className="flex items-center gap-2 text-tiny text-text-tertiary">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => onSelectAll(event.target.checked)}
            aria-label="Select all visible threads"
            className="h-3.5 w-3.5 accent-[var(--blue-text)]"
          />
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select"}
        </label>
        {selectedIds.size > 0 && (
          <>
            <button type="button" aria-label="Mark selected done" onClick={() => onBulk({ status: "done" })} className="h-7 rounded-md border border-[var(--border)] px-2 text-tiny hover:bg-surface">
              Done
            </button>
            <button type="button" aria-label="Mark selected waiting" onClick={() => onBulk({ status: "waiting" })} className="h-7 rounded-md border border-[var(--border)] px-2 text-tiny hover:bg-surface">
              Waiting
            </button>
            <button type="button" aria-label="Snooze selected" onClick={() => onBulk({ status: "snoozed" })} className="h-7 rounded-md border border-[var(--border)] px-2 text-tiny hover:bg-surface">
              Snooze
            </button>
            <button type="button" aria-label="Mark selected open" onClick={() => onBulk({ status: "open" })} className="h-7 rounded-md border border-[var(--border)] px-2 text-tiny hover:bg-surface">
              Open
            </button>
            <select
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                if (value) onBulk({ assigneeUserId: value });
                event.target.value = "";
              }}
              className="h-7 max-w-[150px] rounded-md border border-[var(--border)] bg-card px-1.5 text-tiny"
              aria-label="Bulk assign selected threads"
            >
              <option value="">Assign...</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      {threads.map((thread) => {
        const participantLabel = thread.lastMessageDirection === "outbound"
          ? `To ${thread.lastRecipientSummary || "recipient"}`
          : thread.lastSenderName || thread.lastSenderAddress || "Unknown sender";
        return (
        <article
          key={thread.id}
          className={cx(
            "group border-b border-[var(--border)] px-3 py-3 transition-colors hover:bg-surface/70",
            selectedId === thread.id && "bg-surface",
          )}
        >
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={selectedIds.has(thread.id)}
              onChange={(event) => onToggleSelected(thread.id, event.target.checked)}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Select thread ${thread.subject}`}
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--blue-text)]"
            />
            <button type="button" onClick={() => onSelect(thread.id)} className="min-w-0 flex-1 text-left">
            <div className="mb-1 flex items-center gap-2">
              <span className={cx("h-2 w-2 rounded-full", thread.isUnread ? "bg-[var(--blue-text)]" : "bg-text-faint")} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{participantLabel}</span>
              {thread.hasAttachments && <Paperclip size={13} className="shrink-0 text-text-tertiary" />}
              <span className="shrink-0 text-tiny text-text-tertiary">{relativeTime(thread.lastMessageAt)}</span>
            </div>
            <p className="truncate text-[12.5px] font-medium text-text-secondary">{thread.subject}</p>
            <p className="line-clamp-2 text-[12.5px] leading-5 text-text-secondary">{thread.lastMessagePreview}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip label={thread.mailboxAddress} tone={thread.mailboxType === "personal" ? "blue" : "gold"} />
              <Chip label={thread.status} tone={thread.status === "done" ? "green" : thread.status === "waiting" || thread.status === "snoozed" ? "amber" : "neutral"} />
              {thread.snoozedUntil && thread.status === "snoozed" && <Chip label={`in ${formatFutureTime(thread.snoozedUntil)}`} tone="amber" />}
              {thread.hasOutboundMessage && <Chip label="sent" tone={thread.lastMessageDirection === "outbound" ? "blue" : "neutral"} />}
              {thread.assignedToName ? <Chip label={thread.assignedToName} /> : <Chip label="unassigned" tone="amber" />}
              {thread.links.slice(0, 2).map((link) => <Chip key={link.id} label={link.label} />)}
            </div>
            </button>
          </div>
          <div className="mt-2 flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
            <IconButton label="Mark open" onClick={() => onStatus(thread.id, "open")} icon={<MessageSquare size={14} />} />
            <IconButton label="Waiting" onClick={() => onStatus(thread.id, "waiting")} icon={<AlertTriangle size={14} />} />
            <IconButton label="Snooze" onClick={() => onStatus(thread.id, "snoozed")} icon={<Clock size={14} />} />
            <IconButton disabled={!providerOnline} label={thread.isUnread ? "Mark read" : "Mark unread"} onClick={() => onReadState(thread.id, !thread.isUnread)} icon={<Mail size={14} />} />
            <IconButton disabled={!providerOnline} label="Archive" onClick={() => onArchive(thread.id)} icon={<Archive size={14} />} />
            <IconButton label="Done" onClick={() => onStatus(thread.id, "done")} icon={<Check size={14} />} />
          </div>
        </article>
        );
      })}
    </div>
  );
}

function DraftList({
  drafts,
  onOpen,
}: {
  drafts: EmailModuleData["drafts"];
  onOpen: (draft: EmailModuleData["drafts"][number]) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="grid min-h-[240px] place-items-center p-6 text-center">
        <div>
          <FileText className="mx-auto h-7 w-7 text-text-tertiary" />
          <p className="mt-2 text-[13px] font-medium text-text-primary">No saved drafts</p>
          <p className="mt-1 text-[12.5px] text-text-tertiary">Replies autosave here after you start typing.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-0 overflow-y-auto">
      {drafts.map((draft) => (
        <button
          key={draft.id}
          type="button"
          onClick={() => onOpen(draft)}
          className="w-full border-b border-[var(--border)] px-3 py-3 text-left hover:bg-surface/70"
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
              {draft.subject || "(No subject)"}
            </span>
            {draft.attachmentMetadata.length > 0 && <Paperclip size={13} className="shrink-0 text-text-tertiary" />}
            <span className="text-tiny text-text-tertiary">{relativeTime(draft.updatedAt)}</span>
          </div>
          <p className="line-clamp-2 text-[12.5px] leading-5 text-text-secondary">
            {draft.bodyText || `To ${draft.toRecipients.join(", ") || "no recipients yet"}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip label={draft.mailboxAddress} tone={draft.mailboxType === "personal" ? "blue" : "gold"} />
            <Chip label="draft" tone="amber" />
          </div>
        </button>
      ))}
    </div>
  );
}

function NewMessagePane({
  mailbox,
  draft,
  providerOnline,
  isPending,
  run,
  onClose,
}: {
  mailbox: EmailModuleData["mailboxes"][number];
  draft: EmailModuleData["drafts"][number] | null;
  providerOnline: boolean;
  isPending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => void;
  onClose: () => void;
}) {
  const canSend = providerOnline && mailbox.rights.canReply && mailbox.rights.canSendAs && mailbox.sendEnabled;
  return (
    <section className="min-h-0 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 rounded-md border border-[var(--border)] bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-tiny font-semibold uppercase tracking-wide text-text-tertiary">New message</p>
              <h1 className="mt-1 text-[18px] font-semibold text-text-primary">{mailbox.address}</h1>
            </div>
            <Chip label={mailbox.type} tone={mailbox.type === "personal" ? "blue" : "gold"} />
          </div>
          {!canSend && (
            <p className="mt-2 text-[12.5px] text-red-text">
              Sending is disabled, provider health is unavailable, or provider Send As permission is missing for this mailbox.
            </p>
          )}
        </div>
        <Composer
          mailboxId={mailbox.id}
          mailboxAddress={mailbox.address}
          mailboxType={mailbox.type}
          threadId={null}
          modeLabel={draft ? "Resume draft" : "New message"}
          draft={draft}
          draftIdOverride={draft?.id ?? null}
          defaultTo={draft?.toRecipients.join(", ") ?? ""}
          defaultCc={draft?.ccRecipients.join(", ") ?? ""}
          defaultSubject={draft?.subject ?? ""}
          defaultBody={draft?.bodyText ?? ""}
          disabled={!canSend || isPending}
          run={run}
          onClose={onClose}
        />
      </div>
    </section>
  );
}

function ActiveBrainPanel({
  thread,
  mailbox,
  disabled,
  onOpenDraft,
}: {
  thread: EmailModuleData["selectedThread"];
  mailbox: EmailModuleData["mailboxes"][number] | null;
  disabled: boolean;
  onOpenDraft: (draft: { draftId: string; to: string; subject: string; body: string }) => void;
}) {
  const [summary, setSummary] = useState<ActiveBrainSummary | null>(null);
  const [isAiPending, startAiTransition] = useTransition();
  if (!thread) return null;

  const threadId = thread.id;
  const inbound = thread.messages.find((message) => message.direction === "inbound");
  const inboundAddress = inbound?.fromAddress ?? "";
  const subject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`;
  const aiAllowed = Boolean(mailbox?.aiEnabled);

  function runAi(mode: "summary" | "draft") {
    startAiTransition(async () => {
      const result = await generateEmailActiveBrainAction({ threadId, mode });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSummary(result.summary);
      toast.success(result.message ?? "Active Brain ready");
      if (mode === "draft" && result.draftId && result.draftBody) {
        onOpenDraft({
          draftId: result.draftId,
          to: inboundAddress,
          subject,
          body: result.draftBody,
        });
      }
    });
  }

  return (
    <>
      <SectionHead icon={<Sparkles size={14} />} label="Active Brain" />
      <div className="mt-2 rounded-md border border-[var(--border)] bg-card p-3">
        {!aiAllowed ? (
          <p className="text-[12.5px] leading-5 text-text-secondary">
            AI is disabled for this mailbox by policy. Personal and sensitive mailboxes stay private unless enabled in mailbox settings.
          </p>
        ) : summary ? (
          <div className="space-y-2">
            <p className="text-[12.5px] leading-5 text-text-secondary">{summary.summary}</p>
            <div>
              <p className="text-tiny font-semibold uppercase tracking-wide text-text-tertiary">Open questions</p>
              <ul className="mt-1 space-y-1 text-[12px] text-text-secondary">
                {summary.openQuestions.map((question) => (
                  <li key={question}>- {question}</li>
                ))}
              </ul>
            </div>
            <p className="text-[12px] text-text-secondary">
              <span className="font-medium text-text-primary">Next:</span> {summary.nextAction}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {summary.citations.map((citation, index) => (
                <Chip key={`${citation.messageId}-${citation.label}-${index}`} label={citation.label} tone="blue" />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] leading-5 text-text-secondary">
            Generate a cited thread summary, next action, or editable reply draft. AI output is labeled and never auto-sent.
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!aiAllowed || disabled || isAiPending}
            onClick={() => runAi("summary")}
            className="h-8 rounded-md border border-[var(--border)] text-[12px] hover:bg-surface disabled:opacity-40"
          >
            {isAiPending ? "Working..." : "Summarize"}
          </button>
          <button
            type="button"
            disabled={!aiAllowed || disabled || isAiPending || !inbound}
            onClick={() => runAi("draft")}
            className="h-8 rounded-md bg-text-primary text-[12px] font-medium text-[var(--background)] disabled:opacity-40"
          >
            Draft reply
          </button>
        </div>
        <p className="mt-2 text-tiny text-text-tertiary">AI-generated content includes citations and requires human send.</p>
      </div>
    </>
  );
}

function ReaderPane({
  data,
  currentUser,
  thread,
  mailbox,
  providerOnline,
  isPending,
  run,
  onAssign,
}: {
  data: EmailModuleData;
  currentUser: CurrentUser;
  thread: EmailModuleData["selectedThread"];
  mailbox: EmailModuleData["mailboxes"][number] | null;
  providerOnline: boolean;
  isPending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => void;
  onAssign: (thread: EmailThreadListItem, assignee: string | null) => void;
}) {
  const [note, setNote] = useState("");
  const [ownerReason, setOwnerReason] = useState("Owner operational review");
  const [composer, setComposer] = useState<null | {
    modeLabel: string;
    defaultTo: string;
    defaultCc: string;
    defaultSubject: string;
    defaultBody: string;
    draftId?: string;
  }>(null);
  const [contactId, setContactId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [initiativeId, setInitiativeId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");

  if (!thread) {
    return (
      <section className="grid min-h-0 flex-1 place-items-center p-8 text-center">
        <div>
          <Mail className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-2 text-[13px] font-medium text-text-primary">Select a thread</p>
          <p className="mt-1 max-w-sm text-[12.5px] text-text-tertiary">
            Open a message to reply, assign, link CRM records, log touches, or review audit-sensitive owner access.
          </p>
        </div>
      </section>
    );
  }

  const ownerViewingPersonal =
    currentUser.role === "owner" &&
    mailbox?.type === "personal" &&
    mailbox.ownerUserId &&
    mailbox.ownerUserId !== currentUser.id;

  const firstInbound = thread.messages.find((m) => m.direction === "inbound");
  const replyTo = firstInbound?.fromAddress ?? "";
  const latestMessage = thread.messages[thread.messages.length - 1];
  const threadDraft = mailbox ? data.drafts.find((draft) => draft.threadId === thread.id && draft.mailboxId === mailbox.id) ?? null : null;
  const canReply = Boolean(providerOnline && mailbox?.rights.canReply && mailbox.rights.canSendAs);
  const ownAddresses = new Set([mailbox?.address.toLowerCase(), currentUser.email.toLowerCase()].filter(Boolean));
  const replyAllTo = Array.from(new Set([firstInbound?.fromAddress, ...(firstInbound?.toRecipients ?? [])]
    .filter((address): address is string => Boolean(address))
    .filter((address) => !ownAddresses.has(address.toLowerCase()))));
  const replyAllCc = Array.from(new Set((firstInbound?.ccRecipients ?? [])
    .filter((address) => !ownAddresses.has(address.toLowerCase()))));
  const replySubject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`;
  const forwardBody = latestMessage
    ? `\n\n---------- Forwarded message ----------\nFrom: ${latestMessage.fromName ?? latestMessage.fromAddress}\nSubject: ${latestMessage.subject}\n\n${latestMessage.bodyText}`
    : "";

  return (
    <section className="min-h-0 overflow-y-auto">
      <div className="grid min-h-full 2xl:grid-cols-[minmax(420px,1fr)_300px]">
        <div className="min-w-0 2xl:border-r 2xl:border-[var(--border)]">
          {ownerViewingPersonal && mailbox && (
            <div className="border-b border-amber-300/40 bg-amber-500/10 p-3">
              <div className="flex gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-text-primary">Owner access to {mailbox.address} is audited</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={ownerReason}
                      onChange={(e) => setOwnerReason(e.target.value)}
                      className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-card px-2 text-[12.5px]"
                      aria-label="Owner access reason"
                    />
                    <button
                      type="button"
                      onClick={() => run(() => recordOwnerMailboxAccessAction(mailbox.id, ownerReason), "Owner access recorded")}
                      className="rounded-md bg-text-primary px-2.5 text-[12px] font-medium text-[var(--background)]"
                    >
                      Record
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <header className="border-b border-[var(--border)] p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-[18px] font-semibold tracking-tight text-text-primary">{thread.subject}</h1>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip label={thread.mailboxAddress} tone={thread.mailboxType === "personal" ? "blue" : "gold"} />
                  <Chip label={thread.status} />
                  {thread.assignedToName ? <Chip label={`Owner: ${thread.assignedToName}`} /> : <Chip label="Unassigned" tone="amber" />}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {threadDraft && (
                  <button
                    type="button"
                    disabled={!canReply}
                    onClick={() => setComposer({
                      modeLabel: "Resume draft",
                      defaultTo: threadDraft.toRecipients.join(", "),
                      defaultCc: threadDraft.ccRecipients.join(", "),
                      defaultSubject: threadDraft.subject,
                      defaultBody: threadDraft.bodyText,
                      draftId: threadDraft.id,
                    })}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-[13px] text-text-secondary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save size={15} /> Draft
                  </button>
                )}
                <button
                  type="button"
                  disabled={!canReply}
                  onClick={() => setComposer({ modeLabel: "Reply", defaultTo: replyTo, defaultCc: "", defaultSubject: replySubject, defaultBody: "" })}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-text-primary px-3 text-[13px] font-medium text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Reply size={15} /> Reply
                </button>
                <button
                  type="button"
                  disabled={!canReply || replyAllTo.length === 0}
                  onClick={() => setComposer({ modeLabel: "Reply all", defaultTo: replyAllTo.join(", "), defaultCc: replyAllCc.join(", "), defaultSubject: replySubject, defaultBody: "" })}
                  className="hidden h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-[13px] text-text-secondary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
                >
                  Reply all
                </button>
                <button
                  type="button"
                  disabled={!canReply}
                  onClick={() => setComposer({ modeLabel: "Forward", defaultTo: "", defaultCc: "", defaultSubject: thread.subject.startsWith("Fwd:") ? thread.subject : `Fwd: ${thread.subject}`, defaultBody: forwardBody })}
                  className="hidden h-9 items-center rounded-md border border-[var(--border)] px-3 text-[13px] text-text-secondary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
                >
                  Forward
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-3 p-4">
            {thread.messages.map((message) => (
              <article key={message.id} className="rounded-md border border-[var(--border)] bg-card p-3">
                <div className="mb-2 flex items-start gap-2">
                  <div className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", message.direction === "outbound" ? "bg-[var(--blue-text)] text-white" : "bg-surface text-text-primary")}>
                    {message.direction === "outbound" ? "AGB" : (message.fromName ?? message.fromAddress).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-text-primary">
                        {message.direction === "outbound" ? message.fromAddress : message.fromName ?? message.fromAddress}
                      </p>
                      <span className="text-tiny text-text-tertiary">{relativeTime(message.sentAt ?? message.receivedAt ?? message.createdAt)}</span>
                    </div>
                    <p className="truncate text-tiny text-text-tertiary">
                      to {message.toRecipients.join(", ")}
                    </p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-6 text-text-secondary">{message.bodyText}</p>
                {message.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={`/api/email/attachments/${a.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-tiny text-text-secondary hover:bg-surface"
                        title={`Download ${a.filename}`}
                      >
                        <Download size={12} /> {a.filename} · {Math.round(a.sizeBytes / 1024)} KB
                      </a>
                    ))}
                  </div>
                )}
              </article>
            ))}

            {composer && mailbox && (
              <Composer
                key={`${thread.id}-${composer.modeLabel}-${composer.draftId ?? "new"}`}
                mailboxId={mailbox.id}
                mailboxAddress={mailbox.address}
                mailboxType={mailbox.type}
                threadId={thread.id}
                modeLabel={composer.modeLabel}
                draft={composer.draftId ? threadDraft : null}
                draftIdOverride={composer.draftId ?? null}
                defaultTo={composer.defaultTo}
                defaultCc={composer.defaultCc}
                defaultSubject={composer.defaultSubject}
                defaultBody={composer.defaultBody}
                disabled={!canReply || isPending}
                run={run}
                onClose={() => setComposer(null)}
              />
            )}
          </div>
        </div>

        <aside className="min-w-0 border-t border-[var(--border)] bg-card/45 p-4 2xl:border-t-0">
          <div className="space-y-5">
            <section>
              <SectionHead icon={<Users size={14} />} label="Assignment" />
              <select
                value={thread.assignedToId ?? ""}
                onChange={(e) => onAssign(thread, e.target.value || null)}
                className="mt-2 h-9 w-full rounded-md border border-[var(--border)] bg-card px-2 text-[13px]"
              >
                <option value="">Unassigned</option>
                {data.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <SectionHead icon={<ChevronRight size={14} />} label="CRM links" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {thread.links.length === 0 ? <Chip label="No CRM links yet" tone="neutral" /> : thread.links.map((l) => <Chip key={l.id} label={l.label} />)}
              </div>
              <div className="mt-3 space-y-2">
                <select aria-label="Link email to contact" value={contactId} onChange={(e) => setContactId(e.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-card px-2 text-[13px]">
                  <option value="">Link contact</option>
                  {data.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</option>)}
                </select>
                <select aria-label="Link email to project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-card px-2 text-[13px]">
                  <option value="">Link project</option>
                  {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <select aria-label="Link email to initiative" value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-card px-2 text-[13px]">
                  <option value="">Link initiative</option>
                  {data.initiatives.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                </select>
                <select aria-label="Link email to milestone" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-card px-2 text-[13px]">
                  <option value="">Link milestone</option>
                  {data.milestones.map((m) => <option key={m.id} value={m.id}>{m.projectTitle} · {m.title}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={!contactId} onClick={() => contactId && run(() => linkEmailThreadToContactAction(thread.id, contactId), "Contact linked")} className="h-8 rounded-md border border-[var(--border)] text-[12px] disabled:opacity-40">Link contact</button>
                  <button disabled={!projectId} onClick={() => projectId && run(() => linkEmailThreadToProjectAction(thread.id, projectId), "Project linked")} className="h-8 rounded-md border border-[var(--border)] text-[12px] disabled:opacity-40">Link project</button>
                  <button disabled={!initiativeId} onClick={() => initiativeId && run(() => linkEmailThreadToInitiativeAction(thread.id, initiativeId), "Initiative linked")} className="h-8 rounded-md border border-[var(--border)] text-[12px] disabled:opacity-40">Link initiative</button>
                  <button disabled={!milestoneId} onClick={() => milestoneId && run(() => linkEmailThreadToMilestoneAction(thread.id, milestoneId), "Milestone linked")} className="h-8 rounded-md border border-[var(--border)] text-[12px] disabled:opacity-40">Link milestone</button>
                </div>
                <button type="button" onClick={() => run(() => createContactFromEmailThreadAction(thread.id), "Contact created")} className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] text-[12px]">
                  <UserPlus size={13} /> Create contact from sender
                </button>
              </div>
            </section>

            <section>
              <ActiveBrainPanel
                thread={thread}
                mailbox={mailbox}
                disabled={isPending}
                onOpenDraft={(draft) =>
                  setComposer({
                    modeLabel: "AI draft",
                    defaultTo: draft.to,
                    defaultCc: "",
                    defaultSubject: draft.subject,
                    defaultBody: draft.body,
                    draftId: draft.draftId,
                  })
                }
              />
            </section>

            <section>
              <SectionHead icon={<MessageSquare size={14} />} label="Internal notes" />
              <div className="mt-2 space-y-2">
                {thread.notes.map((n) => (
                  <div key={n.id} className="rounded-md border border-[var(--border)] bg-card p-2">
                    <p className="text-[12.5px] text-text-secondary">{n.body}</p>
                    <p className="mt-1 text-tiny text-text-tertiary">{n.authorName ?? "Team"} · {relativeTime(n.createdAt)}</p>
                  </div>
                ))}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Add internal note"
                  className="w-full resize-none rounded-md border border-[var(--border)] bg-card p-2 text-[13px]"
                />
                <button
                  type="button"
                  disabled={!note.trim()}
                  onClick={() => {
                    const body = note;
                    setNote("");
                    run(() => addEmailInternalNoteAction(thread.id, body), "Note added");
                  }}
                  className="h-8 w-full rounded-md bg-text-primary text-[12px] font-medium text-[var(--background)] disabled:opacity-40"
                >
                  Add note
                </button>
              </div>
            </section>

            <section>
              <SectionHead icon={<Archive size={14} />} label="Conversions" />
              <div className="mt-2 grid gap-2">
                <button onClick={() => run(() => createActionItemFromEmailThreadAction(thread.id), "Action item created")} className="h-8 rounded-md border border-[var(--border)] text-[12px]">Create action item</button>
                <button onClick={() => run(() => logEmailThreadTouchAction(thread.id), "Touch logged")} className="h-8 rounded-md border border-[var(--border)] text-[12px]">Log touch</button>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Composer({
  mailboxId,
  mailboxAddress,
  mailboxType,
  threadId,
  modeLabel,
  draft,
  draftIdOverride,
  defaultTo,
  defaultCc,
  defaultSubject,
  defaultBody,
  disabled,
  run,
  onClose,
}: {
  mailboxId: string;
  mailboxAddress: string;
  mailboxType: "personal" | "shared" | "system";
  threadId: string | null;
  modeLabel: string;
  draft: EmailModuleData["drafts"][number] | null;
  draftIdOverride: string | null;
  defaultTo: string;
  defaultCc: string;
  defaultSubject: string;
  defaultBody: string;
  disabled: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => void;
  onClose: () => void;
}) {
  const [to, setTo] = useState(draft?.toRecipients.join(", ") || defaultTo);
  const [cc, setCc] = useState(draft?.ccRecipients.join(", ") || defaultCc);
  const [subject, setSubject] = useState(draft?.subject || defaultSubject);
  const [body, setBody] = useState(draft?.bodyText || defaultBody);
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? draftIdOverride ?? null);
  const [attachments, setAttachments] = useState(draft?.attachmentMetadata ?? []);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [clientMutationId] = useState(() => draft?.clientMutationId || (draftIdOverride ? `resume-${draftIdOverride}` : crypto.randomUUID()));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const templates = [
    {
      id: "intro",
      label: "Intro follow-up",
      subject: subject || "CaneyCloud follow-up",
      body: "Thanks for reaching out. I can help coordinate the next step from here.\n\nWhat would be the best time for a quick call?",
    },
    {
      id: "proposal",
      label: "Proposal sent",
      subject: subject || "Proposal next steps",
      body: "I attached the details we discussed. Once you confirm scope and timing, I will move this into the next action in AGB CRM.",
    },
    {
      id: "support",
      label: "Support ack",
      subject: subject || "We received your request",
      body: "We received this and are reviewing it now. I will follow up with either a resolution or the next question shortly.",
    },
  ];

  const saveDraft = useCallback(
    async (showToast = false) => {
      if (!to.trim() && !subject.trim() && !body.trim() && attachments.length === 0) return null;
      setSaveState("saving");
      const result = await saveEmailDraftAction({
        draftId,
        mailboxId,
        threadId,
        to: splitEmails(to),
        cc: splitEmails(cc),
        bcc: [],
        subject,
        bodyText: body,
        attachments,
        clientMutationId,
      });
      if (result.ok) {
        if (result.id) setDraftId(result.id);
        setSaveState("saved");
        if (showToast) toast.success("Draft saved");
        return result.id ?? draftId;
      }
      setSaveState("error");
      if (showToast) toast.error(result.error);
      return null;
    },
    [attachments, body, cc, clientMutationId, draftId, mailboxId, subject, threadId, to],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void saveDraft(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [saveDraft]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!body.trim() && attachments.length === 0) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [attachments.length, body]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = [...attachments];
    for (const file of Array.from(files)) {
      if (file.size > 512 * 1024) {
        toast.error(`${file.name} is over the 512 KB V1 attachment limit.`);
        continue;
      }
      const total = next.reduce((sum, item) => sum + item.sizeBytes, 0) + file.size;
      if (total > 512 * 1024) {
        toast.error("Attachments must stay under 512 KB total.");
        continue;
      }
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (const byte of bytes) binary += String.fromCharCode(byte);
      next.push({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        contentBase64: window.btoa(binary),
      });
    }
    setAttachments(next.slice(0, 5));
    if (files.length > 0) toast.success("Attachment added");
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Chip label={modeLabel} tone={modeLabel === "Forward" ? "blue" : "neutral"} />
          <span className="text-tiny text-text-tertiary">
            {saveState === "saving" ? "Saving draft..." : saveState === "saved" ? "Draft saved" : saveState === "error" ? "Draft save failed" : "CRM draft autosave"}
          </span>
        </div>
        <select
          defaultValue=""
          onChange={(event) => {
            const template = templates.find((item) => item.id === event.target.value);
            if (!template) return;
            setSubject(template.subject);
            setBody((value) => (value.trim() ? `${value.trim()}\n\n${template.body}` : template.body));
            event.target.value = "";
          }}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[12px]"
          aria-label="Insert email template"
        >
          <option value="">Insert template</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[13px]" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[13px]" />
      </div>
      <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc" className="mt-2 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[13px]" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Write reply..." className="mt-2 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-[13px]" />
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <button
              key={`${attachment.filename}-${index}`}
              type="button"
              onClick={() => setAttachments((value) => value.filter((_, i) => i !== index))}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-tiny text-text-secondary hover:bg-surface"
              title="Remove attachment"
            >
              <Paperclip size={12} />
              <span className="truncate">{attachment.filename}</span>
              <span>{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB</span>
              <X size={12} />
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[12px] hover:bg-surface">
            <Paperclip size={13} /> Attach
          </button>
          <button type="button" onClick={() => void saveDraft(true)} className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[12px] hover:bg-surface">
            <Save size={13} /> Save
          </button>
          <button
            type="button"
            disabled={!draftId}
            onClick={() => {
              if (!draftId || !window.confirm("Discard this draft?")) return;
              run(() => discardEmailDraftAction(draftId), "Draft discarded");
              onClose();
            }}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[12px] hover:bg-surface disabled:opacity-40"
          >
            <Trash2 size={13} /> Discard
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-[var(--border)] px-3 text-[13px] text-text-secondary hover:bg-surface">
            Close
          </button>
          <button
            type="button"
            disabled={disabled || !body.trim() || splitEmails(to).length === 0}
            onClick={() => {
              if (mailboxType !== "personal" && !window.confirm(`Send this reply as ${mailboxAddress}?`)) return;
              run(() => sendEmailAction({
                draftId,
                mailboxId,
                threadId,
                to: splitEmails(to),
                cc: splitEmails(cc),
                bcc: [],
                subject,
                bodyText: body,
                attachments,
                idempotencyKey,
              }), "Email sent");
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-text-primary px-3 text-[13px] font-medium text-[var(--background)] disabled:opacity-50"
          >
            <Send size={14} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsPane({
  data,
  currentUser,
  isPending,
  run,
}: {
  data: EmailModuleData;
  currentUser: CurrentUser;
  isPending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => void;
}) {
  const [mailboxId, setMailboxId] = useState(data.mailboxes[0]?.id ?? "");
  const [userId, setUserId] = useState(data.members[0]?.userId ?? "");
  const mailbox = data.mailboxes.find((m) => m.id === mailboxId) ?? data.mailboxes[0];
  const grants = mailbox ? data.accessGrants.filter((grant) => grant.mailboxId === mailbox.id) : [];
  const syncIssues = mailboxSyncIssues(data.mailboxes);
  const revokeSelectedUser = () => {
    if (!mailbox || !userId) return;
    if (!window.confirm(`Revoke CRM access for this user on ${mailbox.address}?`)) return;
    run(
      () =>
        grantMailboxAccessAction({
          mailboxId: mailbox.id,
          userId,
          canView: false,
          canReply: false,
          canSendAs: false,
          canAssign: false,
          canManageAccess: false,
          canManageSettings: false,
        }),
      "Access revoked",
    );
  };
  return (
    <div className="min-h-0 overflow-y-auto p-3">
      <div className="mb-3 rounded-md border border-[var(--border)] bg-card p-3">
        <SectionHead icon={<ShieldCheck size={14} />} label="Provider health" />
        <p className="mt-2 text-[13px] text-text-secondary">{data.provider?.healthDetail ?? "No provider health detail."}</p>
        <p className="mt-1 text-tiny text-text-tertiary">Status: {data.provider?.status} · {data.provider?.healthStatus}</p>
        {syncIssues.length > 0 && (
          <div className="mt-3 space-y-1 rounded-md border border-amber-300/40 bg-amber-500/10 p-2">
            {syncIssues.slice(0, 4).map(({ mailbox, issue }) => (
              <p key={mailbox.id} className="text-[12px] text-amber-700">
                {mailbox.address}: {issue}
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {data.mailboxes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMailboxId(m.id)}
            className={cx("w-full rounded-md border border-[var(--border)] p-3 text-left", mailboxId === m.id ? "bg-surface" : "bg-card hover:bg-surface/70")}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{m.address}</span>
              <Chip label={m.type} tone={m.type === "shared" ? "gold" : "blue"} />
            </div>
            <p className="mt-1 text-tiny text-text-tertiary">
              {m.threadCount} threads · {m.unreadCount} unread · send {m.sendEnabled ? "on" : "off"} · sync {m.syncEnabled ? "on" : "off"} · last {m.lastSyncedAt ? relativeTime(m.lastSyncedAt) : "never"}
            </p>
          </button>
        ))}
      </div>
      {mailbox && (
        <div className="mt-4 rounded-md border border-[var(--border)] bg-card p-3">
          <SectionHead icon={<KeyRound size={14} />} label={`Access · ${mailbox.address}`} />
          <MailboxClassificationEditor
            key={`classification-${mailbox.id}`}
            mailbox={mailbox}
            members={data.members}
            isPending={isPending}
            run={run}
          />
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-2 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[13px]">
            {data.members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName} · {m.role}</option>)}
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
            <AccessButton label="Viewer" onClick={() => run(() => grantMailboxAccessAction({ mailboxId: mailbox.id, userId, canView: true, canReply: false, canSendAs: false, canAssign: false, canManageAccess: false, canManageSettings: false }), "Access updated")} />
            <AccessButton label="Responder" onClick={() => run(() => grantMailboxAccessAction({ mailboxId: mailbox.id, userId, canView: true, canReply: true, canSendAs: false, canAssign: true, canManageAccess: false, canManageSettings: false }), "Access updated")} />
            <AccessButton label="Send as" onClick={() => run(() => grantMailboxAccessAction({ mailboxId: mailbox.id, userId, canView: true, canReply: true, canSendAs: true, canAssign: true, canManageAccess: false, canManageSettings: false }), "Access updated")} />
            <AccessButton label="Manager" onClick={() => run(() => grantMailboxAccessAction({ mailboxId: mailbox.id, userId, canView: true, canReply: true, canSendAs: true, canAssign: true, canManageAccess: true, canManageSettings: true }), "Access updated")} />
            <AccessButton label="Revoke" onClick={revokeSelectedUser} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`${mailbox.sendEnabled ? "Disable" : "Enable"} sending for ${mailbox.address}?`)) return;
                run(() => setMailboxOperationalStateAction(mailbox.id, { sendEnabled: !mailbox.sendEnabled }), "Send switch updated");
              }}
              className="h-8 rounded-md border border-[var(--border)] text-[12px]"
            >
              Toggle send
            </button>
            <button
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`${mailbox.syncEnabled ? "Disable" : "Enable"} sync for ${mailbox.address}?`)) return;
                run(() => setMailboxOperationalStateAction(mailbox.id, { syncEnabled: !mailbox.syncEnabled }), "Sync switch updated");
              }}
              className="h-8 rounded-md border border-[var(--border)] text-[12px]"
            >
              Toggle sync
            </button>
          </div>
          <MailboxSignatureEditor key={`signature-${mailbox.id}`} mailbox={mailbox} run={run} />
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="text-tiny font-semibold uppercase tracking-wide text-text-tertiary">Current grants</p>
            <div className="mt-2 space-y-2">
              {grants.length === 0 ? (
                <p className="text-[12.5px] text-text-tertiary">No explicit grants. Owners and personal mailbox owners still follow default policy.</p>
              ) : (
                grants.map((grant) => (
                  <div key={grant.id} className="rounded-md border border-[var(--border)] bg-[var(--background)] p-2">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text-primary">
                        {grant.userName ?? grant.userEmail ?? "Workspace user"}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setUserId(grant.userId);
                          if (!window.confirm(`Revoke CRM access for ${grant.userEmail ?? grant.userName ?? "this user"} on ${mailbox.address}?`)) return;
                          run(
                            () =>
                              grantMailboxAccessAction({
                                mailboxId: mailbox.id,
                                userId: grant.userId,
                                canView: false,
                                canReply: false,
                                canSendAs: false,
                                canAssign: false,
                                canManageAccess: false,
                                canManageSettings: false,
                              }),
                            "Access revoked",
                          );
                        }}
                        className="h-7 rounded-md border border-[var(--border)] px-2 text-tiny text-text-secondary hover:bg-surface"
                      >
                        Revoke
                      </button>
                    </div>
                    <p className="mt-1 text-tiny text-text-tertiary">
                      {[
                        grant.canView && "view",
                        grant.canReply && "reply",
                        grant.canSendAs && "send-as",
                        grant.canAssign && "assign",
                        grant.canManageAccess && "access",
                        grant.canManageSettings && "settings",
                      ].filter(Boolean).join(", ")} · granted by {grant.grantedByName ?? "system"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <p className="mt-3 text-tiny text-text-tertiary">
        Signed in as {currentUser.email}. Provider permission still has to pass in {providerLabel(data.provider)} before Send As succeeds.
      </p>
    </div>
  );
}

function OperationsPane({
  data,
  isPending,
  run,
  onExportAudit,
}: {
  data: EmailModuleData;
  isPending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => void;
  onExportAudit: () => void;
}) {
  const [briefing, setBriefing] = useState<WorkloadBriefing | null>(null);
  const [isBriefingPending, startBriefingTransition] = useTransition();
  const syncIssues = mailboxSyncIssues(data.mailboxes);
  return (
    <section className="min-h-0 overflow-y-auto p-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-md border border-[var(--border)] bg-card p-4">
          <SectionHead icon={<ShieldCheck size={14} />} label="Production readiness" />
          <ul className="mt-3 space-y-2 text-[13px] text-text-secondary">
            <ReadyRow ok={Boolean(data.provider)} label="Provider connection registered" />
            <ReadyRow ok={data.mailboxes.some((m) => m.type === "personal")} label="Personal mailbox imported" />
            <ReadyRow ok={data.mailboxes.some((m) => m.type === "shared")} label="Shared mailbox imported" />
            <ReadyRow ok={data.audit.length > 0} label="Audit trail active" />
            <ReadyRow ok={data.threads.some((t) => t.hasAttachments)} label="Attachment metadata tested" />
            <ReadyRow ok={syncIssues.length === 0} label={syncIssues.length === 0 ? "Mailbox sync fresh" : `${syncIssues.length} sync warning${syncIssues.length === 1 ? "" : "s"}`} />
          </ul>
          <button
            disabled={isPending}
            onClick={() => run(() => syncSandboxMailboxAction(), "Recovery sync completed")}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-text-primary px-3 text-[13px] font-medium text-[var(--background)] disabled:opacity-50"
          >
            <RefreshCw size={14} /> Run recovery sync
          </button>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={isPending}
              onClick={() => run(connectMicrosoftProviderAction, "Microsoft 365 connected")}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[12px] text-text-secondary hover:bg-surface disabled:opacity-50"
            >
              <ShieldCheck size={13} /> Connect Microsoft
            </button>
            <button
              disabled={isPending}
              onClick={() => run(connectZohoProviderAction, "Zoho Mail connected")}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[12px] text-text-secondary hover:bg-surface disabled:opacity-50"
            >
              <MailCheck size={13} /> Connect Zoho
            </button>
            <button
              disabled={isPending}
              onClick={() => run(importMicrosoftMailboxesAction, "Microsoft mailboxes imported")}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[12px] text-text-secondary hover:bg-surface disabled:opacity-50"
            >
              <MailCheck size={13} /> Import Microsoft mailboxes
            </button>
            <button
              disabled={isPending}
              onClick={() => run(importZohoMailboxesAction, "Zoho mailboxes imported")}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[12px] text-text-secondary hover:bg-surface disabled:opacity-50"
            >
              <Inbox size={13} /> Import Zoho mailboxes
            </button>
            <button
              disabled={isPending}
              onClick={onExportAudit}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[12px] text-text-secondary hover:bg-surface disabled:opacity-50"
            >
              <FileText size={13} /> Export audit CSV
            </button>
          </div>
        </div>
        <ProvisioningPanel data={data} isPending={isPending} run={run} />
        <div className="rounded-md border border-[var(--border)] bg-card p-4">
          <SectionHead icon={<Sparkles size={14} />} label="Active Brain briefing" />
          {briefing ? (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <MetricBox label="Overdue" value={briefing.overdueReplies} />
                <MetricBox label="Waiting" value={briefing.waitingThreads} />
                <MetricBox label="Unassigned" value={briefing.unassignedSharedThreads} />
              </div>
              <div>
                <p className="text-tiny font-semibold uppercase tracking-wide text-text-tertiary">Top next actions</p>
                <ul className="mt-2 space-y-1 text-[12.5px] text-text-secondary">
                  {briefing.topNextActions.length === 0 ? (
                    <li>No active email actions.</li>
                  ) : (
                    briefing.topNextActions.map((item) => <li key={item}>- {item}</li>)
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[13px] leading-5 text-text-secondary">
              Generate a policy-scoped email workload snapshot for assigned, waiting, overdue, and unassigned shared inbox work.
            </p>
          )}
          <button
            disabled={isPending || isBriefingPending}
            onClick={() => {
              startBriefingTransition(async () => {
                const result = await getEmailWorkloadBriefingAction();
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                setBriefing(result.briefing);
                toast.success("Email briefing generated");
              });
            }}
            className="mt-4 inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[12px] text-text-secondary hover:bg-surface disabled:opacity-50"
          >
            <Sparkles size={13} /> {isBriefingPending ? "Generating..." : "Generate briefing"}
          </button>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-card p-4">
          <SectionHead icon={<MoreHorizontal size={14} />} label="Audit events" />
          <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto">
            {data.audit.length === 0 ? (
              <p className="text-[13px] text-text-tertiary">No audit events yet.</p>
            ) : (
              data.audit.map((event) => (
                <div key={event.id} className="rounded-md border border-[var(--border)] bg-[var(--background)] p-2">
                  <p className="text-[12.5px] font-medium text-text-primary">{event.action}</p>
                  <p className="text-tiny text-text-tertiary">{event.actorName ?? "System"} · {relativeTime(event.createdAt)}</p>
                  {event.reason && <p className="mt-1 text-tiny text-text-secondary">Reason: {event.reason}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MailboxClassificationEditor({
  mailbox,
  members,
  isPending,
  run,
}: {
  mailbox: EmailModuleData["mailboxes"][number];
  members: EmailModuleData["members"];
  isPending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => void;
}) {
  const [classifyType, setClassifyType] = useState<"personal" | "shared" | "system">(mailbox.type);
  const [classifyOwnerId, setClassifyOwnerId] = useState(mailbox.ownerUserId ?? "");
  return (
    <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-2">
      <p className="text-tiny font-semibold uppercase tracking-wide text-text-tertiary">Classification</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select
          value={classifyType}
          onChange={(event) => setClassifyType(event.target.value as "personal" | "shared" | "system")}
          className="h-8 rounded-md border border-[var(--border)] bg-card px-2 text-[12px]"
        >
          <option value="personal">Personal</option>
          <option value="shared">Shared</option>
          <option value="system">System</option>
        </select>
        <select
          value={classifyOwnerId}
          onChange={(event) => setClassifyOwnerId(event.target.value)}
          disabled={classifyType !== "personal"}
          className="h-8 rounded-md border border-[var(--border)] bg-card px-2 text-[12px] disabled:opacity-50"
        >
          <option value="">Owner</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending || (classifyType === "personal" && !classifyOwnerId)}
          onClick={() =>
            run(
              () =>
                classifyMailboxAction({
                  mailboxId: mailbox.id,
                  type: classifyType,
                  ownerUserId: classifyType === "personal" ? classifyOwnerId : null,
                }),
              "Mailbox classified",
            )
          }
          className="h-8 rounded-md bg-text-primary px-3 text-[12px] font-medium text-[var(--background)] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ProvisioningPanel({
  data,
  isPending,
  run,
}: {
  data: EmailModuleData;
  isPending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => void;
}) {
  const [sharedAddress, setSharedAddress] = useState("sales@caneycloud.com");
  const [sharedDisplayName, setSharedDisplayName] = useState("Sales");
  const [sharedAccessIds, setSharedAccessIds] = useState<Set<string>>(() => new Set());
  const [teamName, setTeamName] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  const [teamPassword, setTeamPassword] = useState("");
  const [usageLocation, setUsageLocation] = useState("US");
  const toggleSharedAccess = (userId: string) => {
    setSharedAccessIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };
  const provisionShared = () => {
    run(
      () =>
        provisionSharedInboxAction({
          address: sharedAddress,
          displayName: sharedDisplayName,
          userIds: [...sharedAccessIds],
        }),
      "Shared inbox provisioning started",
    );
  };
  const provisionTeamMember = () => {
    run(
      () =>
        provisionTeamMemberMailboxAction({
          displayName: teamName,
          email: teamEmail,
          temporaryPassword: teamPassword,
          usageLocation,
        }),
      "Team member provisioning started",
    );
  };
  return (
    <div className="rounded-md border border-[var(--border)] bg-card p-4 xl:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SectionHead icon={<UserPlus size={14} />} label="Mailbox provisioning" />
        <p className="text-tiny text-text-tertiary">
          {providerLabel(data.provider)} authority
        </p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
          <div className="flex items-center gap-2">
            <Inbox size={14} className="text-text-tertiary" />
            <p className="text-[13px] font-medium text-text-primary">Provision shared inbox</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={sharedAddress}
              onChange={(event) => setSharedAddress(event.target.value)}
              placeholder="sales@caneycloud.com"
              className="h-9 rounded-md border border-[var(--border)] bg-card px-2 text-[13px]"
            />
            <input
              value={sharedDisplayName}
              onChange={(event) => setSharedDisplayName(event.target.value)}
              placeholder="Sales"
              className="h-9 rounded-md border border-[var(--border)] bg-card px-2 text-[13px]"
            />
          </div>
          <div className="mt-3 grid gap-1 sm:grid-cols-2">
            {data.members.map((member) => (
              <label key={member.userId} className="flex h-8 items-center gap-2 rounded-md border border-[var(--border)] bg-card px-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={sharedAccessIds.has(member.userId)}
                  onChange={() => toggleSharedAccess(member.userId)}
                />
                <span className="min-w-0 truncate">{member.displayName}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={provisionShared}
            className="mt-3 inline-flex h-8 items-center gap-2 rounded-md bg-text-primary px-3 text-[12px] font-medium text-[var(--background)] disabled:opacity-50"
          >
            <MailCheck size={13} /> Create/request inbox
          </button>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
          <div className="flex items-center gap-2">
            <UserPlus size={14} className="text-text-tertiary" />
            <p className="text-[13px] font-medium text-text-primary">Provision team member</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Tomas Caney"
              className="h-9 rounded-md border border-[var(--border)] bg-card px-2 text-[13px]"
            />
            <input
              value={teamEmail}
              onChange={(event) => setTeamEmail(event.target.value)}
              placeholder="tomas@caneycloud.com"
              className="h-9 rounded-md border border-[var(--border)] bg-card px-2 text-[13px]"
            />
            <input
              value={teamPassword}
              onChange={(event) => setTeamPassword(event.target.value)}
              placeholder={data.provider?.provider === "microsoft_365" ? "Temporary Microsoft password" : "Optional provider password"}
              type="password"
              className="h-9 rounded-md border border-[var(--border)] bg-card px-2 text-[13px]"
            />
            <input
              value={usageLocation}
              onChange={(event) => setUsageLocation(event.target.value.toUpperCase())}
              placeholder="US"
              maxLength={2}
              className="h-9 rounded-md border border-[var(--border)] bg-card px-2 text-[13px]"
            />
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={provisionTeamMember}
            className="mt-3 inline-flex h-8 items-center gap-2 rounded-md bg-text-primary px-3 text-[12px] font-medium text-[var(--background)] disabled:opacity-50"
          >
            <UserPlus size={13} /> Create/invite member
          </button>
        </div>
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <p className="text-tiny font-semibold uppercase tracking-wide text-text-tertiary">Provisioning requests</p>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {data.provisioningRequests.length === 0 ? (
            <p className="text-[12.5px] text-text-tertiary">No provisioning requests yet.</p>
          ) : (
            data.provisioningRequests.slice(0, 8).map((request) => {
              const manualSteps = request.providerPlan.manualSteps ?? [];
              const canCheck = request.status === "requested" || request.status === "provider_pending" || request.status === "provider_ready";
              return (
                <div key={request.id} className="rounded-md border border-[var(--border)] bg-[var(--background)] p-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-text-primary">{request.targetEmail}</p>
                      <p className="text-tiny text-text-tertiary">
                        {request.kind.replace("_", " ")} · {relativeTime(request.createdAt)} · {request.requestedByName ?? "admin"}
                      </p>
                    </div>
                    <Chip label={request.status} tone={request.status === "completed" ? "green" : request.status === "provider_pending" ? "amber" : "blue"} />
                  </div>
                  {manualSteps.length > 0 && (
                    <ol className="mt-2 space-y-1 text-tiny text-text-secondary">
                      {manualSteps.slice(0, 3).map((step, index) => (
                        <li key={`${request.id}-${index}`}>{index + 1}. {step}</li>
                      ))}
                    </ol>
                  )}
                  {canCheck && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => checkProvisioningRequestAction(request.id), "Provisioning checked")}
                      className="mt-2 h-7 rounded-md border border-[var(--border)] px-2 text-tiny text-text-secondary hover:bg-surface disabled:opacity-50"
                    >
                      Check/import ready
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "blue" | "gold" | "green" | "amber" }) {
  return (
    <span className={cx(
      "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-tiny",
      tone === "blue" && "bg-blue-500/10 text-[var(--blue-text)]",
      tone === "gold" && "bg-amber-bg text-amber-text",
      tone === "green" && "bg-green-500/10 text-green-mid",
      tone === "amber" && "bg-amber-500/10 text-amber-700",
      tone === "neutral" && "bg-surface text-text-tertiary",
    )}>
      <span className="truncate">{label}</span>
    </span>
  );
}

function IconButton({ label, onClick, icon, disabled = false }: { label: string; onClick: () => void; icon: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary hover:bg-card hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
    </button>
  );
}

function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-tiny font-semibold uppercase tracking-wide text-text-tertiary">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function AccessButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-8 rounded-md border border-[var(--border)] text-[12px] hover:bg-surface">
      {label}
    </button>
  );
}

function MetricBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-2">
      <p className="text-[16px] font-semibold text-text-primary">{value}</p>
      <p className="text-tiny text-text-tertiary">{label}</p>
    </div>
  );
}

function MailboxSignatureEditor({
  mailbox,
  run,
}: {
  mailbox: EmailModuleData["mailboxes"][number];
  run: (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => void;
}) {
  const [signature, setSignature] = useState(mailbox.signature ?? "");
  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <p className="text-tiny font-semibold uppercase tracking-wide text-text-tertiary">Signature</p>
      <textarea
        value={signature}
        onChange={(event) => setSignature(event.target.value)}
        rows={4}
        placeholder={`Signature for ${mailbox.address}`}
        className="mt-2 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-[13px]"
      />
      <button
        type="button"
        onClick={() => run(() => updateMailboxSignatureAction(mailbox.id, signature), "Signature saved")}
        className="mt-2 h-8 rounded-md bg-text-primary px-3 text-[12px] font-medium text-[var(--background)]"
      >
        Save signature
      </button>
    </div>
  );
}

function ReadyRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <Check size={14} className="text-green-mid" /> : <X size={14} className="text-red-text" />}
      <span>{label}</span>
    </li>
  );
}
