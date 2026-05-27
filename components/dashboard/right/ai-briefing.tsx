import { Sparkles } from "lucide-react";
import { SectionLabel } from "../shared/section-label";

interface AIBriefingProps {
  bullets: string[];
}

export function AIBriefing({ bullets }: AIBriefingProps) {
  return (
    <div
      className="rounded-lg border-l-[3px] border-y border-r p-3"
      style={{
        background: "var(--ai-bg)",
        borderLeftColor: "var(--purple-mid)",
        borderTopColor: "var(--ai-border)",
        borderRightColor: "var(--ai-border)",
        borderBottomColor: "var(--ai-border)",
      }}
    >
      <SectionLabel icon={Sparkles}>
        <span style={{ color: "var(--ai-text)" }}>Briefing</span>
      </SectionLabel>
      {bullets.length === 0 ? (
        <p className="text-[12px] text-text-secondary">
          Nothing pressing — clear runway.
        </p>
      ) : (
        <ul className="space-y-1 text-[12px]" style={{ color: "var(--ai-subtext)" }}>
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="shrink-0">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
