import { Search } from "lucide-react";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationBell } from "@/components/town-hall/notification-bell";
import { ViewToggle } from "./view-toggle";

interface DashboardTopbarProps {
  email: string;
  displayName: string;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function DashboardTopbar({ email, displayName }: DashboardTopbarProps) {
  const firstName = displayName.split(/\s+/)[0] || displayName;

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4 sm:px-6"
      style={{
        borderColor: "var(--border-default)",
        background: "color-mix(in oklab, var(--bg-page) 92%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <MobileNav />
        <div className="hidden min-w-0 sm:block">
          <h2 className="truncate text-[14px] font-medium tracking-tight text-text-primary">
            {greeting()}, {firstName}
          </h2>
          <p className="text-tiny text-text-tertiary leading-tight">
            {todayLabel()}
          </p>
        </div>
      </div>

      <div className="hidden md:block">
        <ViewToggle />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="hidden sm:grid h-8 w-8 place-items-center rounded-md text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
          aria-label="Search"
        >
          <Search size={16} />
        </button>
        <NotificationBell />
        <UserMenu email={email} displayName={displayName} />
      </div>
    </header>
  );
}
