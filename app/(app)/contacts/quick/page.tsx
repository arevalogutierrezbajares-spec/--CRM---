import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickContactRecorder } from "@/components/contacts/quick-contact-recorder";

export default async function QuickContactPage() {
  const user = await requireUser();
  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            30-sec contact
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Talk for 30 seconds. We transcribe, extract their name + org +
            relationship, and create the contact in one shot.
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent>
            <QuickContactRecorder />
          </CardContent>
        </Card>

        <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
          <p className="mb-1 font-medium text-[var(--foreground)]">
            Try saying something like:
          </p>
          <p className="italic">
            &ldquo;Just met Marta López, runs Posada La Rosa in Caney —
            potential partner for the Caney onboarding project. We talked about
            booking flow at the IDB dinner.&rdquo;
          </p>
        </div>
      </main>
    </>
  );
}
