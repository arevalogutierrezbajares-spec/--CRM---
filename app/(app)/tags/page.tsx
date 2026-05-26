import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DbBanner } from "@/components/db-banner";
import { listTags } from "@/db/queries/tags";
import { safeRead } from "@/lib/db-status";
import { createTag, deleteTag } from "./actions";

export default async function TagsPage() {
  const user = await requireUser();
  const res = await safeRead(() => listTags(), []);

  async function create(formData: FormData) {
    "use server";
    await createTag(formData);
  }
  async function remove(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (id) await deleteTag(id);
  }

  const venture = res.data.filter((t) => t.kind === "venture");
  const custom = res.data.filter((t) => t.kind === "custom");

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Venture tags (caney / vav / bd / friend) drive the pill bar and are
            seeded — they can&apos;t be deleted. Custom tags are yours to manage.
          </p>
        </header>

        {!res.ok && <DbBanner error={res.error} />}

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Venture tags</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {venture.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Venture tags appear once the database seed has run.
                </p>
              )}
              {venture.map((t) => (
                <Badge key={t.id} variant="default" className="text-sm">
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: t.color ?? "transparent" }}
                  />
                  {t.name}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {custom.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No custom tags yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {custom.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          aria-hidden
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: t.color ?? "#888" }}
                        />
                        {t.name}
                      </div>
                      <form action={remove}>
                        <input type="hidden" name="id" value={t.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-[var(--destructive)]"
                        >
                          Delete
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <form
                action={create}
                className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-4"
              >
                <div className="flex-1 space-y-1">
                  <Label htmlFor="tag-name">Name</Label>
                  <Input
                    id="tag-name"
                    name="name"
                    placeholder="e.g. ai-ok, personal-only"
                    required
                  />
                </div>
                <div className="w-28 space-y-1">
                  <Label htmlFor="tag-color">Color</Label>
                  <Input
                    id="tag-color"
                    name="color"
                    type="color"
                    defaultValue="#6b7280"
                  />
                </div>
                <Button type="submit">Add tag</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
