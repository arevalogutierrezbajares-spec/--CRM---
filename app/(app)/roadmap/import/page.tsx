import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { WorkNav } from "@/components/work/work-nav";
import { ImportClient } from "@/components/roadmap/import-client";

export default async function RoadmapImportPage() {
  const user = await requireUser();
  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Import roadmap</h1>
          <p className="text-[13px] text-text-secondary">
            Paste a Roadmap-MD document. You review every change before anything is
            written — deletions are never automatic.
          </p>
        </header>
        <WorkNav />
        <ImportClient />
      </main>
    </>
  );
}
