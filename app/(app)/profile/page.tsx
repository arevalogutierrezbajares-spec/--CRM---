import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import { getProfile, updateProfile } from "./actions";

const COMMON_TZ = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Caracas",
  "America/Bogota",
  "America/Mexico_City",
  "Europe/Madrid",
  "Europe/London",
];

export default async function ProfilePage() {
  const user = await requireUser();
  const profileRes = await safeRead(() => getProfile(), null);
  const profile = profileRes.data;

  async function action(formData: FormData) {
    "use server";
    await updateProfile(formData);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Display name + timezone. Timezone drives This-Week rollups and AI
            briefing send time.
          </p>
        </header>

        {!profileRes.ok && <DbBanner error={profileRes.error} />}

        <Card>
          <CardHeader>
            <CardTitle>You</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={action} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user.email} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  required
                  defaultValue={profile?.displayName ?? user.displayName}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  name="timezone"
                  list="tz-list"
                  required
                  defaultValue={profile?.timezone ?? "America/New_York"}
                />
                <datalist id="tz-list">
                  {COMMON_TZ.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
                <p className="text-xs text-[var(--muted-foreground)]">
                  IANA tz name (e.g. America/New_York, America/Caracas).
                </p>
              </div>
              <div className="flex justify-end border-t border-[var(--border)] pt-4">
                <Button type="submit">Save profile</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
