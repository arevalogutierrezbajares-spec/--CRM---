import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import { listPosts, type PostView } from "@/db/queries/town-hall";
import { listWorkspaceMembers } from "@/db/queries/team";
import { listProjectsForPicker } from "@/db/queries/items";
import { Feed } from "@/components/town-hall/feed";
import type { MemberOption, RefObject } from "@/components/town-hall/types";

export default async function TownHallPage() {
  const user = await requireUser();

  const [postsRes, membersRes, projectsRes] = await Promise.all([
    safeRead<PostView[]>(
      () => listPosts({ workspaceId: user.workspaceId, viewerId: user.id, limit: 100 }),
      [],
    ),
    safeRead(() => listWorkspaceMembers(user.workspaceId), []),
    safeRead(() => listProjectsForPicker(user.workspaceId), []),
  ]);

  const members: MemberOption[] = membersRes.data.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
  }));

  // Objects the composer can #reference. Projects are surfaced today; more
  // object types can be appended here as their pickers land.
  const objects: RefObject[] = projectsRes.data.map((p) => ({
    refType: "project" as const,
    refId: p.id,
    label: p.title,
    href: `/projects/${p.id}`,
  }));

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        title="Town Hall"
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Town Hall</h1>
          <p className="text-[13px] text-text-secondary">
            One feed for the workspace. @mention teammates, #reference projects,
            and turn meeting notes into action items.
          </p>
        </header>

        {!postsRes.ok && (
          <DbBanner error={(postsRes as { error?: string }).error ?? ""} />
        )}

        <Feed
          workspaceId={user.workspaceId}
          initialPosts={postsRes.data}
          members={members}
          objects={objects}
        />
      </main>
    </>
  );
}
