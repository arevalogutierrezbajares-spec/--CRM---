import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { WorkNav } from "@/components/work/work-nav";
import { safeRead } from "@/lib/db-status";
import { PRODUCTS, isProductId, type ProductId } from "@/lib/products";
import {
  listEnhancements,
  listProductRoadmapItems,
  type EnhancementRow,
  type ProductRoadmapItem,
} from "@/db/queries/enhancements";
import { listInitiatives, type InitiativeListItem } from "@/db/queries/work";
import { TechBoard, type EnhancementDTO } from "@/components/tech/tech-board";

export default async function TechPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const product: ProductId = isProductId(sp.p) ? sp.p : "caney";

  const [enhRes, roadmapRes, initsRes] = await Promise.all([
    safeRead<EnhancementRow[]>(() => listEnhancements(user.workspaceId, product), []),
    safeRead<ProductRoadmapItem[]>(() => listProductRoadmapItems(user.workspaceId, product), []),
    safeRead<InitiativeListItem[]>(() => listInitiatives({ workspaceId: user.workspaceId }), []),
  ]);

  const enhancements: EnhancementDTO[] = enhRes.data.map((e) => ({
    id: e.id,
    title: e.title,
    detail: e.detail,
    status: e.status,
    priority: e.priority,
    source: e.source,
    sourceLabel: e.sourceLabel,
    sourceUrl: e.sourceUrl,
    linkedInitiativeId: e.linkedInitiativeId,
    linkedInitiativeTitle: e.linkedInitiativeTitle,
    linkedMilestoneTitle: e.linkedMilestoneTitle,
  }));

  const initiatives = initsRes.data.map((i) => ({ id: i.id, title: i.title }));

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Tech Board</h1>
          <p className="text-[13px] text-text-secondary">
            Enhancements per product, linked to the roadmap. Capture from anywhere with{" "}
            <code className="text-[12px]">#CCfunc</code> · <code className="text-[12px]">#VAVfunc</code> ·{" "}
            <code className="text-[12px]">#CCAfunc</code> · <code className="text-[12px]">#CRMfunc</code>.
          </p>
        </header>

        <WorkNav />

        {/* Product tabs */}
        <div className="flex items-center gap-1.5 border-b" style={{ borderColor: "var(--border-default)" }}>
          {PRODUCTS.map((p) => {
            const active = p.id === product;
            return (
              <Link
                key={p.id}
                href={`/tech?p=${p.id}`}
                className="-mb-px border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  borderColor: active ? p.color : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                <span className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle" style={{ background: p.color }} />
                {p.label}
              </Link>
            );
          })}
        </div>

        {!enhRes.ok && <DbBanner error={(enhRes as { error?: string }).error ?? ""} />}

        <TechBoard
          product={product}
          enhancements={enhancements}
          roadmapItems={roadmapRes.data}
          initiatives={initiatives}
        />
      </main>
    </>
  );
}
