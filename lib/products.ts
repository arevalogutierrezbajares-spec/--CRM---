/**
 * Canonical product taxonomy for the Tech Board + the roadmap project tag.
 * One source of truth so the board, the roadmap chip, and the #func capture
 * engine can never drift.
 *
 *   caney → CaneyCloud   (#CCfunc)
 *   vav   → VAV          (#VAVfunc)
 *   cca   → CaneyAcademy (#CCAfunc)
 *   crm   → CRM          (#CRMfunc)
 *
 * The roadmap project tag also allows "all" (cross-product); that's a tag, not
 * a board — items tagged "all" surface on every product board.
 */

export type ProductId = "caney" | "vav" | "cca" | "crm";

export type ProductMeta = {
  id: ProductId;
  label: string;
  short: string;
  hashtag: string; // without the leading # (e.g. "CCfunc")
  color: string;
};

export const PRODUCTS: ProductMeta[] = [
  { id: "caney", label: "CaneyCloud", short: "CC", hashtag: "CCfunc", color: "var(--blue-mid)" },
  { id: "vav", label: "VAV", short: "VAV", hashtag: "VAVfunc", color: "var(--green-mid)" },
  { id: "cca", label: "CaneyAcademy", short: "CCA", hashtag: "CCAfunc", color: "var(--purple-mid, #7c3aed)" },
  { id: "crm", label: "CRM", short: "CRM", hashtag: "CRMfunc", color: "var(--amber-mid)" },
];

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));
export const productMeta = (id: string | null | undefined): ProductMeta | null =>
  id ? (BY_ID.get(id as ProductId) ?? null) : null;

export const isProductId = (v: string | null | undefined): v is ProductId =>
  !!v && BY_ID.has(v as ProductId);

/** Roadmap project-tag options (products + the cross-product "all"). */
export const PROJECT_TAG_OPTIONS: Array<{ id: string; label: string; short: string; color: string }> = [
  ...PRODUCTS.map((p) => ({ id: p.id, label: p.label, short: p.short, color: p.color })),
  { id: "all", label: "All (every product)", short: "ALL", color: "var(--amber-mid)" },
];

// CCA must precede CC so "#CCAfunc" doesn't match the "#CCfunc" prefix.
const HASHTAG_TO_PRODUCT: Record<string, ProductId> = {
  ccafunc: "cca",
  ccfunc: "caney",
  vavfunc: "vav",
  crmfunc: "crm",
};

/** Matches #CCfunc / #VAVfunc / #CCAfunc / #CRMfunc (case-insensitive). */
export const PRODUCT_TAG_RE = /#(CCA|CC|VAV|CRM)func\b/gi;

/** Distinct products referenced by #func tags in the text, in first-seen order. */
export function extractProductTags(text: string): ProductId[] {
  const out: ProductId[] = [];
  const seen = new Set<ProductId>();
  for (const m of text.matchAll(PRODUCT_TAG_RE)) {
    const p = HASHTAG_TO_PRODUCT[m[0].slice(1).toLowerCase()];
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/** Remove #func tags so the captured text reads as a clean enhancement title. */
export function stripProductTags(text: string): string {
  return text.replace(PRODUCT_TAG_RE, "").replace(/\s{2,}/g, " ").trim();
}
