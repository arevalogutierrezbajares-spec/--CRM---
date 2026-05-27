import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { WorkNav } from "@/components/work/work-nav";
import { listThemes, seedDefaultThemes } from "@/db/queries/work";
import { listProjects } from "@/db/queries/projects";
import { safeRead } from "@/lib/db-status";
import { createInitiative } from "@/app/(app)/work/actions";

export default async function NewInitiativePage() {
  const user = await requireUser();
  await seedDefaultThemes(user.workspaceId).catch(() => {});

  const [themesRes, projectsRes] = await Promise.all([
    safeRead(() => listThemes(user.workspaceId), []),
    safeRead(
      () => listProjects({ workspaceId: user.workspaceId, status: "active" }),
      [],
    ),
  ]);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-6 space-y-4">
        <Link
          href="/initiatives"
          className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft size={14} /> Initiatives
        </Link>

        <header>
          <h1 className="text-[22px] font-medium tracking-tight">New initiative</h1>
          <p className="text-[13px] text-text-secondary">
            A multi-week container for related tasks. Group by venture or theme.
          </p>
        </header>

        <WorkNav />

        <form
          action={createInitiative}
          className="space-y-3 rounded-lg border bg-card p-4"
          style={{ borderColor: "var(--border-default)" }}
        >
          <Field label="Title">
            <input
              name="title"
              required
              placeholder="e.g. Treasury module build"
              className={INPUT}
            />
          </Field>
          <Field label="Summary">
            <input
              name="summary"
              placeholder="One-line description"
              className={INPUT}
            />
          </Field>
          <Field label="Goal (the why)">
            <textarea
              name="goal"
              rows={3}
              placeholder="What outcome does this drive?"
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Venture">
              <select name="projectId" defaultValue="" className={INPUT}>
                <option value="">— Cross-venture —</option>
                {projectsRes.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" defaultValue="next" className={INPUT}>
                <option value="now">NOW</option>
                <option value="next">NEXT</option>
                <option value="later">LATER</option>
                <option value="backlog">BACKLOG</option>
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue="planning" className={INPUT}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" name="startDate" className={INPUT} />
            </Field>
            <Field label="Target end date">
              <input type="date" name="targetEndDate" className={INPUT} />
            </Field>
          </div>

          {themesRes.data.length > 0 && (
            <Field label="Themes">
              <div className="flex flex-wrap gap-2 pt-1">
                {themesRes.data.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] cursor-pointer hover:bg-surface"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <input type="checkbox" name="themeIds" value={t.id} />
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: t.color ?? "var(--text-tertiary)" }}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/initiatives">Cancel</Link>
            </Button>
            <Button type="submit" size="sm">
              Create initiative
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}

const INPUT =
  "w-full rounded-md border bg-card px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-tiny text-text-secondary font-medium">{label}</span>
      {children}
    </label>
  );
}
