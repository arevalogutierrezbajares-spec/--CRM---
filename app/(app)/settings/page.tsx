import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordCard } from "@/components/settings/change-password-card";
import { DemoTourCard } from "@/components/settings/demo-tour-card";
import { DemonModeCard } from "@/components/settings/demon-mode-card";
import { QuoteSettingsCard } from "@/components/settings/quote-settings-card";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        </header>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <Link className="text-sm underline" href="/profile">
                Display name, timezone →
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <Link className="text-sm underline" href="/tags">
                Manage custom tags →
              </Link>
            </CardContent>
          </Card>
          <QuoteSettingsCard />
          <DemoTourCard />
          <DemonModeCard />
          <ChangePasswordCard />
        </div>
      </main>
    </>
  );
}
