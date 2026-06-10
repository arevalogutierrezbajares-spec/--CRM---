"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  createVaultItemAction,
  deleteVaultItemAction,
  lockVaultAction,
  revealVaultItemAction,
  setupVaultAction,
  unlockVaultAction,
  updateVaultItemAction,
} from "@/app/(app)/platforms/actions";
import type { VaultItemListed } from "@/db/queries/vault";
import type { VaultCategory } from "@/db/vault-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const CATEGORY_LABELS: Record<VaultCategory, string> = {
  platform: "Platform admins",
  demo: "Demo accounts",
  social: "Social media",
  other: "Other",
};
const CATEGORY_ORDER: VaultCategory[] = ["platform", "demo", "social", "other"];

const fieldCls =
  "h-9 w-full rounded-md border bg-transparent px-2.5 text-[13px] text-text-primary outline-none focus:ring-1 focus:ring-[var(--ring)]";

async function copyText(value: string, what: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Clipboard blocked by the browser");
  }
}

type Revealed = { password: string | null; notes: string | null };

export function VaultSection({
  configured,
  hasPassphrase,
  unlocked,
  items,
  currentUserId,
}: {
  configured: boolean;
  hasPassphrase: boolean;
  unlocked: boolean;
  items: VaultItemListed[];
  currentUserId: string;
}) {
  return (
    <section
      className="rounded-lg border bg-card p-4 space-y-4"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-medium text-text-primary">
            <ShieldCheck className="h-4 w-4" /> Credentials Vault
          </h2>
          <p className="text-[12px] text-text-secondary">
            Demo accounts, platform logins, social media — encrypted at rest,
            behind its own passphrase. Auto-locks after 15 minutes.
          </p>
        </div>
        {unlocked && <LockNowButton />}
      </div>

      {!configured ? (
        <p className="text-[12px] text-text-secondary">
          Set <code>VAULT_MASTER_KEY</code> (64 hex chars) to enable the vault.
        </p>
      ) : !hasPassphrase ? (
        <SetupForm firstTime />
      ) : !unlocked ? (
        <UnlockForm />
      ) : (
        <UnlockedVault items={items} currentUserId={currentUserId} />
      )}
    </section>
  );
}

function LockNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await lockVaultAction();
          router.refresh();
        })
      }
    >
      <Lock className="h-3.5 w-3.5" /> Lock now
    </Button>
  );
}

function SetupForm({ firstTime }: { firstTime: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");

  function submit() {
    if (passphrase !== confirm) {
      toast.error("Passphrases don't match");
      return;
    }
    startTransition(async () => {
      const res = await setupVaultAction({
        passphrase,
        currentPassphrase: firstTime ? undefined : current,
      });
      if (res.ok) {
        toast.success(firstTime ? "Vault created and unlocked" : "Passphrase changed");
        setCurrent("");
        setPassphrase("");
        setConfirm("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="max-w-sm space-y-2">
      {firstTime && (
        <p className="text-[12px] text-text-secondary">
          Choose a vault passphrase (min 8 characters). It is never stored —
          only you can open your vault, even among workspace members.
        </p>
      )}
      {!firstTime && (
        <Input
          type="password"
          placeholder="Current passphrase"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="off"
        />
      )}
      <Input
        type="password"
        placeholder={firstTime ? "Vault passphrase" : "New passphrase"}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        autoComplete="off"
      />
      <Input
        type="password"
        placeholder="Repeat passphrase"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="off"
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <Button size="sm" onClick={submit} disabled={pending || passphrase.length === 0}>
        <KeyRound className="h-3.5 w-3.5" />
        {firstTime ? "Create vault" : "Change passphrase"}
      </Button>
    </div>
  );
}

function UnlockForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [passphrase, setPassphrase] = useState("");

  function submit() {
    if (!passphrase) return;
    startTransition(async () => {
      const res = await unlockVaultAction({ passphrase });
      if (res.ok) {
        setPassphrase("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex max-w-sm items-center gap-2">
      <Input
        type="password"
        placeholder="Vault passphrase"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        autoComplete="off"
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <Button size="sm" onClick={submit} disabled={pending || !passphrase}>
        <LockOpen className="h-3.5 w-3.5" /> Unlock
      </Button>
    </div>
  );
}

function UnlockedVault({
  items,
  currentUserId,
}: {
  items: VaultItemListed[];
  currentUserId: string;
}) {
  const [dialogItem, setDialogItem] = useState<VaultItemListed | "new" | null>(null);
  const [changingPass, setChangingPass] = useState(false);

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    rows: items.filter((i) => i.category === cat),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setDialogItem("new")}>
          <Plus className="h-3.5 w-3.5" /> Add account
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setChangingPass((v) => !v)}>
          <KeyRound className="h-3.5 w-3.5" /> Change passphrase
        </Button>
      </div>

      {changingPass && <SetupForm firstTime={false} />}

      {grouped.length === 0 ? (
        <p className="text-[12px] text-text-secondary">
          No accounts yet — add your first one.
        </p>
      ) : (
        grouped.map(({ cat, rows }) => (
          <div key={cat} className="space-y-1.5">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="space-y-1">
              {rows.map((item) => (
                <VaultRow
                  key={item.id}
                  item={item}
                  isOwner={item.ownerUserId === currentUserId}
                  onEdit={() => setDialogItem(item)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <ItemDialog
        key={dialogItem === "new" ? "new" : (dialogItem?.id ?? "closed")}
        item={dialogItem === "new" ? null : dialogItem}
        open={dialogItem !== null}
        onClose={() => setDialogItem(null)}
      />
    </div>
  );
}

function VaultRow({
  item,
  isOwner,
  onEdit,
}: {
  item: VaultItemListed;
  isOwner: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<Revealed | null>(null);

  async function reveal(): Promise<Revealed | null> {
    const res = await revealVaultItemAction({ id: item.id });
    if (!res.ok) {
      toast.error(res.error);
      if (res.error.includes("locked")) router.refresh();
      return null;
    }
    return { password: res.password, notes: res.notes };
  }

  function toggleReveal() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    startTransition(async () => {
      const r = await reveal();
      if (r) setRevealed(r);
    });
  }

  function copyPassword() {
    startTransition(async () => {
      const r = revealed ?? (await reveal());
      if (r?.password) await copyText(r.password, "Password");
      else if (r) toast.error("No password stored on this item");
    });
  }

  async function remove() {
    const res = await deleteVaultItemAction({ id: item.id });
    if (res.ok) {
      toast.success("Deleted");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div
      className="rounded-md border px-2.5 py-2"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium text-text-primary">
          {item.label}
        </span>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-tertiary hover:text-text-primary"
            aria-label={`Open ${item.label}`}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {item.visibility === "workspace" && (
          <Badge variant="secondary">Shared</Badge>
        )}
        <span className="ml-auto flex items-center gap-1">
          {isOwner && (
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {isOwner && (
            <ConfirmDialog
              title={`Delete "${item.label}"?`}
              description="The stored password and notes are gone for good."
              confirmLabel="Delete"
              destructive
              onConfirm={remove}
              trigger={(open) => (
                <Button variant="ghost" size="sm" onClick={open} aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            />
          )}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-secondary">
        {item.username && (
          <span className="flex items-center gap-1">
            {item.username}
            <button
              type="button"
              className="text-text-tertiary hover:text-text-primary"
              onClick={() => copyText(item.username!, "Username")}
              aria-label="Copy username"
            >
              <Copy className="h-3 w-3" />
            </button>
          </span>
        )}
        {item.hasSecret && (
          <span className="flex items-center gap-1 font-mono">
            {revealed?.password ?? "••••••••"}
            <button
              type="button"
              className="text-text-tertiary hover:text-text-primary disabled:opacity-50"
              onClick={toggleReveal}
              disabled={pending}
              aria-label={revealed ? "Hide password" : "Reveal password"}
            >
              {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
            <button
              type="button"
              className="text-text-tertiary hover:text-text-primary disabled:opacity-50"
              onClick={copyPassword}
              disabled={pending}
              aria-label="Copy password"
            >
              <Copy className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {revealed?.notes && (
        <p className="mt-1 whitespace-pre-wrap rounded bg-[var(--secondary)] p-2 text-[12px] text-text-secondary">
          {revealed.notes}
        </p>
      )}
    </div>
  );
}

function ItemDialog({
  item,
  open,
  onClose,
}: {
  item: VaultItemListed | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(item?.label ?? "");
  const [category, setCategory] = useState<string>(item?.category ?? "platform");
  const [username, setUsername] = useState(item?.username ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<string>(item?.visibility ?? "private");

  function submit() {
    startTransition(async () => {
      const base = { label, category, username, url, visibility };
      const res = item
        ? await updateVaultItemAction({
            id: item.id,
            ...base,
            // Blank = keep what's stored; typing replaces it.
            ...(password ? { password } : {}),
            ...(notes ? { notes } : {}),
          })
        : await createVaultItemAction({ ...base, password, notes });
      if (res.ok) {
        toast.success(item ? "Saved" : "Account added");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.label}` : "Add account"}</DialogTitle>
          <DialogDescription>
            Password and secret notes are encrypted before they touch the database.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            placeholder="Label (e.g. VAV demo posada)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={fieldCls}
              style={{ borderColor: "var(--border-default)" }}
              aria-label="Category"
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className={fieldCls}
              style={{ borderColor: "var(--border-default)" }}
              aria-label="Who can see this"
            >
              <option value="private">Only me</option>
              <option value="workspace">Workspace</option>
            </select>
          </div>
          <Input
            placeholder="Username / email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
          />
          <Input
            placeholder="URL (login page)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Input
            type="password"
            placeholder={item?.hasSecret ? "Password (blank = unchanged)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <textarea
            placeholder={
              item?.hasNotes
                ? "Secret notes (blank = unchanged)"
                : "Secret notes — 2FA backup codes, recovery email…"
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${fieldCls} h-auto py-2`}
            style={{ borderColor: "var(--border-default)" }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={pending || !label.trim()}>
            {item ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
