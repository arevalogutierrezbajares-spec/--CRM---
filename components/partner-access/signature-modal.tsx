"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Loader2, PenLine, X } from "lucide-react";

export type SignatureResult = {
  requestId: string;
  signerName: string;
  signedAt: string;
  hasSignedPdf: boolean;
};

/**
 * Phone-first signing sheet: full-screen on mobile, centered card on desktop.
 * Draw with finger/stylus/mouse, confirm name + consent, submit. The server
 * assigns the timestamp and builds the audit record.
 */
export function SignatureModal({
  token,
  requestId,
  documentTitle,
  message,
  defaultName,
  onClose,
  onSigned,
}: {
  token: string;
  requestId: string;
  documentTitle: string;
  message: string | null;
  defaultName: string;
  onClose: () => void;
  onSigned: (result: SignatureResult) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [name, setName] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Crisp canvas on retina: scale the backing store by devicePixelRatio.
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
    ctx.strokeStyle = "#1a1a1e";
  }, []);

  // Lock body scroll while the sheet is open (mobile).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
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
    setHasStrokes(true);
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
  }

  function clearPad() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  async function submit() {
    if (busy) return;
    setError(null);
    if (!hasStrokes) {
      setError("Dibuja tu firma en el recuadro.");
      return;
    }
    if (name.trim().length < 3) {
      setError("Escribe tu nombre completo.");
      return;
    }
    if (!consent) {
      setError("Confirma que aceptas firmar electrónicamente.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/access/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          signerName: name.trim(),
          signatureDataUrl: canvas.toDataURL("image/png"),
          consent: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        signedAt?: string;
        signerName?: string;
        hasSignedPdf?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "No se pudo registrar la firma. Intenta de nuevo.");
        return;
      }
      onSigned({
        requestId,
        signerName: data.signerName ?? name.trim(),
        signedAt: data.signedAt ?? new Date().toISOString(),
        hasSignedPdf: Boolean(data.hasSignedPdf),
      });
    } catch {
      setError("Sin conexión. Revisa tu internet e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Firmar ${documentTitle}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="flex max-h-[94dvh] w-full flex-col overflow-y-auto rounded-t-2xl bg-[var(--card)] p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--primary)]">
              <PenLine className="h-3.5 w-3.5" />
              Firma electrónica
            </p>
            <h2 className="mt-1 text-base font-semibold leading-snug">{documentTitle}</h2>
            {message && (
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{message}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Dibuja tu firma
            </p>
            <button
              type="button"
              onClick={clearPad}
              className="relative inline-flex items-center gap-1 py-1 text-xs text-[var(--muted-foreground)] after:absolute after:-inset-2 after:content-[''] hover:text-[var(--foreground)]"
            >
              <Eraser className="h-3.5 w-3.5" />
              Borrar
            </button>
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            className="mt-1.5 h-40 w-full touch-none rounded-lg border border-dashed border-[var(--border)] bg-white"
          />
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Tu nombre completo
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre y apellido"
            className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-[var(--ring)] sm:text-sm"
          />
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
          />
          <span className="text-sm leading-5 text-[var(--muted-foreground)]">
            Acepto firmar este documento electrónicamente. Entiendo que mi firma,
            nombre, y la fecha y hora del servidor quedarán registrados como
            constancia de mi consentimiento.
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Registrando firma…" : "Firmar documento"}
        </button>
        <p className="mt-2 text-center text-[11px] text-[var(--muted-foreground)]">
          La fecha y hora de la firma las registra el servidor.
        </p>
      </div>
    </div>
  );
}
