import { Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Reciprocity } from "@/db/queries/reciprocity";

const labelByBalance: Record<Reciprocity["balance"], string> = {
  "you-owe": "You owe them",
  "they-owe": "They owe you",
  balanced: "Balanced",
  "no-data": "No touches yet",
};

const variantByBalance: Record<
  Reciprocity["balance"],
  "warning" | "success" | "secondary" | "outline"
> = {
  "you-owe": "warning",
  "they-owe": "success",
  balanced: "secondary",
  "no-data": "outline",
};

export function ReciprocityCard({ data }: { data: Reciprocity }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4" /> Reciprocity
          </span>
          <Badge variant={variantByBalance[data.balance]}>
            {labelByBalance[data.balance]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {data.total === 0 ? (
          <p className="text-[var(--muted-foreground)]">No touches logged yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="You" value={data.initiatedByMe} />
              <Stat label="Them" value={data.initiatedByThem} />
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="absolute inset-y-0 left-0 bg-[var(--health-green)]/70"
                style={{ width: `${(1 - data.ratio) * 100}%` }}
              />
              <div
                className="absolute inset-y-0 right-0 bg-[var(--health-amber)]/70"
                style={{ width: `${data.ratio * 100}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Heuristic: inbound emails + WA messages count as &ldquo;them&rdquo;;
              everything else as &ldquo;you.&rdquo;
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-2">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
    </div>
  );
}
