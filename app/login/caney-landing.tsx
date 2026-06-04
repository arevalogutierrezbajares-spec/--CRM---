"use client";

import { useEffect, useRef, useState } from "react";
import { requestSignInLink, signInWithPassword } from "@/app/actions/auth";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  // Implicit-flow magic-link handler: when Supabase's email link lands here
  // with `#access_token=…&refresh_token=…` in the URL hash, forward the
  // tokens to /auth/handoff which establishes the session SERVER-SIDE.
  //
  // Why not client-side setSession? Supabase projects using HS256 signing
  // keys can't publish a verifying secret in JWKS, so the browser SDK
  // rejects the JWT with "unrecognized kid" / "signature is invalid". The
  // server-side @supabase/ssr just trusts and stores the tokens via the
  // cookie API. PKCE flow (?code=…) is handled by middleware + /auth/callback.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (!hash.includes("access_token=")) return;
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    (async () => {
      const resp = await fetch("/auth/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token, refresh_token }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error("auth handoff failed:", err.error ?? resp.status);
        return;
      }
      // Clear the hash so a reload doesn't try to re-process it, then go to
      // wherever the middleware originally wanted to send the user.
      const urlNext = new URLSearchParams(window.location.search).get("next");
      const target = urlNext && urlNext.startsWith("/") ? urlNext : "/";
      window.history.replaceState(null, "", window.location.pathname);
      window.location.href = target;
    })();
  }, []);

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

// ─── Sign-in form — matches the rest of the platform ────────────────────────

function HolographicForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // signing-in with a password, or sending a setup/forgot link.
  const [status, setStatus] = useState<"idle" | "signing" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function nextTarget() {
    const urlNext = new URLSearchParams(window.location.search).get("next");
    return urlNext && urlNext.startsWith("/") ? urlNext : "/";
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus("signing");
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    const result = await signInWithPassword(fd);
    if (!result.ok) {
      setStatus("error");
      setError(result.error ?? "Could not sign in.");
      return;
    }
    window.location.href = nextTarget();
  }

  // First time / forgot password → email a magic link that lands on
  // /set-password (after which the user signs in with their password).
  async function handleSetupLink() {
    if (!email || !email.includes("@")) {
      setStatus("error");
      setError("Enter your email first, then request a setup link.");
      return;
    }
    setStatus("sending");
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("next", "/set-password");
    const result = await requestSignInLink(fd);
    if (!result.ok) {
      setStatus("error");
      setError(result.error ?? "Could not send the setup link.");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="absolute left-1/2 top-1/2 z-40 w-[min(380px,calc(100vw-2rem))] [animation:form-rise_700ms_cubic-bezier(0.2,0.9,0.3,1)_forwards]">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-7 text-[var(--text-primary)] shadow-2xl">
        <div className="mb-6 space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-[var(--text-tertiary)]">
            X
            <span className="opacity-50"> . </span>
            JEAV
            <span className="opacity-50"> . </span>
            TIGR
            <span className="opacity-50"> · access</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Access by invitation only. Sign in with your email and password.
          </p>
        </div>

        {status === "sent" ? (
          <div className="space-y-2 rounded-md border border-[var(--green-mid)]/30 bg-[var(--green-bg)] p-3 text-sm text-[var(--green-text)]">
            <div className="font-medium">Check your inbox</div>
            <p className="text-[13px]">
              A link to set your password is on its way to <strong>{email}</strong>. Open it,
              choose a password, and you&apos;re in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setError(null);
                  setEmail(e.target.value);
                }}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setError(null);
                  setPassword(e.target.value);
                }}
                placeholder="Your password"
              />
            </div>

            <Button type="submit" className="w-full" loading={status === "signing"}>
              Sign in
            </Button>

            {error && (
              <div className="rounded-md border border-[var(--red-mid)]/30 bg-[var(--red-bg)] p-3 text-sm text-[var(--red-text)]">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSetupLink}
              disabled={status === "sending"}
              className="w-full text-center text-[13px] text-[var(--text-tertiary)] underline-offset-4 hover:text-[var(--text-secondary)] hover:underline disabled:opacity-50"
            >
              {status === "sending"
                ? "Sending link…"
                : "First time, or forgot your password? Email me a setup link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
