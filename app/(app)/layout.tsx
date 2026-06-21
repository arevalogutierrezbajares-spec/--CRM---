import { requireUser } from "@/lib/current-user";
import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { PresenceProvider } from "@/lib/presence/presence-context";
import { heartbeatAction } from "@/app/(app)/team/actions";
import { CommandPalette } from "@/components/command/command-palette";
import { GlobalShortcuts } from "@/components/command/global-shortcuts";
import { GlobalUploadModal } from "@/components/upload/global-upload-modal";
import { MotionProvider } from "@/components/motion-provider";
import { AmbientPlayer } from "@/components/ambient/ambient-player";
import { safeRead } from "@/lib/db-status";
import { listWorkspaceDocs, type WorkspaceDoc } from "@/db/queries/items";
import { listLines } from "@/db/queries/lines-of-business";
import { listFavoriteProjects } from "@/db/queries/pins";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [projectsRes, favoritesRes, docsRes] = await Promise.all([
    safeRead<{ id: string; title: string }[]>(
      // Businesses sort ahead of projects in the sidebar explorer tree.
      () =>
        listLines({ workspaceId: user.workspaceId, topLevelOnly: false }).then((rows) =>
          [...rows].sort((a, b) =>
            a.kind === b.kind ? 0 : a.kind === "business" ? -1 : 1,
          ),
        ),
      [],
    ),
    safeRead<{ id: string; title: string }[]>(() => listFavoriteProjects(user.workspaceId, user.id), []),
    safeRead<WorkspaceDoc[]>(() => listWorkspaceDocs(user.workspaceId), []),
  ]);
  return (
    <PresenceProvider
      workspaceId={user.workspaceId}
      userId={user.id}
      userName={user.displayName}
      heartbeat={heartbeatAction}
    >
      <MotionProvider>
      <div className="flex min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-[var(--primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--primary-foreground)] focus:shadow-lg focus:outline-none"
        >
          Skip to content
        </a>
        <Sidebar projects={projectsRes.data} favorites={favoritesRes.data} docs={docsRes.data} />
        <div id="main-content" className="flex min-w-0 flex-1 flex-col">
          {children}
        </div>
        <Toaster />
        <CommandPalette />
        <GlobalUploadModal projects={projectsRes.data} />
        <GlobalShortcuts />
        <AmbientPlayer />
      </div>
      </MotionProvider>
    </PresenceProvider>
  );
}
