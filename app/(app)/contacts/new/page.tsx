import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { ContactForm } from "@/components/contacts/contact-form";
import { DbBanner } from "@/components/db-banner";
import { listTags } from "@/db/queries/tags";
import { listOrgContacts } from "@/db/queries/contacts";
import { safeRead } from "@/lib/db-status";
import { createContact } from "../actions";

type SearchParams = Promise<{ type?: string }>;

export default async function NewContactPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const initialType = sp.type === "org" ? "org" : "person";
  const [tagsRes, orgOptionsRes] = await Promise.all([
    safeRead(() => listTags(), []),
    safeRead(() => listOrgContacts({ workspaceId: user.workspaceId }), []),
  ]);

  async function action(formData: FormData) {
    "use server";
    return createContact(null, formData);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> Back to contacts
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">New contact</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            People + orgs you want to track. Channels, tags, intro chain all
            optional.
          </p>
        </header>

        {!tagsRes.ok && <DbBanner error={tagsRes.error} />}

        <Card>
          <CardContent className="pt-6">
            <ContactForm
              initial={{ type: initialType }}
              availableTags={tagsRes.data}
              orgOptions={orgOptionsRes.data}
              action={action}
              submitLabel="Create contact"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
