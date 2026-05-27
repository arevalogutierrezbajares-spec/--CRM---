import { requireUser } from "@/lib/current-user";
import { AgentChat } from "./agent-chat";

export const metadata = {
  title: "Agent · AGB CRM",
};

export default async function AgentPage() {
  const user = await requireUser();
  return <AgentChat userDisplayName={user.displayName} />;
}
