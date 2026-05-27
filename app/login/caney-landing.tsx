"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Drop your Caney photo at /public/caney.jpg (or update IMAGE_SRC below).
// Then tune the hotspot region. Toggle DEBUG=true to see hotspot bounds while
// you dial it in, then set DEBUG=false to ship the mystery.
//
// Coordinates are percentages of the rendered image (so they survive any
// viewport size).
//
// Tip: open DevTools, hover the image, and watch the console — when DEBUG is
// on, mousemove logs the x/y % so you can pick exact coords by eye.

// Real photo: man reading in a tent, surveyors in distance, mountains beyond.
// The entry point is the BOOK he's holding in front of his face.
const IMAGE_SRC = "/caney.png";
const HOTSPOT = {
  xPct: 58,    // center of book — slightly right of image center
  yPct: 73,    // book is in the lower-middle area
  wPct: 7,     // book is small — narrow hotspot
  hPct: 11,    // book is roughly portrait orientation
};
const DEBUG = false;

// Shatter tuning
const GRID_X = 10;
const GRID_Y = 8;
const SHATTER_MS = 700;

// ─── COMPONENT ────────────────────────────────────────────────────────────────

type Phase = "idle" | "shattering" | "form";

export function CaneyLanding() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [hover, setHover] = useState(false);
  const [cursor, setCursor] = useState({ x: -100, y: -100, vis: false });
  const [hintVisible, setHintVisible] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // Show the poetic hint after 10s of idle dwell on the page (only once).
  useEffect(() => {
    if (phase !== "idle") return;
    const t = setTimeout(() => setHintVisible(true), 10_000);
    return () => clearTimeout(t);
  }, [phase]);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = imgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const inHotspot =
      xPct >= HOTSPOT.xPct - HOTSPOT.wPct / 2 &&
      xPct <= HOTSPOT.xPct + HOTSPOT.wPct / 2 &&
      yPct >= HOTSPOT.yPct - HOTSPOT.hPct / 2 &&
      yPct <= HOTSPOT.yPct + HOTSPOT.hPct / 2;
    setHover(inHotspot);
    setCursor({ x: e.clientX, y: e.clientY, vis: true });
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`x=${xPct.toFixed(1)}% y=${yPct.toFixed(1)}% inside=${inHotspot}`);
    }
  }

  function handleLeave() {
    setHover(false);
    setCursor((c) => ({ ...c, vis: false }));
  }

  function handleClick() {
    if (phase !== "idle" || !hover) return;
    setPhase("shattering");
    // After the shatter completes, switch to the form
    setTimeout(() => setPhase("form"), SHATTER_MS - 100);
  }

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-black text-white"
      style={{ cursor: hover && phase === "idle" ? "none" : "default" }}
    >
      {/* Caney image — full bleed */}
      <div
        ref={imgRef}
        className="absolute inset-0"
        onMouseMove={phase === "idle" ? handleMove : undefined}
        onMouseLeave={handleLeave}
        onClick={handleClick}
      >
        <div
          className="absolute inset-0 bg-cover bg-center transition-[filter,transform] duration-700"
          style={{
            backgroundImage: `url(${IMAGE_SRC}), linear-gradient(135deg, #0a0e14 0%, #1a1410 50%, #0a0e14 100%)`,
            filter: phase === "form" ? "blur(8px) brightness(0.35)" : "none",
            transform: phase === "form" ? "scale(1.05)" : "scale(1)",
          }}
        />

        {/* Ambient overlays: scanlines + vignette pulse */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.6)_100%)] [animation:vignette-pulse_8s_ease-in-out_infinite]" />
        <div className="pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.015)_0,rgba(255,255,255,0.015)_1px,transparent_1px,transparent_3px)] mix-blend-overlay" />

        {/* Debug overlay — shows hotspot bounds */}
        {DEBUG && (
          <div
            className="absolute border-2 border-pink-400/70 bg-pink-400/10 pointer-events-none"
            style={{
              left: `${HOTSPOT.xPct - HOTSPOT.wPct / 2}%`,
              top: `${HOTSPOT.yPct - HOTSPOT.hPct / 2}%`,
              width: `${HOTSPOT.wPct}%`,
              height: `${HOTSPOT.hPct}%`,
            }}
          />
        )}

        {/* Pixel-shatter cells — only rendered during shatter */}
        {phase === "shattering" && <ShatterGrid />}
      </div>

      {/* Custom glowing cursor (only visible over the hotspot) */}
      {phase === "idle" && hover && cursor.vis && (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: cursor.x,
            top: cursor.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="relative h-4 w-4">
            <div className="absolute inset-0 rounded-full bg-cyan-300 [animation:cursor-pulse_1.4s_ease-in-out_infinite]" />
            <div className="absolute -inset-3 rounded-full bg-cyan-300/30 blur-md [animation:cursor-pulse_1.4s_ease-in-out_infinite]" />
            <div className="absolute -inset-6 rounded-full bg-cyan-300/10 blur-xl" />
          </div>
        </div>
      )}

      {/* Poetic hint after 10s of dwell — never points at the location */}
      {phase === "idle" && hintVisible && (
        <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.4em] text-white/30 [animation:fade-in_3s_ease-out]">
          every house has a way in
        </div>
      )}

      {/* Brand mark — always present, faint */}
      <div className="pointer-events-none absolute left-8 top-8 z-30 font-mono text-[10px] uppercase tracking-[0.5em]">
        <span className="text-cyan-300/80">X</span>
        <span className="text-white/30"> . </span>
        <span className="text-white/60">JEAV</span>
        <span className="text-white/30"> . </span>
        <span className="text-cyan-300/40">TIGR</span>
      </div>

      {/* Holographic sign-in form */}
      {phase === "form" && <HolographicForm />}

      <style jsx global>{`
        @keyframes cursor-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.4); opacity: 0.65; }
        }
        @keyframes vignette-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.7; }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes shatter-cell {
          0%   { transform: translate(0,0) rotate(0) scale(1); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0); opacity: 0; }
        }
        @keyframes form-rise {
          0%   { opacity: 0; transform: translate(-50%, -45%) scale(0.96); filter: blur(8px); }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); filter: blur(0); }
        }
        @keyframes scanline-sweep {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(200%); }
        }
        @keyframes glitch-shift {
          0%, 100%  { transform: translate(0); }
          20%       { transform: translate(-1px, 1px); }
          40%       { transform: translate(1px, -1px); }
          60%       { transform: translate(-1px, 0); }
          80%       { transform: translate(0, 1px); }
        }
      `}</style>
    </main>
  );
}

// ─── Pixel shatter grid ───────────────────────────────────────────────────────

function ShatterGrid() {
  // Render a grid of cells over the hotspot area. Each shows the same
  // background image with an offset so it looks seamless before shattering.
  const cells: React.ReactNode[] = [];
  const left = HOTSPOT.xPct - HOTSPOT.wPct / 2;
  const top = HOTSPOT.yPct - HOTSPOT.hPct / 2;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
  for (let row = 0; row < GRID_Y; row++) {
    for (let col = 0; col < GRID_X; col++) {
      const cellLeftPct = left + (HOTSPOT.wPct / GRID_X) * col;
      const cellTopPct = top + (HOTSPOT.hPct / GRID_Y) * row;
      const cellWidthPct = HOTSPOT.wPct / GRID_X;
      const cellHeightPct = HOTSPOT.hPct / GRID_Y;
      // Random shatter trajectory
      const tx = (Math.random() - 0.5) * 600;
      const ty = (Math.random() - 0.5) * 600 - 50;
      const rot = (Math.random() - 0.5) * 720;
      const delay = Math.random() * 180;
      cells.push(
        <div
          key={`${row}-${col}`}
          className="absolute will-change-transform"
          style={
            {
              left: `${cellLeftPct}%`,
              top: `${cellTopPct}%`,
              width: `${cellWidthPct}%`,
              height: `${cellHeightPct}%`,
              backgroundImage: `url(${IMAGE_SRC}), linear-gradient(135deg, #0a0e14, #1a1410)`,
              // Each cell shows its own slice of the underlying image. We
              // make the background fill the viewport, then offset it so the
              // cell at (cellLeftPct, cellTopPct) shows the matching piece.
              backgroundSize: "100vw 100vh",
              backgroundPosition: `${-vw * cellLeftPct / 100}px ${-vh * cellTopPct / 100}px`,
              animation: `shatter-cell ${SHATTER_MS}ms cubic-bezier(0.4, 0, 0.6, 1) ${delay}ms forwards`,
              "--tx": `${tx}px`,
              "--ty": `${ty}px`,
              "--rot": `${rot}deg`,
              boxShadow: "0 0 4px rgba(0, 230, 255, 0.4)",
            } as React.CSSProperties
          }
        />,
      );
    }
  }
  return <>{cells}</>;
}

// ─── Holographic sign-in form ─────────────────────────────────────────────────

function HolographicForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      setStatus("error");
      setError(authError.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div
      className="absolute left-1/2 top-1/2 z-40 w-[min(420px,calc(100vw-2rem))] [animation:form-rise_700ms_cubic-bezier(0.2,0.9,0.3,1)_forwards]"
    >
      {/* Frame */}
      <div className="relative border border-cyan-300/40 bg-black/70 p-8 backdrop-blur-xl shadow-[0_0_60px_rgba(0,200,255,0.15)]">
        {/* Grid pattern background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(0,230,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,230,255,0.4) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Scanline sweep */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-0 right-0 h-px bg-cyan-300/60 [animation:scanline-sweep_3.5s_linear_infinite] shadow-[0_0_8px_2px_rgba(0,230,255,0.5)]" />
        </div>

        {/* Corner brackets */}
        <Bracket pos="tl" />
        <Bracket pos="tr" />
        <Bracket pos="bl" />
        <Bracket pos="br" />

        {/* Content */}
        <div className="relative">
          <div className="mb-6 space-y-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-cyan-300/70">
              <span className="text-cyan-300/90">X</span>
              <span className="text-cyan-300/50"> . </span>
              JEAV
              <span className="text-cyan-300/50"> . </span>
              <span className="text-cyan-300/50">TIGR</span>
              <span className="text-cyan-300/40"> · access</span>
            </div>
            <h1 className="font-mono text-2xl font-light tracking-wider text-white [animation:glitch-shift_4s_steps(1)_infinite]">
              IDENTIFY
            </h1>
          </div>

          {status === "sent" ? (
            <div className="space-y-3 font-mono text-sm text-cyan-100">
              <div className="flex items-center gap-2 text-cyan-300">
                <span className="inline-block h-1.5 w-1.5 animate-pulse bg-cyan-300" />
                LINK DISPATCHED
              </div>
              <p className="text-xs text-white/60">
                Check <span className="text-cyan-300">{email}</span> for your access link.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300/70"
                >
                  ▸ email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-cyan-300/30 bg-black/40 px-4 py-3 font-mono text-sm text-white placeholder:text-white/20 focus:border-cyan-300 focus:outline-none focus:shadow-[0_0_20px_rgba(0,230,255,0.3)] transition-all"
                  placeholder="you@domain"
                />
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
                className="group relative w-full overflow-hidden border border-cyan-300/60 bg-cyan-300/10 px-4 py-3 font-mono text-xs uppercase tracking-[0.3em] text-cyan-100 transition-all hover:bg-cyan-300/20 hover:shadow-[0_0_30px_rgba(0,230,255,0.4)] disabled:opacity-50"
              >
                <span className="relative z-10">
                  {status === "sending" ? "transmitting…" : "request access"}
                </span>
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
              </button>

              {error && (
                <div className="border border-red-400/40 bg-red-400/10 p-3 font-mono text-xs text-red-200">
                  ✗ {error}
                </div>
              )}
            </form>
          )}

          <div className="mt-6 border-t border-cyan-300/20 pt-3 font-mono text-[9px] uppercase tracking-[0.3em] text-white/30">
            v.0.1 · encrypted channel
          </div>
        </div>
      </div>
    </div>
  );
}

function Bracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const cls = {
    tl: "top-0 left-0 border-t border-l",
    tr: "top-0 right-0 border-t border-r",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  }[pos];
  return (
    <div
      className={`pointer-events-none absolute h-4 w-4 border-cyan-300 ${cls}`}
    />
  );
}
