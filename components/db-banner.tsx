import { AlertTriangle } from "lucide-react";

export function DbBanner({ error }: { error: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-md border border-[var(--health-amber)]/30 bg-[var(--health-amber)]/10 px-4 py-3 text-sm text-[var(--health-amber)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">Database not connected</div>
        <p className="mt-0.5 text-xs opacity-90">{error}</p>
      </div>
    </div>
  );
}
