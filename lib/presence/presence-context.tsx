"use client";

/**
 * Workspace-wide live presence over a Supabase Realtime Presence channel.
 * Mounted once in the app shell so every page contributes presence and any
 * component can read "who's online + what they're looking at" via usePresence().
 * A periodic heartbeat persists last-seen so offline teammates show "last seen…".
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type PresenceUser = {
  userId: string;
  name: string;
  color: string;
  label: string;
};

type PresenceValue = { online: PresenceUser[]; selfId: string };

const PresenceContext = createContext<PresenceValue | null>(null);

export function usePresence(): PresenceValue | null {
  return useContext(PresenceContext);
}

function colorFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

/** Human label of what a teammate is doing, from the current route. */
function labelForPath(path: string): string {
  if (path === "/") return "Home";
  if (path.includes("/docs/")) return "Editing a doc";
  const seg = path.split("/")[1] ?? "";
  const map: Record<string, string> = {
    projects: "Projects",
    contacts: "Contacts",
    meetings: "Meetings",
    work: "Work",
    research: "Research",
    pipeline: "Pipeline",
    treasury: "Treasury",
    network: "Network",
    team: "Team",
    workspace: "Workspace",
    profile: "Profile",
    agent: "Agent",
    overlord: "Overlord",
    "action-items": "Action items",
    brain: "Brain",
    initiatives: "Initiatives",
    sprint: "Sprint",
    roadmap: "Roadmap",
  };
  return map[seg] ?? "the app";
}

export function PresenceProvider({
  workspaceId,
  userId,
  userName,
  heartbeat,
  children,
}: {
  workspaceId: string;
  userId: string;
  userName: string;
  /** Persists last-seen. Injected by the app shell (a server action) so this
   * reusable lib stays decoupled from app/ routes. */
  heartbeat: () => void | Promise<unknown>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const color = useMemo(() => colorFromId(userId), [userId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`presence:workspace:${workspaceId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    const sync = () => {
      const state = channel.presenceState<PresenceUser>();
      const users: PresenceUser[] = [];
      for (const key of Object.keys(state)) {
        const metas = state[key];
        const m = metas[metas.length - 1];
        if (m?.userId) users.push({ userId: m.userId, name: m.name, color: m.color, label: m.label });
      }
      setOnline(users);
    };

    channel.on("presence", { event: "sync" }, sync);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ userId, name: userName, color, label: labelForPath(pathname) });
        void heartbeat();
      }
    });

    const hb = setInterval(() => void heartbeat(), 45_000);
    return () => {
      clearInterval(hb);
      channel.unsubscribe();
      channelRef.current = null;
    };
    // pathname intentionally excluded — re-tracked in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, userId, userName, color]);

  // Update our "working on" label as we navigate.
  useEffect(() => {
    const ch = channelRef.current;
    if (ch) void ch.track({ userId, name: userName, color, label: labelForPath(pathname) });
  }, [pathname, userId, userName, color]);

  const value = useMemo<PresenceValue>(() => ({ online, selfId: userId }), [online, userId]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
