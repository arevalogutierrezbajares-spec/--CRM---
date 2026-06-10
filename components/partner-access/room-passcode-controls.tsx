"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { setPartnerRoomPasscodeAction } from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";

/**
 * Owner controls for the optional 4-digit code on the public link. Changing
 * or removing the code invalidates every previously unlocked browser.
 */
export function RoomPasscodeControls({
  roomId,
  hasPasscode,
}: {
  roomId: string;
  hasPasscode: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [justSet, setJustSet] = useState<string | null>(null);

  function save() {
    if (!/^\d{4}$/.test(code)) {
      toast.error("The code must be exactly 4 digits");
      return;
    }
    const value = code;
    startTransition(async () => {
      const res = await setPartnerRoomPasscodeAction({ roomId, passcode: value });
      if (res.ok) {
        toast.success(hasPasscode ? "Code updated" : "Room is now code-protected");
        setEditing(false);
        setCode("");
        setJustSet(value);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await setPartnerRoomPasscodeAction({ roomId, passcode: null });
      if (res.ok) {
        toast.success("Code removed — the link alone opens the room");
        setEditing(false);
        setCode("");
        setJustSet(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {hasPasscode ? (
            <>
              <ShieldCheck className="h-4 w-4 text-green-600" />
              Code-protected
            </>
          ) : (
            <>
              <ShieldOff className="h-4 w-4 text-[var(--muted-foreground)]" />
              No access code
            </>
          )}
        </div>
        {!editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {hasPasscode ? "Change code" : "Set code"}
          </Button>
        )}
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        {hasPasscode
          ? "Visitors must enter the 4-digit code once per browser."
          : "Add a 4-digit code so a forwarded link isn't enough to get in."}
      </p>

      {justSet && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-2 text-xs">
          Code set to{" "}
          <span className="font-mono font-semibold tracking-widest">{justSet}</span>
          . Share it with your contact — it won&rsquo;t be shown again.
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
            }}
            inputMode="numeric"
            maxLength={4}
            placeholder="4 digits"
            aria-label="New 4-digit access code"
            className="w-28 text-center font-mono tracking-[0.3em]"
          />
          <Button
            type="button"
            size="sm"
            disabled={pending || code.length !== 4}
            onClick={save}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setEditing(false);
              setCode("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {hasPasscode && !editing && (
        <ConfirmDialog
          title="Remove the access code?"
          description="Anyone with the link will be able to open the room without a code."
          confirmLabel="Remove code"
          destructive
          onConfirm={remove}
          trigger={(open) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[var(--destructive)]"
              disabled={pending}
              onClick={open}
            >
              Remove code
            </Button>
          )}
        />
      )}
    </div>
  );
}
