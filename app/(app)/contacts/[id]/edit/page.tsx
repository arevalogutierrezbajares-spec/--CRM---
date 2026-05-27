import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { ContactForm } from "@/components/contacts/contact-form";
import { DbBanner } from "@/components/db-banner";
import { getContact } from "@/db/queries/contacts";
import { listTags } from "@/db/queries/tags";
import { safeRead } from "@/lib/db-status";
import { updateContact } from "../../actions";

type Params = Promise<{ id: string }>;

export default async function EditContactPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const [contactRes, tagsRes] = await Promise.all([
    safeRead(() => getContact({ id, workspaceId: user.workspaceId }), null),
    safeRead(() => listTags(), []),
  ]);

  if (contactRes.ok && !contactRes.data) notFound();

  const contact = contactRes.data;

  async function action(formData: FormData) {
    "use server";
    return updateContact(id, null, formData);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Link
          href={`/contacts/${id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> Back to contact
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit {contact?.name ?? "contact"}
          </h1>
        </header>

        {!contactRes.ok && <DbBanner error={contactRes.error} />}

        <Card>
          <CardContent className="pt-6">
            <ContactForm
              initial={
                contact
                  ? {
                      id: contact.id,
                      name: contact.name,
                      type: contact.type,
                      organization: contact.organization,
                      relationshipType: contact.relationshipType,
                      introChainFromText: contact.introChainFromText,
                      notesPath: contact.notesPath,
                      channels: contact.channels.map((c) => ({
                        kind: c.kind as "email" | "phone" | "whatsapp" | "instagram" | "domain",
                        value: c.value,
                      })),
                      tagIds: contact.tags.map((t) => t.id),
                    }
                  : undefined
              }
              availableTags={tagsRes.data}
              action={action}
              submitLabel="Save changes"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
