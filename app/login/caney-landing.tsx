"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestSignInLink, signInWithPassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArenaLoader } from "@/components/arena-loader";
import { AgbEnterLogo } from "@/components/brand/agb-enter-logo";

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Primary enter: glowing AGB mark, top-right (see AgbEnterLogo).
// Optional easter egg: the BOOK in the Caney photo (desktop pointer).
//
// Book hotspot coords are percentages of the SOURCE IMAGE (not the viewport),
// mapped through object-fit: cover math. Toggle DEBUG=true to dial them in.

// Real photo: man reading in a tent, surveyors in distance, mountains beyond.
const IMAGE_SRC = "/caney.png";
const IMAGE_NATURAL = { w: 1672, h: 941 };

/** Book easter-egg hotspot in source-image space. */
const HOTSPOT_IMG = {
  xPct: 58,
  yPct: 73,
  wPct: 7,
  hPct: 11,
};

const DEBUG = false;

// Shatter tuning
const GRID_X = 10;
const GRID_Y = 8;
const SHATTER_MS = 700;

// ─── Cover layout math ────────────────────────────────────────────────────────

type CoverLayout = {
  /** Rendered image size in container pixels (may exceed container). */
  rw: number;
  rh: number;
  /** Offset of image top-left relative to container (usually ≤ 0). */
  ox: number;
  oy: number;
  cw: number;
  ch: number;
};

function computeCoverLayout(cw: number, ch: number): CoverLayout {
  const { w: iw, h: ih } = IMAGE_NATURAL;
  const scale = Math.max(cw / iw, ch / ih);
  const rw = iw * scale;
  const rh = ih * scale;
  const ox = (cw - rw) / 2;
  const oy = (ch - rh) / 2;
  return { rw, rh, ox, oy, cw, ch };
}

/** Map image-% hotspot → container-% box (left/top/width/height). */
function hotspotToContainer(
  layout: CoverLayout,
  img = HOTSPOT_IMG,
  expandPx = 0,
): { left: number; top: number; width: number; height: number } {
  const { rw, rh, ox, oy, cw, ch } = layout;
  let leftPx = ox + (img.xPct / 100) * rw - (img.wPct / 100) * rw * 0.5;
  let topPx = oy + (img.yPct / 100) * rh - (img.hPct / 100) * rh * 0.5;
  let widthPx = (img.wPct / 100) * rw;
  let heightPx = (img.hPct / 100) * rh;

  // Expand to a usable tap target without shifting the visual center.
  if (expandPx > 0) {
    const needW = Math.max(0, expandPx - widthPx);
    const needH = Math.max(0, expandPx - heightPx);
    leftPx -= needW / 2;
    topPx -= needH / 2;
    widthPx += needW;
    heightPx += needH;
  }

  return {
    left: (leftPx / cw) * 100,
    top: (topPx / ch) * 100,
    width: (widthPx / cw) * 100,
    height: (heightPx / ch) * 100,
  };
}

function pointInHotspot(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  layout: CoverLayout,
  expandPx: number,
): boolean {
  const box = hotspotToContainer(layout, HOTSPOT_IMG, expandPx);
  const xPct = ((clientX - rect.left) / rect.width) * 100;
  const yPct = ((clientY - rect.top) / rect.height) * 100;
  return (
    xPct >= box.left &&
    xPct <= box.left + box.width &&
    yPct >= box.top &&
    yPct <= box.top + box.height
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

type Phase = "idle" | "shattering" | "form";

export function CaneyLanding() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [hover, setHover] = useState(false);
  const [cursor, setCursor] = useState({ x: -100, y: -100, vis: false });
  const [hintVisible, setHintVisible] = useState(false);
  const [layout, setLayout] = useState<CoverLayout | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  // Keep cover layout in sync with the container (resize / orientation).
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setLayout(computeCoverLayout(r.width, r.height));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  /** Primary enter — AGB logo already played its Pixar beat; open the form. */
  const enterFromLogo = useCallback(() => {
    if (phase !== "idle") return;
    setHover(false);
    setCursor((c) => ({ ...c, vis: false }));
    setPhase("form");
  }, [phase]);

  /** Book easter egg — pixel shatter then form. */
  const enterFromBook = useCallback(() => {
    if (phase !== "idle") return;
    setPhase("shattering");
    setHover(false);
    setCursor((c) => ({ ...c, vis: false }));
    setTimeout(() => setPhase("form"), SHATTER_MS - 100);
  }, [phase]);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== "idle") return;
    const el = imgRef.current;
    if (!el || !layout) return;
    // Book easter egg is pointer-only; skip touch (logo is the mobile enter).
    if (e.pointerType === "touch") return;
    const rect = el.getBoundingClientRect();
    const inHotspot = pointInHotspot(e.clientX, e.clientY, rect, layout, 0);
    setHover(inHotspot);
    setCursor({ x: e.clientX, y: e.clientY, vis: true });
    if (DEBUG) {
      const { rw, rh, ox, oy } = layout;
      const imgX = ((e.clientX - rect.left - ox) / rw) * 100;
      const imgY = ((e.clientY - rect.top - oy) / rh) * 100;
      // eslint-disable-next-line no-console
      console.log(
        `img x=${imgX.toFixed(1)}% y=${imgY.toFixed(1)}% inside=${inHotspot}`,
      );
    }
  }

  function handlePointerLeave() {
    setHover(false);
    setCursor((c) => ({ ...c, vis: false }));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== "idle" || !layout) return;
    // Keep the book as a desktop easter egg only.
    if (e.pointerType === "touch") return;
    const el = imgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!pointInHotspot(e.clientX, e.clientY, rect, layout, 0)) return;
    e.preventDefault();
    enterFromBook();
  }

  const box = layout ? hotspotToContainer(layout, HOTSPOT_IMG, 0) : null;

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-black text-white"
      style={{
        cursor: hover && phase === "idle" ? "none" : "default",
        // Prevent iOS rubber-band / double-tap zoom from stealing the gesture.
        touchAction: "manipulation",
      }}
    >
      {/* Caney image — full bleed */}
      <div
        ref={imgRef}
        className="absolute inset-0"
        onPointerMove={phase === "idle" ? handlePointerMove : undefined}
        onPointerLeave={handlePointerLeave}
        onPointerDown={phase === "idle" ? handlePointerDown : undefined}
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

        {/* Debug overlay — book easter-egg bounds */}
        {DEBUG && box && (
          <div
            className="pointer-events-none absolute border-2 border-pink-400/70 bg-pink-400/10"
            style={{
              left: `${box.left}%`,
              top: `${box.top}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
          />
        )}

        {/* Pixel-shatter cells — only rendered during shatter */}
        {phase === "shattering" && layout && (
          <ShatterGrid layout={layout} />
        )}
      </div>

      {/* Primary enter: glowing AGB mark, top-right */}
      {phase === "idle" && (
        <div
          className="absolute right-3 top-3 z-50 sm:right-7 sm:top-6"
          style={{
            // Notch / home-indicator safe on iOS
            marginTop: "env(safe-area-inset-top, 0px)",
            marginRight: "env(safe-area-inset-right, 0px)",
          }}
        >
          <AgbEnterLogo onEnter={enterFromLogo} size={44} />
        </div>
      )}

      {/* Custom glowing cursor (over the book easter egg) */}
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

      {/* Poetic hint after 10s of dwell */}
      {phase === "idle" && hintVisible && (
        <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.4em] text-white/30 [animation:fade-in_3s_ease-out]">
          every house has a way in
        </div>
      )}

      {/* Brand mark — top-left wordmark */}
      <div className="pointer-events-none absolute left-5 top-5 z-30 font-mono text-[10px] uppercase tracking-[0.5em] sm:left-8 sm:top-8">
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

function cellNoise(row: number, col: number, salt: number): number {
  const x = Math.sin((row + 1) * 12.9898 + (col + 1) * 78.233 + salt * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

function ShatterGrid({ layout }: { layout: CoverLayout }) {
  // Shatter cells track the *visual* book region (image-mapped), so the effect
  // still erupts from the book even when the mobile hit target is larger.
  const box = hotspotToContainer(layout, HOTSPOT_IMG, 0);
  const cells: React.ReactNode[] = [];
  for (let row = 0; row < GRID_Y; row++) {
    for (let col = 0; col < GRID_X; col++) {
      const cellLeftPct = box.left + (box.width / GRID_X) * col;
      const cellTopPct = box.top + (box.height / GRID_Y) * row;
      const cellWidthPct = box.width / GRID_X;
      const cellHeightPct = box.height / GRID_Y;
      const cellLeftPx = (cellLeftPct / 100) * layout.cw;
      const cellTopPx = (cellTopPct / 100) * layout.ch;
      const tx = (cellNoise(row, col, 1) - 0.5) * 600;
      const ty = (cellNoise(row, col, 2) - 0.5) * 600 - 50;
      const rot = (cellNoise(row, col, 3) - 0.5) * 720;
      const delay = cellNoise(row, col, 4) * 180;
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
              // Match object-fit: cover — position image relative to each cell
              // so the slice under that cell matches the photo underneath.
              backgroundSize: `${layout.rw}px ${layout.rh}px`,
              backgroundPosition: `${layout.ox - cellLeftPx}px ${layout.oy - cellTopPx}px`,
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
  // Once sign-in succeeds, hand off to the post-login loading interstitial,
  // which plays the passage and then navigates into the CRM.
  const [enteringTo, setEnteringTo] = useState<string | null>(null);

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
    // Arm the post-greeting WIN audio — plays once after the greeting on Home.
    try {
      sessionStorage.setItem("agb_play_win", "1");
    } catch {
      /* ignore */
    }
    setEnteringTo(nextTarget());
  }

  if (enteringTo) return <ArenaLoader next={enteringTo} />;

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
