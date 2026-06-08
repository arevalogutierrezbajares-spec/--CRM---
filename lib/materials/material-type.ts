// Shared, pure (client+server safe) classifier that turns a project_link's
// kind + mime + filename into a friendly material TYPE. Used for filtering in
// the attach picker, type badges in the list, and renderer routing in present
// mode. HTML decks are first-class (the preferred format); PowerPoint is a
// distinct legacy type so it can be filtered and handled specially.

export type MaterialTypeKey =
  | "html"
  | "pdf"
  | "pptx"
  | "image"
  | "link"
  | "doc"
  | "file";

export type MaterialKindLike = "note" | "link" | "file" | "doc";

export type MaterialTypeInfo = { key: MaterialTypeKey; label: string };

const TYPE_LABELS: Record<MaterialTypeKey, string> = {
  html: "HTML deck",
  pdf: "PDF",
  pptx: "PowerPoint",
  image: "Image",
  link: "Link",
  doc: "Doc",
  file: "File",
};

export function materialTypeLabel(key: MaterialTypeKey): string {
  return TYPE_LABELS[key];
}

export function materialType(
  kind: MaterialKindLike | string,
  mime: string | null | undefined,
  name: string | null | undefined,
): MaterialTypeInfo {
  if (kind === "link") return { key: "link", label: TYPE_LABELS.link };
  if (kind === "doc" || kind === "note")
    return { key: "doc", label: TYPE_LABELS.doc };

  const m = (mime ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();

  if (m === "text/html" || /\.html?($|\?)/.test(n))
    return { key: "html", label: TYPE_LABELS.html };
  if (m === "application/pdf" || /\.pdf($|\?)/.test(n))
    return { key: "pdf", label: TYPE_LABELS.pdf };
  if (
    m.includes("presentationml") ||
    m.includes("ms-powerpoint") ||
    m.includes("powerpoint") ||
    /\.pptx?($|\?)/.test(n)
  )
    return { key: "pptx", label: TYPE_LABELS.pptx };
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)($|\?)/.test(n))
    return { key: "image", label: TYPE_LABELS.image };

  return { key: "file", label: TYPE_LABELS.file };
}

/** Order types appear in the filter bar. */
export const MATERIAL_TYPE_ORDER: MaterialTypeKey[] = [
  "html",
  "pdf",
  "pptx",
  "image",
  "link",
  "doc",
  "file",
];
