import { ReactNode } from "react";
import { DashboardTopbar } from "./dashboard-topbar";

interface DashboardShellProps {
  email: string;
  displayName: string;
  rightColumn?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  email,
  displayName,
  rightColumn,
  children,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-page">
      <DashboardTopbar email={email} displayName={displayName} />
      <div className="flex flex-1 gap-2.5 p-3">
        <main className="min-w-0 flex-1 flex flex-col gap-2.5">{children}</main>
        {rightColumn}
      </div>
    </div>
  );
}
