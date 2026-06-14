import {
  Home,
  Inbox,
  Mail,
  BellRing,
  ListTodo,
  CalendarDays,
  Megaphone,
  Bot,
  Mic,
  Headphones,
  Presentation,
  Map,
  Flag,
  Target,
  CalendarCheck,
  KanbanSquare,
  Contact2,
  MessageSquareText,
  Network,
  HeartHandshake,
  UsersRound,
  Wallet,
  Scale,
  Brain,
  PanelsTopLeft,
  Building2,
  User,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavLeaf = { href: string; label: string; icon: LucideIcon };

export type NavGroup = {
  id: string;
  label: string;
  /** Static links under the group. */
  items: NavLeaf[];
  /** When true, this group also renders the Projects→docs Explorer tree. */
  tree?: boolean;
};

/**
 * Grouped primary navigation — the 3-5 category spine (Now · Plan · Explorer)
 * plus a pinned Favorites section (driven by pinned projects) and a footer.
 * Replaces the old flat 15-link list; the flat NAV_ITEMS (for ⌘K) is derived
 * from this so the two never drift.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "now",
    label: "Now",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/email", label: "Email", icon: Mail },
      { href: "/work", label: "My Work", icon: ListTodo },
      { href: "/reminders", label: "Reminders", icon: BellRing },
      { href: "/meetings", label: "Meetings", icon: CalendarDays },
      { href: "/presentations", label: "Presentations", icon: Presentation },
      { href: "/town-hall", label: "Town Hall", icon: Megaphone },
      { href: "/agent", label: "Agent", icon: Bot },
      { href: "/meetings/record", label: "Record Call", icon: Mic },
      { href: "/capture", label: "Call Capture", icon: Headphones },
    ],
  },
  {
    id: "plan",
    label: "Plan",
    items: [
      { href: "/priorities", label: "Priorities", icon: Target },
      { href: "/review", label: "Weekly Review", icon: CalendarCheck },
      { href: "/roadmap", label: "Roadmap", icon: Map },
      { href: "/sprint", label: "Sprint", icon: Flag },
      // /initiatives dropped — it renders the same Work module and is reachable
      // via the Work tab strip; keeping it here duplicated the nav.
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
    ],
  },
  {
    id: "explorer",
    label: "Explorer",
    tree: true,
    items: [
      { href: "/contacts", label: "Contacts", icon: Contact2 },
      { href: "/reconnect", label: "Reconnect", icon: HeartHandshake },
      { href: "/pitch-feedback", label: "Pitch Feedback", icon: MessageSquareText },
      { href: "/network", label: "Network", icon: Network },
      { href: "/team", label: "Team", icon: UsersRound },
      { href: "/treasury", label: "Treasury", icon: Wallet },
      { href: "/equity", label: "Equity OS", icon: Scale },
      { href: "/platforms", label: "Platform Management", icon: PanelsTopLeft },
      { href: "/research", label: "Research", icon: Brain },
    ],
  },
];

/** Pinned to the bottom of the sidebar. */
export const NAV_FOOTER: NavLeaf[] = [
  { href: "/workspace", label: "Workspace", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: User },
];

/** Flat list for the ⌘K palette + anywhere that wants every destination. */
export const ALL_NAV_LEAVES: NavLeaf[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...NAV_FOOTER,
];
