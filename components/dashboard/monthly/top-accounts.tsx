import Link from "next/link";
import { Users } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { cn } from "@/lib/utils";

export interface TopAccountRow {
  contactId: string;
  name: string;
  organization: string | null;
  touchCount: number;
  band: "warm" | "neutral" | "cold";
}

interface TopAccountsProps {
  rows: TopAccountRow[];
}

const COLORS = [
  "bg-blue-bg text-blue-text",
  "bg-green-bg text-green-text",
  "bg-amber-bg text-amber-text",
  "bg-purple-bg text-purple-text",
  "bg-teal-bg text-teal-text",
  "bg-red-bg text-red-text",
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function hashIdx(name: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

const BAND_LABEL: Record<TopAccountRow["band"], string> = {
  warm: "warm",
  neutral: "neutral",
  cold: "cold",
};

const BAND_COLOR: Record<TopAccountRow["band"], string> = {
  warm: "text-green-text",
  neutral: "text-amber-text",
  cold: "text-red-text",
};

export function TopAccounts({ rows }: TopAccountsProps) {
  return (
    <DashCard>
      <SectionLabel icon={Users}>Top accounts</SectionLabel>
      {rows.length === 0 ? (
        <p className="py-3 text-[12px] text-text-secondary">No activity yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 6).map((r) => {
            const color = COLORS[hashIdx(r.name, COLORS.length)];
            return (
              <li key={r.contactId} className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-tiny font-medium",
                    color,
                  )}
                >
                  {initials(r.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/contacts/${r.contactId}`}
                    className="block text-[12px] text-text-primary truncate hover:underline"
                  >
                    {r.name}
                  </Link>
                  {r.organization && (
                    <div className="text-tiny text-text-tertiary truncate">
                      {r.organization}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12px] font-medium tabular-nums text-text-primary">
                    {r.touchCount}
                  </div>
                  <div className={cn("text-tiny", BAND_COLOR[r.band])}>
                    {BAND_LABEL[r.band]}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}
