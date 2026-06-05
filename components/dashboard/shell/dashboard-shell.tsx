import { ReactNode } from "react";
import { DashboardTopbar } from "./dashboard-topbar";

interface DashboardShellProps {
  email: string;
  displayName: string;
  header?: ReactNode;
  rightColumn?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  email,
  displayName,
  header,
  rightColumn,
  children,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-page">
      <DashboardTopbar email={email} displayName={displayName} header={header} />
      <div className="grid min-h-0 flex-1 gap-2.5 p-2.5 sm:p-3 md:p-4 lg:grid-cols-[minmax(0,1fr)_min(340px,34vw)]">
        <main className="min-w-0 flex flex-col gap-2.5">{children}</main>
        {rightColumn}
      </div>
    </div>
  );
}
