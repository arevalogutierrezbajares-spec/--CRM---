import { requireUser } from "@/lib/current-user";
import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { PresenceProvider } from "@/lib/presence/presence-context";
import { CommandPalette } from "@/components/command/command-palette";
import { DemoTourProvider } from "@/components/demo/demo-tour-provider";
import { DemonModeController } from "@/components/jarvis/demon-mode-controller";
import { GlobalShortcuts } from "@/components/command/global-shortcuts";
import { MotionProvider } from "@/components/motion-provider";
import { safeRead } from "@/lib/db-status";
import { greetingIdentity } from "@/lib/greeting";
import { listProjectsForPicker, listWorkspaceDocs, type WorkspaceDoc } from "@/db/queries/items";
import { listFavoriteProjects } from "@/db/queries/pins";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [projectsRes, favoritesRes, docsRes] = await Promise.all([
    safeRead<{ id: string; title: string }[]>(() => listProjectsForPicker(user.workspaceId), []),
    safeRead<{ id: string; title: string }[]>(() => listFavoriteProjects(user.workspaceId, user.id), []),
    safeRead<WorkspaceDoc[]>(() => listWorkspaceDocs(user.workspaceId), []),
  ]);
  const jarvisIdentity = greetingIdentity(user.displayName, user.email);
  return (
    <PresenceProvider
      workspaceId={user.workspaceId}
      userId={user.id}
      userName={user.displayName}
    >
      <MotionProvider>
        <DemoTourProvider>
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
            <GlobalShortcuts />
            <DemonModeController identitySlug={jarvisIdentity.slug} />
          </div>
        </DemoTourProvider>
      </MotionProvider>
    </PresenceProvider>
  );
}
