import { requireUser } from "@/lib/current-user";

/**
 * Chrome-less, auth-gated surface for present mode. Deliberately a sibling of
 * (app) so it does NOT inherit the Sidebar / command palette — the screen-share
 * stage fills the whole viewport. Auth still required via requireUser().
 */
export default async function StageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <div className="min-h-screen bg-black text-white">{children}</div>;
}
