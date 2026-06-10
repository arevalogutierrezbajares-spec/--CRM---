/** Shape of a single slide in a story presentation (stored as JSONB). */
export type SlideLayout =
  | "cover"
  | "statement"
  | "metrics"
  | "bullets"
  | "split"
  | "quote";

export type SlideTheme = "dark" | "brand" | "light";

export type Metric = { value: string; label: string; sub?: string };

export type Slide = {
  id: string;
  layout: SlideLayout;
  theme?: SlideTheme;
  eyebrow?: string;
  title?: string;
  body?: string;
  image?: string; // optional image URL (split / cover)
  imageAlt?: string;
  metrics?: Metric[];
  bullets?: string[];
  quoteAuthor?: string;
};

/** A short, stable id generator for slides (client + server safe). */
export function slideId(index: number): string {
  return `s${index + 1}`;
}

export function isSlideArray(v: unknown): v is Slide[] {
  return (
    Array.isArray(v) &&
    v.every(
      (s) =>
        s != null &&
        typeof s === "object" &&
        typeof (s as Slide).id === "string" &&
        typeof (s as Slide).layout === "string",
    )
  );
}
