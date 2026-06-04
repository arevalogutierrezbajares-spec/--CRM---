"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requestPasswordChange } from "@/app/actions/auth";

export function ChangePasswordCard() {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);

  function onClick() {
    start(async () => {
      const res = await requestPasswordChange();
      if (res.ok) {
        setSent(true);
        toast.success("Check your email to set a new password.");
      } else {
        toast.error(res.error ?? "Could not start the password change.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">
          Change your password. For security we&apos;ll email you a verification link first —
          open it to set the new one.
        </p>
        {sent ? (
          <p className="text-sm text-[var(--green-text)]">
            Verification link sent — check your inbox.
          </p>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onClick} loading={pending}>
            Change password
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
