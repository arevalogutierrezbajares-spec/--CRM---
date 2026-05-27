import Link from "next/link";
import {
  Briefcase,
  Megaphone,
  Code,
  Wrench,
  Palette,
  DollarSign,
  Link as LinkIcon,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import type { ProjectLinkRow } from "@/db/queries/projects";

interface LinkSectionProps {
  category:
    | "business"
    | "marketing"
    | "tech"
    | "ops"
    | "design"
    | "finance"
    | "other";
  links: ProjectLinkRow[];
  emptyHint?: string;
}

const META: Record<
  LinkSectionProps["category"],
  { label: string; icon: LucideIcon; color: string }
> = {
  business: {
    label: "Business",
    icon: Briefcase,
    color: "var(--green-text)",
  },
  marketing: {
    label: "Marketing",
    icon: Megaphone,
    color: "var(--red-text)",
  },
  tech: { label: "Tech", icon: Code, color: "var(--blue-text)" },
  ops: { label: "Ops", icon: Wrench, color: "var(--amber-text)" },
  design: { label: "Design", icon: Palette, color: "var(--purple-text)" },
  finance: {
    label: "Finance",
    icon: DollarSign,
    color: "var(--teal-text)",
  },
  other: { label: "Other", icon: LinkIcon, color: "var(--text-secondary)" },
};

export function LinkSection({
  category,
  links,
  emptyHint,
}: LinkSectionProps) {
  const meta = META[category];
  const Icon = meta.icon;
  const filtered = links.filter((l) => l.category === category);

  return (
    <DashCard>
      <div className="flex items-center justify-between mb-2.5">
        <div
          className="flex items-center gap-1.5 text-label"
          style={{ color: meta.color }}
        >
          <Icon size={14} />
          <span>{meta.label}</span>
        </div>
        <span className="text-tiny text-text-tertiary tabular-nums">
          {filtered.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-tiny text-text-tertiary py-2">
          {emptyHint ?? "No items yet."}
        </p>
      ) : (
        <ul className="space-y-1">
          {filtered.map((l) => (
            <li key={l.id}>
              <LinkRow link={l} accent={meta.color} />
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

function LinkRow({ link: l, accent }: { link: ProjectLinkRow; accent: string }) {
  const content = (
    <div className="flex items-start gap-2 group rounded px-2 py-1.5 hover:bg-surface transition-colors">
      <div
        className="mt-1 h-1.5 w-1.5 rounded-full shrink-0"
        style={{ background: accent }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-text-primary truncate flex items-center gap-1">
          {l.label}
          {l.url && (
            <ExternalLink
              size={10}
              className="text-text-tertiary opacity-0 group-hover:opacity-100"
            />
          )}
        </div>
        {l.description && (
          <div className="text-tiny text-text-tertiary line-clamp-2">
            {l.description}
          </div>
        )}
      </div>
    </div>
  );

  if (l.url) {
    return (
      <a
        href={l.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {content}
      </a>
    );
  }
  return content;
}
