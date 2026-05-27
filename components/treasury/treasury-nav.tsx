"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/treasury", label: "Overview" },
  { href: "/treasury/accounts", label: "Accounts" },
  { href: "/treasury/transactions", label: "Transactions" },
  { href: "/treasury/subscriptions", label: "Subscriptions" },
  { href: "/treasury/vendors", label: "Vendors" },
];

export function TreasuryNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Treasury"
      className="flex items-center gap-1 border-b"
      style={{ borderColor: "var(--border-default)" }}
    >
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "px-3 py-2 text-[13px] transition-colors border-b-2 -mb-px",
              active
                ? "border-text-primary text-text-primary font-medium"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
            style={
              active
                ? { borderBottomColor: "var(--text-primary)" }
                : { borderBottomColor: "transparent" }
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
