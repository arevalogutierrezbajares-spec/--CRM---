import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";

type Touch = {
  id: string;
  channel: string;
  body: string;
  createdAt: Date | string;
};

const LOW_CONF_RE = /^\[LOW-CONFIDENCE • ([\d.]+)\]\s*/;

export function TouchList({ touches }: { touches: Touch[] }) {
  if (touches.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No touches yet. Log one to start the timeline.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {touches.map((t) => {
        const lowConfMatch = t.body.match(LOW_CONF_RE);
        const displayBody = lowConfMatch ? t.body.replace(LOW_CONF_RE, "") : t.body;
        const confidence = lowConfMatch ? lowConfMatch[1] : null;
        return (
          <li
            key={t.id}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wide">{t.channel}</span>
                {confidence && (
                  <Badge variant="warning" className="gap-1 text-[10px]">
                    <AlertTriangle className="h-3 w-3" /> low conf {confidence}
                  </Badge>
                )}
              </div>
              <span>{formatRelative(t.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
              {displayBody}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
