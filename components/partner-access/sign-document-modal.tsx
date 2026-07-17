"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Loader2, PenLine, X } from "lucide-react";
import { useRoomDict } from "./room-i18n";

export type SignatureResult = {
  requestId: string;
  signerName: string;
  signedAt: string;
  hasSignedPdf: boolean;
};

type Placement = {
  pageIndex: number; // 0-based
  x: number; // top-left, fraction of page width
  y: number; // top-left, fraction of page height (from the top)
  width: number; // fraction of page width
};

/** Minimal structural view of the pdf.js objects we touch. */
type PdfViewport = { width: number; height: number };
type PdfPageProxy = {
  getViewport(opts: { scale: number }): PdfViewport;
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
    transform?: number[];
  }): { promise: Promise<void> };
};
type PdfDocProxy = {
  numPages: number;
  getPage(n: number): Promise<PdfPageProxy>;
};
type PdfLoadingTask = {
  promise: Promise<PdfDocProxy>;
  destroy(): Promise<void>;
};
type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): PdfLoadingTask;
};

const MAX_RENDERED_PAGES = 80;
const DEFAULT_SIG_WIDTH = 0.4; // fraction of page width
const MIN_SIG_WIDTH = 0.15;
const MAX_SIG_WIDTH = 0.7;

type Mode = "loading" | "doc" | "pad";
type DocStep = "read" | "draw" | "place" | "confirm";

/**
 * In-document signing: the contract renders inline, the partner draws their
 * signature, taps where it goes on the page, can drag/resize it, then
 * confirms name + consent. The placement travels to the server, which embeds
 * the signature into that exact spot in the PDF. Non-PDF targets (or a viewer
 * failure) fall back to the pad-only sheet so signing is never blocked.
 */
export function SignDocumentModal({
  token,
  requestId,
  documentTitle,
  message,
  defaultName,
  defaultEmail = "",
  onClose,
  onSigned,
}: {
  token: string;
  requestId: string;
  documentTitle: string;
  message: string | null;
  defaultName: string;
  defaultEmail?: string;
  onClose: () => void;
  onSigned: (result: SignatureResult) => void;
}) {
  const t = useRoomDict();
  const [mode, setMode] = useState<Mode>("loading");
  const [step, setStep] = useState<DocStep>("read");
  const [pdf, setPdf] = useState<PdfDocProxy | null>(null);
  const [pageWidth, setPageWidth] = useState(0);

  const [sig, setSig] = useState<{ dataUrl: string; aspect: number } | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ignore late submit responses after the guest dismisses the sheet.
  const closedRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  function handleClose() {
    closedRef.current = true;
    onClose();
  }

  // Lock body scroll while the full-screen flow is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape always dismisses (even while loading or submitting).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the document and boot pdf.js. Any failure (non-PDF target, old
  // device, network) drops to the pad-only sheet — signing must never block.
  useEffect(() => {
    let cancelled = false;
    let task: PdfLoadingTask | null = null;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/access/${token}/sign/${requestId}/doc`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("doc-unavailable");
        const buf = await res.arrayBuffer();
        if (cancelled || closedRef.current) return;
        const pdfjs = (await import(
          "pdfjs-dist/legacy/build/pdf.mjs"
        )) as unknown as PdfJsModule;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        task = pdfjs.getDocument({ data: buf });
        const doc = await task.promise;
        if (cancelled || closedRef.current) return;
        setPdf(doc);
        setMode("doc");
      } catch {
        if (!cancelled && !closedRef.current) setMode("pad");
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
      // Teardown lives on the loading task, not the document proxy.
      task?.destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, requestId]);

  // Pages render at the scroll container's width (minus padding).
  useEffect(() => {
    if (mode !== "doc") return;
    const el = scrollRef.current;
    if (!el) return;
    setPageWidth(Math.min(el.clientWidth - 24, 760));
  }, [mode]);

  async function submit(finalPlacement: Placement | null) {
    if (busy) return;
    setError(null);
    if (!sig) {
      setError(t.sign.drawFirst);
      return;
    }
    if (name.trim().length < 3) {
      setError(t.sign.nameRequired);
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError(t.sign.emailRequired);
      return;
    }
    if (!consent) {
      setError(t.sign.consentRequired);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/access/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          signerName: name.trim(),
          signerEmail: email.trim(),
          signatureDataUrl: sig.dataUrl,
          consent: true,
          consentTextKey: "sign.consentText",
          placement: finalPlacement,
        }),
      });
      if (closedRef.current) return;
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        signedAt?: string;
        signerName?: string;
        hasSignedPdf?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? t.sign.registerFailed);
        return;
      }
      onSigned({
        requestId,
        signerName: data.signerName ?? name.trim(),
        signedAt: data.signedAt ?? new Date().toISOString(),
        hasSignedPdf: Boolean(data.hasSignedPdf),
      });
    } catch {
      if (!closedRef.current) setError(t.sign.networkError);
    } finally {
      if (!closedRef.current) setBusy(false);
    }
  }

  const pageNumbers = pdf
    ? Array.from(
        { length: Math.min(pdf.numPages, MAX_RENDERED_PAGES) },
        (_, i) => i + 1,
      )
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.sign.dialogAria(documentTitle)}
      className="fixed inset-0 z-[100] flex flex-col bg-[var(--background)]"
    >
      <header className="relative z-[110] flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-2.5">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--primary)]">
            <PenLine className="h-3 w-3" />
            {t.sign.eyebrow}
          </p>
          <h2 className="truncate text-sm font-semibold leading-snug">
            {documentTitle}
          </h2>
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label={t.common.close}
          className="relative z-[120] grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] active:bg-[var(--secondary)]"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      {mode === "loading" && (
        <div className="grid flex-1 place-items-center">
          <div className="flex flex-col items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t.sign.loadingDoc}
          </div>
        </div>
      )}

      {mode === "doc" && pdf && (
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto overscroll-contain bg-neutral-200/70 px-3 py-4 dark:bg-neutral-900"
        >
          <div className="mx-auto flex w-fit flex-col gap-3 pb-40">
            {pageWidth > 0 &&
              pageNumbers.map((n) => (
                <PdfPageView
                  key={n}
                  pdf={pdf}
                  pageNumber={n}
                  width={pageWidth}
                  placing={step === "place"}
                  sig={sig}
                  placement={
                    placement && placement.pageIndex === n - 1 ? placement : null
                  }
                  onPlace={(p) => setPlacement(p)}
                />
              ))}
            {pdf.numPages > MAX_RENDERED_PAGES && (
              <p className="py-2 text-center text-xs text-[var(--muted-foreground)]">
                {t.sign.pageLimit(MAX_RENDERED_PAGES)}
              </p>
            )}
          </div>

          {step === "place" && !placement && (
            <div className="pointer-events-none sticky bottom-36 z-10 mx-auto w-fit rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-medium text-[var(--background)] shadow-lg">
              {t.sign.tapToPlace}
            </div>
          )}
        </div>
      )}

      {/* ——— Bottom bars / sheets per step (doc mode) ——— */}

      {mode === "doc" && step === "read" && (
        <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          {message && (
            <p className="mb-2 text-sm text-[var(--muted-foreground)]">{message}</p>
          )}
          <button
            type="button"
            onClick={() => setStep("draw")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
          >
            <PenLine className="h-4 w-4" />
            {t.sign.signThisDoc}
          </button>
        </div>
      )}

      {mode === "doc" && step === "draw" && (
        <SignaturePadSheet
          onCancel={() => setStep("read")}
          onDone={(drawn) => {
            setSig(drawn);
            setPlacement(null);
            setStep("place");
          }}
        />
      )}

      {mode === "doc" && step === "place" && (
        <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <label className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {t.sign.size}
            </span>
            <input
              type="range"
              min={MIN_SIG_WIDTH * 100}
              max={MAX_SIG_WIDTH * 100}
              value={(placement?.width ?? DEFAULT_SIG_WIDTH) * 100}
              disabled={!placement}
              onChange={(e) => {
                const width = Number(e.target.value) / 100;
                setPlacement((p) =>
                  p ? { ...p, width, x: Math.min(p.x, 1 - width) } : p,
                );
              }}
              className="flex-1 accent-[var(--primary)]"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setStep("draw")}
              className="inline-flex flex-1 items-center justify-center rounded-md border border-[var(--border)] px-4 py-3 text-sm hover:bg-[var(--secondary)]"
            >
              {t.sign.drawAgain}
            </button>
            <button
              type="button"
              disabled={!placement}
              onClick={() => setStep("confirm")}
              className="inline-flex flex-1 items-center justify-center rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
            >
              {t.sign.confirmPosition}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-[var(--muted-foreground)]">
            {t.sign.dragHint}
          </p>
        </div>
      )}

      {mode === "doc" && step === "confirm" && (
        <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <NameConsentFields
            name={name}
            onName={setName}
            email={email}
            onEmail={setEmail}
            consent={consent}
            onConsent={setConsent}
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep("place")}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-md border border-[var(--border)] px-4 py-3 text-sm hover:bg-[var(--secondary)] disabled:opacity-50"
            >
              {t.common.back}
            </button>
            <button
              type="button"
              onClick={() => submit(placement)}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t.sign.registering : t.sign.signDoc}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-[var(--muted-foreground)]">
            {t.sign.serverTimestamp}
          </p>
        </div>
      )}

      {/* ——— Pad-only fallback (non-PDF target or viewer failure) ——— */}

      {mode === "pad" && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-lg">
            {message && (
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">{message}</p>
            )}
            <PadCanvas
              onChange={(drawn) => setSig(drawn)}
              heightClass="h-40"
            />
            <div className="mt-4">
              <NameConsentFields
                name={name}
                onName={setName}
                email={email}
                onEmail={setEmail}
                consent={consent}
                onConsent={setConsent}
              />
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => submit(null)}
              disabled={busy}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t.sign.registering : t.sign.signDoc}
            </button>
            <p className="mt-2 text-center text-[11px] text-[var(--muted-foreground)]">
              {t.sign.serverTimestamp}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** One rendered PDF page; hosts the tap-to-place target and the draggable signature overlay. */
function PdfPageView({
  pdf,
  pageNumber,
  width,
  placing,
  sig,
  placement,
  onPlace,
}: {
  pdf: PdfDocProxy;
  pageNumber: number;
  width: number;
  placing: boolean;
  sig: { dataUrl: string; aspect: number } | null;
  placement: Placement | null;
  onPlace: (p: Placement) => void;
}) {
  const t = useRoomDict();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      await page
        .render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        })
        .promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, width]);

  function placeAt(e: React.PointerEvent<HTMLDivElement>) {
    if (!placing || !sig) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = placement?.width ?? DEFAULT_SIG_WIDTH;
    const hFrac = (w * rect.width * sig.aspect) / rect.height;
    const x = Math.min(
      Math.max((e.clientX - rect.left) / rect.width - w / 2, 0),
      1 - w,
    );
    const y = Math.min(
      Math.max((e.clientY - rect.top) / rect.height - hFrac / 2, 0),
      Math.max(1 - hFrac, 0),
    );
    onPlace({ pageIndex: pageNumber - 1, x, y, width: w });
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!placing || !placement) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: placement.x,
      origY: placement.y,
    };
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!d || !rect || !placement || !sig) return;
    const w = placement.width;
    const hFrac = (w * rect.width * sig.aspect) / rect.height;
    const x = Math.min(
      Math.max(d.origX + (e.clientX - d.startX) / rect.width, 0),
      1 - w,
    );
    const y = Math.min(
      Math.max(d.origY + (e.clientY - d.startY) / rect.height, 0),
      Math.max(1 - hFrac, 0),
    );
    onPlace({ ...placement, x, y });
  }

  function endDrag() {
    drag.current = null;
  }

  return (
    <div
      ref={wrapRef}
      onPointerDown={placing && !placement ? placeAt : undefined}
      className={`relative bg-white shadow-md ${placing ? "cursor-crosshair" : ""}`}
    >
      <canvas ref={canvasRef} className="block" />
      {placement && sig && (
        <div
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            left: `${placement.x * 100}%`,
            top: `${placement.y * 100}%`,
            width: `${placement.width * 100}%`,
          }}
          className={`absolute touch-none select-none ${
            placing
              ? "cursor-move rounded-sm outline-2 outline-dashed outline-[var(--primary)]"
              : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sig.dataUrl}
            alt={t.sign.signatureAlt}
            draggable={false}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}

/** Bottom sheet with the drawing pad — the doc stays visible above it. */
function SignaturePadSheet({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (sig: { dataUrl: string; aspect: number }) => void;
}) {
  const t = useRoomDict();
  const [drawn, setDrawn] = useState<{ dataUrl: string; aspect: number } | null>(
    null,
  );
  return (
    <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <PadCanvas onChange={setDrawn} heightClass="h-36" />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-md border border-[var(--border)] px-4 py-3 text-sm hover:bg-[var(--secondary)]"
        >
          {t.common.cancel}
        </button>
        <button
          type="button"
          disabled={!drawn}
          onClick={() => drawn && onDone(drawn)}
          className="inline-flex flex-1 items-center justify-center rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {t.common.continue}
        </button>
      </div>
    </div>
  );
}

/**
 * Drawing pad. Reports the trimmed signature (transparent PNG cropped to the
 * ink's bounding box) on every stroke, so placement previews match exactly
 * what the server embeds in the PDF.
 */
function PadCanvas({
  onChange,
  heightClass,
}: {
  onChange: (sig: { dataUrl: string; aspect: number } | null) => void;
  heightClass: string;
}) {
  const t = useRoomDict();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a2e";
  }, []);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const p = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // A dot for taps, so single touches still leave ink.
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pointFrom(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function handleUp() {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(trimSignature(canvas));
  }

  function clearPad() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {t.sign.drawLabel}
        </p>
        <button
          type="button"
          onClick={clearPad}
          className="relative inline-flex items-center gap-1 py-1 text-xs text-[var(--muted-foreground)] after:absolute after:-inset-2 after:content-[''] hover:text-[var(--foreground)]"
        >
          <Eraser className="h-3.5 w-3.5" />
          {t.sign.clear}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        className={`mt-1.5 w-full touch-none rounded-lg border border-dashed border-[var(--border)] bg-white ${heightClass}`}
      />
    </div>
  );
}

function NameConsentFields({
  name,
  onName,
  email,
  onEmail,
  consent,
  onConsent,
}: {
  name: string;
  onName: (v: string) => void;
  email: string;
  onEmail: (v: string) => void;
  consent: boolean;
  onConsent: (v: boolean) => void;
}) {
  const t = useRoomDict();
  return (
    <>
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {t.sign.fullNameLabel}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t.sign.fullNamePlaceholder}
          autoComplete="name"
          className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-[var(--ring)] sm:text-sm"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {t.sign.emailLabel}
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder={t.sign.emailPlaceholder}
          autoComplete="email"
          className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-[var(--ring)] sm:text-sm"
        />
      </label>
      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => onConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
        />
        <span className="text-sm leading-5 text-[var(--muted-foreground)]">
          {t.sign.consentText}
        </span>
      </label>
    </>
  );
}

/** Crops the pad canvas to the ink's bounding box (plus a small margin). */
function trimSignature(
  canvas: HTMLCanvasElement,
): { dataUrl: string; aspect: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return { dataUrl: out.toDataURL("image/png"), aspect: h / w };
}
