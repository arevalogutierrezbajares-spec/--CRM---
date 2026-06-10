import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platformUrl, type Platform } from "@/lib/platforms/config";
import type { CheckStatus, PlatformCheck } from "@/lib/platforms/status.server";

const badgeVariant: Record<CheckStatus, "success" | "warning" | "danger" | "outline"> = {
  ok: "success",
  warn: "warning",
  down: "danger",
  off: "outline",
};

/** One venture: status row, primary open button, quick-link grid.
 *  Every link opens the external admin in a new tab — sessions live in
 *  each app, this card is just the launchpad. */
export function PlatformCard({
  platform,
  checks,
}: {
  platform: Platform;
  checks: PlatformCheck[];
}) {
  return (
    <section
      className="rounded-lg border bg-card p-4 space-y-4"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium text-text-primary">
            {platform.name}
          </h2>
          <p className="text-[12px] text-text-secondary">{platform.description}</p>
        </div>
        <Button asChild size="sm">
          <a
            href={platformUrl(platform, platform.adminPath)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open admin <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {checks.map((check) => {
          const badge = (
            <Badge key={check.label} variant={badgeVariant[check.status]} className="gap-1">
              <span className="font-medium">{check.label}</span>
              <span className="opacity-75">{check.detail}</span>
            </Badge>
          );
          return check.path ? (
            <a
              key={check.label}
              href={platformUrl(platform, check.path)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {badge}
            </a>
          ) : (
            badge
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {platform.quickLinks.map((link) => (
          <a
            key={link.path}
            href={platformUrl(platform, link.path)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-md border px-2.5 py-2 text-[12px] text-text-secondary transition-colors hover:text-text-primary hover:bg-[var(--secondary)]"
            style={{ borderColor: "var(--border-default)" }}
          >
            {link.label}
            <ExternalLink className="h-3 w-3 opacity-50" />
          </a>
        ))}
      </div>
    </section>
  );
}
