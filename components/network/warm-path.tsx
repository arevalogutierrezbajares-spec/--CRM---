import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Node = {
  id: string;
  name: string;
  relationshipType: "friend" | "lead" | "partner" | "prospect";
  organization: string | null;
};

/**
 * Renders a warm path as: you → friend → … → target.
 * The path is given closest-to-target first; we reverse for display.
 */
export function WarmPath({ path }: { path: Node[] | null }) {
  if (!path || path.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Compass className="h-4 w-4" /> Warm path
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[var(--muted-foreground)]">
          No intro chain leads back to a friend. Cold outreach territory.
        </CardContent>
      </Card>
    );
  }
  const reversed = [...path].reverse(); // root → target

  const rootIsFriend = reversed[0].relationshipType === "friend";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Compass className="h-4 w-4" /> Warm path
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!rootIsFriend && (
          <p className="mb-3 text-xs text-[var(--health-amber)]">
            Chain doesn&apos;t terminate at a friend — closest known link below.
          </p>
        )}
        <ol className="flex flex-wrap items-center gap-1.5 text-sm">
          <li className="text-[var(--muted-foreground)]">You</li>
          {reversed.map((n, i) => (
            <li key={n.id} className="flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
              <Link
                href={`/contacts/${n.id}`}
                className="font-medium hover:underline"
              >
                {n.name}
              </Link>
              <Badge variant="outline" className="text-[10px]">
                {n.relationshipType}
              </Badge>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
