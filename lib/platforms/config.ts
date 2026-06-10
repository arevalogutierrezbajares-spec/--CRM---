export type QuickLink = { label: string; path: string };

export type Platform = {
  id: "vav" | "caneycloud";
  name: string;
  description: string;
  /** Admin/operator base URL — env-overridable so previews/staging can point elsewhere. */
  baseUrl: string;
  /** Path (relative to baseUrl) the primary "Open admin" button lands on. */
  adminPath: string;
  quickLinks: QuickLink[];
};

const VAV_URL = process.env.PLATFORM_VAV_URL ?? "https://vamosavenezuela.com";
const CANEY_URL = process.env.PLATFORM_CANEY_URL ?? "https://caneycloud.com";

export const PLATFORMS: Platform[] = [
  {
    id: "vav",
    name: "Vamos A Venezuela",
    description: "Tourism marketplace — providers, creators, bookings, content.",
    baseUrl: VAV_URL,
    adminPath: "/admin",
    quickLinks: [
      { label: "Bookings", path: "/admin/bookings" },
      { label: "Providers", path: "/admin/providers" },
      { label: "Listings", path: "/admin/listings" },
      { label: "Provider invites", path: "/admin/provider-invites" },
      { label: "Creators", path: "/admin/creators" },
      { label: "Outreach", path: "/admin/outreach" },
      { label: "Analytics", path: "/admin/analytics" },
      { label: "Finance", path: "/admin/finance" },
    ],
  },
  {
    id: "caneycloud",
    name: "CaneyCloud PMS",
    description: "Posada operations — bookings, calendar, channels, agents.",
    baseUrl: CANEY_URL,
    adminPath: "/today",
    quickLinks: [
      { label: "Bookings", path: "/bookings" },
      { label: "Calendar", path: "/calendar" },
      { label: "Inbox", path: "/inbox" },
      { label: "Properties", path: "/properties" },
      { label: "Channels", path: "/channels" },
      { label: "Agents", path: "/agents" },
      { label: "Reports", path: "/reports" },
      { label: "Settings", path: "/settings" },
    ],
  },
];

export function platformUrl(platform: Platform, path: string) {
  return `${platform.baseUrl}${path}`;
}
