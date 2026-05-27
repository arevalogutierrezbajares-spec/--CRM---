import {
  Building2,
  Contact2,
  Home,
  KanbanSquare,
  LayoutGrid,
  Network,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/contacts", label: "Contacts", icon: Contact2 },
  { href: "/projects", label: "Projects", icon: LayoutGrid },
  { href: "/meetings", label: "Meetings", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/network", label: "Network", icon: Network },
  { href: "/workspace", label: "Workspace", icon: Building2 },
  { href: "/profile", label: "Profile", icon: User },
];
