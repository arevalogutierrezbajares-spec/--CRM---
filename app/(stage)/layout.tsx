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
  // Definite viewport height (dvh tracks mobile browser chrome) so the present
  // stage's h-full chain resolves — otherwise iframes collapse to a thin band.
  return <div className="h-dvh overflow-hidden bg-black text-white">{children}</div>;
}
