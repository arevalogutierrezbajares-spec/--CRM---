import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DbBanner } from "@/components/db-banner";
import { IntroTree } from "@/components/network/intro-tree";
import { buildNetwork, type NetworkLens } from "@/db/queries/network";
import { safeRead } from "@/lib/db-status";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ lens?: string }>;

export default async function NetworkPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const lens: NetworkLens = sp.lens === "friend" ? "friend" : "all";

  const res = await safeRead(
    () => buildNetwork({ ownerId: user.id, lens }),
    [] as Awaited<ReturnType<typeof buildNetwork>>,
  );

  const totalNodes = countNodes(res.data);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Network</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Intro chain forest. Children point back at the contact that
            introduced you. Switch lens to see only friend subtrees.
          </p>
        </header>

        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2">
            <LensLink current={lens} value="all" label="All" />
            <LensLink current={lens} value="friend" label="Friends" />
          </div>
          <Badge variant="outline">{totalNodes} visible</Badge>
        </div>

        {!res.ok && <DbBanner error={res.error} />}

        <Card>
          <CardHeader>
            <CardTitle>Intro chain</CardTitle>
          </CardHeader>
          <CardContent>
            <IntroTree nodes={res.data} />
          </CardContent>
        </Card>

        <p className="mt-4 text-xs text-[var(--muted-foreground)]">
          Tip: the free-text &ldquo;Intro chain&rdquo; field on each contact
          shows up here as &ldquo;via …&rdquo;. Linking to a specific
          introducer is on the roadmap.
        </p>
      </main>
    </>
  );
}

function LensLink({
  current,
  value,
  label,
}: {
  current: NetworkLens;
  value: NetworkLens;
  label: string;
}) {
  const active = current === value;
  return (
    <Link
      href={`/network?lens=${value}`}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
      )}
    >
      {label}
    </Link>
  );
}

function countNodes(
  nodes: Awaited<ReturnType<typeof buildNetwork>>,
): number {
  let n = 0;
  function walk(arr: typeof nodes) {
    for (const node of arr) {
      n++;
      walk(node.children);
    }
  }
  walk(nodes);
  return n;
}
