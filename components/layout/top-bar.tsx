import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "@/components/town-hall/notification-bell";

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
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        {title ? (
          <h2 className="truncate text-sm font-medium tracking-tight">
            {title}
          </h2>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {action}
        <NotificationBell />
        <UserMenu email={email} displayName={displayName} />
      </div>
    </header>
  );
}
