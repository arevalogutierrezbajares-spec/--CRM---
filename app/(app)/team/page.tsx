import { requireUser } from "@/lib/current-user";
import { listWorkspaceMembers } from "@/db/queries/team";
import { listWorkspaceActivity } from "@/db/queries/activity";
import { TeamView } from "@/components/team/team-view";

export default async function TeamPage() {
  const user = await requireUser();
  const [members, activity] = await Promise.all([
    listWorkspaceMembers(user.workspaceId),
    listWorkspaceActivity(user.workspaceId),
  ]);

  return (
    <TeamView members={members} activity={activity} selfId={user.id} selfRole={user.workspaceRole} />
  );
}
