"use client";

import { useEffect, useRef, useState } from "react";

// Minimal pdf.js surface (mirrors sign-document-modal — keep in sync).
type PdfViewport = { width: number; height: number };
type PdfPageProxy = {
  getViewport(opts: { scale: number }): PdfViewport;
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): { promise: Promise<void> };
};
type PdfDocProxy = { getPage(n: number): Promise<PdfPageProxy> };
type PdfLoadingTask = { promise: Promise<PdfDocProxy>; destroy(): Promise<void> };
type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): PdfLoadingTask;
};

const THUMB_WIDTH = 360;

/**
 * First-page preview for a shared PDF, so the repository reads like a data
 * room instead of a file list. Lazy: nothing is fetched until the row scrolls
 * near the viewport. Any failure renders nothing — the row's normal actions
 * are untouched.
 */
export function PdfThumb({ src, title }: { src: string; title: string }) {
  const holderRef = useRef<HTMLAnchorElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">(
    "idle",
  );

  // Arm on scroll-into-view.
  useEffect(() => {
    const el = holderRef.current;
    if (!el || state !== "idle") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("loading");
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [state]);

  useEffect(() => {
    if (state !== "loading") return;
    let cancelled = false;
    let task: PdfLoadingTask | null = null;
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("unavailable");
        const buf = await res.arrayBuffer();
        const pdfjs = (await import(
          "pdfjs-dist/legacy/build/pdf.mjs"
        )) as unknown as PdfJsModule;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        task = pdfjs.getDocument({ data: buf });
        const doc = await task.promise;
        const page = await doc.getPage(1);
        if (cancelled) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) throw new Error("no-canvas");
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (THUMB_WIDTH / base.width) * dpr;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      // Teardown lives on the loading task, not the document proxy.
      task?.destroy().catch(() => {});
    };
  }, [state, src]);

  if (state === "failed") return null;

  return (
    <a
      ref={holderRef}
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir ${title}`}
      className="group mt-2 block w-fit max-w-full"
    >
      {state !== "ready" && (
        <div className="h-40 w-72 max-w-full animate-pulse rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60" />
      )}
      <canvas
        ref={canvasRef}
        className={`max-w-full rounded-lg border border-[var(--border)] shadow-sm transition group-hover:shadow-md ${
          state === "ready" ? "" : "hidden"
        }`}
      />
    </a>
  );
}
