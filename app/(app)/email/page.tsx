import { requireUser } from "@/lib/current-user";
import { safeRead } from "@/lib/db-status";
import { getEmailModuleData, type EmailModuleData } from "@/db/queries/email";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { EmailModuleShell } from "@/components/email/email-module-shell";

type SearchParams = Promise<{ thread?: string }>;

const EMPTY_EMAIL_DATA: EmailModuleData = {
  setupComplete: false,
  provider: null,
  mailboxes: [],
  threads: [],
  selectedThread: null,
  members: [],
  contacts: [],
  projects: [],
  initiatives: [],
  milestones: [],
  accessGrants: [],
  provisioningRequests: [],
  drafts: [],
  audit: [],
};

export default async function EmailPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const res = await safeRead(() => getEmailModuleData(user, sp.thread), EMPTY_EMAIL_DATA);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} title="Email" />
      {!res.ok && (
        <div className="px-4 pt-4 sm:px-6">
          <DbBanner error={res.error} />
        </div>
      )}
      <EmailModuleShell
        initialData={res.data}
        currentUser={{
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.workspaceRole,
        }}
      />
    </>
  );
}
