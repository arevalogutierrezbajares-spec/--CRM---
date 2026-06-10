import type { CSSProperties } from "react";
import type { Slide, SlideTheme } from "@/lib/presentations/types";

const THEMES: Record<SlideTheme, { bg: string; fg: string; eyebrow: string; muted: string; card: string }> = {
  brand: {
    bg: "linear-gradient(135deg, #ea580c 0%, #b91c1c 100%)",
    fg: "#ffffff",
    eyebrow: "rgba(255,255,255,0.75)",
    muted: "rgba(255,255,255,0.85)",
    card: "rgba(255,255,255,0.12)",
  },
  dark: {
    bg: "#0b0f17",
    fg: "#f4f4f5",
    eyebrow: "#fbbf24",
    muted: "rgba(244,244,245,0.7)",
    card: "rgba(255,255,255,0.05)",
  },
  light: {
    bg: "#faf7f2",
    fg: "#1a1614",
    eyebrow: "#c2410c",
    muted: "rgba(26,22,20,0.65)",
    card: "rgba(0,0,0,0.04)",
  },
};

/** One slide rendered natively, sized in container-query units so it scales
 *  crisply at any stage size (laptop or phone) without an iframe. */
export function SlideView({ slide }: { slide: Slide }) {
  const t = THEMES[slide.theme ?? "dark"];
  const root: CSSProperties = {
    background: t.bg,
    color: t.fg,
    containerType: "size",
  };
  const eyebrow = slide.eyebrow ? (
    <div
      style={{ color: t.eyebrow }}
      className="font-mono text-[1.5cqw] font-medium uppercase tracking-[0.2em]"
    >
      {slide.eyebrow}
    </div>
  ) : null;

  return (
    <div style={root} className="flex h-full w-full flex-col justify-center p-[6cqw]">
      {slide.layout === "metrics" ? (
        <>
          {eyebrow}
          {slide.title && (
            <h2 className="mt-[2cqh] max-w-[80%] text-[4.2cqw] font-semibold leading-[1.1]">
              {slide.title}
            </h2>
          )}
          <div className="mt-[4cqh] grid grid-cols-3 gap-[2cqw]">
            {(slide.metrics ?? []).map((m, i) => (
              <div
                key={i}
                style={{ background: t.card }}
                className="rounded-[1.2cqw] p-[2.4cqw]"
              >
                <div className="text-[6cqw] font-bold leading-none tabular-nums">
                  {m.value}
                </div>
                <div className="mt-[1.4cqh] text-[1.8cqw] font-medium">
                  {m.label}
                </div>
                {m.sub && (
                  <div
                    style={{ color: t.muted }}
                    className="mt-[0.6cqh] text-[1.4cqw]"
                  >
                    {m.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : slide.layout === "bullets" ? (
        <>
          {eyebrow}
          {slide.title && (
            <h2 className="mt-[2cqh] text-[4.2cqw] font-semibold leading-[1.1]">
              {slide.title}
            </h2>
          )}
          <ul className="mt-[3cqh] space-y-[1.8cqh]">
            {(slide.bullets ?? []).map((b, i) => (
              <li key={i} className="flex items-start gap-[1.6cqw] text-[2.4cqw] leading-snug">
                <span
                  style={{ background: t.eyebrow }}
                  className="mt-[1.1cqh] h-[1cqw] w-[1cqw] flex-none rounded-full"
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </>
      ) : slide.layout === "split" ? (
        <div className="grid h-full grid-cols-2 items-center gap-[4cqw]">
          <div>
            {eyebrow}
            {slide.title && (
              <h2 className="mt-[2cqh] text-[3.8cqw] font-semibold leading-[1.1]">
                {slide.title}
              </h2>
            )}
            {slide.body && (
              <p style={{ color: t.muted }} className="mt-[2.4cqh] text-[2.2cqw] leading-relaxed">
                {slide.body}
              </p>
            )}
          </div>
          <div
            style={{ background: t.card }}
            className="flex h-[70cqh] items-center justify-center overflow-hidden rounded-[1.6cqw]"
          >
            {slide.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.image}
                alt={slide.imageAlt ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <span style={{ color: t.muted }} className="text-[1.6cqw]">
                Visual
              </span>
            )}
          </div>
        </div>
      ) : slide.layout === "quote" ? (
        <div className="flex h-full flex-col justify-center">
          <blockquote className="text-[4cqw] font-medium leading-[1.25]">
            “{slide.body}”
          </blockquote>
          {slide.quoteAuthor && (
            <div
              style={{ color: t.eyebrow }}
              className="mt-[3cqh] font-mono text-[1.6cqw] uppercase tracking-[0.15em]"
            >
              — {slide.quoteAuthor}
            </div>
          )}
        </div>
      ) : (
        // cover / statement
        <div className={slide.layout === "cover" ? "flex h-full flex-col justify-center" : ""}>
          {eyebrow}
          {slide.title && (
            <h1 className="mt-[2cqh] max-w-[88%] text-[6cqw] font-bold leading-[1.05] tracking-tight">
              {slide.title}
            </h1>
          )}
          {slide.body && (
            <p
              style={{ color: t.muted }}
              className="mt-[3cqh] max-w-[70%] text-[2.4cqw] leading-relaxed"
            >
              {slide.body}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
