import Link from "next/link";
import { Mail } from "lucide-react";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { FounderPresence } from "@/components/presence/founder-presence";
import { NotificationBell } from "@/components/town-hall/notification-bell";
import { MobileTownHallButton } from "@/components/town-hall/mobile-townhall-button";

export function TopBar({
  email,
  displayName,
  title,
  action,
}: {
  email: string;
  displayName: string;
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)]/80 px-3 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <MobileNav />
        <FounderPresence />
        {title ? (
          <h2 className="truncate text-sm font-medium tracking-tight">
            {title}
          </h2>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {action}
        <MobileTownHallButton />
        <Link
          href="/email"
          aria-label="Open email"
          title="Open email"
          className="inline-grid h-10 w-10 place-items-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Mail className="h-4 w-4" />
        </Link>
        <NotificationBell />
        <UserMenu email={email} displayName={displayName} />
      </div>
    </header>
  );
}
