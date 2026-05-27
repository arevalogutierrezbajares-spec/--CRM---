"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      className="hidden w-[200px] shrink-0 border-r bg-card md:flex md:flex-col"
      style={{ borderColor: "var(--border-default)" }}
    >
      <Link
        href="/"
        className="flex h-14 items-center gap-2 border-b px-4 hover:bg-surface/40 transition-colors"
        style={{ borderColor: "var(--border-default)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/crm.svg"
          alt="AGB CRM"
          width={28}
          height={28}
          className="shrink-0 dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/crm-light.svg"
          alt=""
          aria-hidden
          width={28}
          height={28}
          className="shrink-0 hidden dark:block"
        />
        <span className="text-[13px] font-medium tracking-tight text-text-primary">
          AGB CRM
        </span>
      </Link>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                active
                  ? "bg-surface font-medium text-text-primary"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary",
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className="border-t px-4 py-2.5 text-tiny text-text-tertiary"
        style={{ borderColor: "var(--border-default)" }}
      >
        v0.2 · Home
      </div>
    </aside>
  );
}
