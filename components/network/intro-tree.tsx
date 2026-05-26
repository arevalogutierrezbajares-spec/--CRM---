import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Node = {
  id: string;
  name: string;
  relationshipType: "friend" | "lead" | "partner" | "prospect";
  organization: string | null;
  introducerText: string | null;
  children: Node[];
};

const relColor: Record<Node["relationshipType"], string> = {
  friend: "bg-[var(--health-green)]/15 border-[var(--health-green)]/40 text-[var(--health-green)]",
  partner:
    "bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)]",
  lead: "bg-[var(--health-amber)]/15 border-[var(--health-amber)]/40 text-[var(--health-amber)]",
  prospect:
    "border-[var(--border)] text-[var(--muted-foreground)]",
};

export function IntroTree({ nodes }: { nodes: Node[] }) {
  if (nodes.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No contacts to show under this lens.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {nodes.map((n) => (
        <TreeNode key={n.id} node={n} depth={0} />
      ))}
    </ul>
  );
}

function TreeNode({ node, depth }: { node: Node; depth: number }) {
  return (
    <li className="relative">
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
          relColor[node.relationshipType],
        )}
      >
        <div className="min-w-0 flex-1">
          <Link
            href={`/contacts/${node.id}`}
            className="font-medium hover:underline"
          >
            {node.name}
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs opacity-80">
            {node.organization && <span>{node.organization}</span>}
            {node.introducerText && (
              <span className="text-[var(--muted-foreground)]">
                via &ldquo;{node.introducerText}&rdquo;
              </span>
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {node.relationshipType}
        </Badge>
      </div>
      {node.children.length > 0 && (
        <ul
          className="mt-2 space-y-2 border-l border-dashed border-[var(--border)] pl-4"
          style={{ marginLeft: depth * 4 }}
        >
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
