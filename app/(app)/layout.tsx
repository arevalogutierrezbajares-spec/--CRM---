import { requireUser } from "@/lib/current-user";
import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/toaster";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-[var(--primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--primary-foreground)] focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>
      <Sidebar />
      <div id="main-content" className="flex min-w-0 flex-1 flex-col">
        {children}
      </div>
      <Toaster />
    </div>
  );
}
