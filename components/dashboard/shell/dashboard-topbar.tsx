import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { FounderPresence } from "@/components/presence/founder-presence";
import { NotificationBell } from "@/components/town-hall/notification-bell";
import { MobileTownHallButton } from "@/components/town-hall/mobile-townhall-button";
import { CommandSearchButton } from "@/components/command/command-search-button";
import { ViewToggle } from "./view-toggle";
import type { ReactNode } from "react";

interface DashboardTopbarProps {
  email: string;
  displayName: string;
  header?: ReactNode;
}

export function DashboardTopbar({ email, displayName, header }: DashboardTopbarProps) {
  return (
    <header
      className="sticky top-0 z-30 flex min-h-14 items-start justify-between gap-3 border-b px-4 py-2 sm:px-6"
      style={{
        borderColor: "var(--border-default)",
        background: "color-mix(in oklab, var(--bg-page) 92%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <MobileNav />
        <FounderPresence />
        {header}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden md:block">
          <ViewToggle />
        </div>
        <CommandSearchButton />
        <MobileTownHallButton />
        <NotificationBell />
        <UserMenu email={email} displayName={displayName} />
      </div>
    </header>
  );
}
