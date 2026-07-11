import { cache } from "react";
import type { Metadata } from "next";
import { Lock, Sparkles } from "lucide-react";
import { getPublicDemoLinkByToken, recordDemoLinkView } from "@/db/queries/demo-links";
import { PLATFORMS } from "@/lib/platforms/config";
import { roomHeroVideo } from "@/lib/partner-room-videos";
import { RoomHeroVideo } from "@/components/partner-access/room-hero-video";
import { DemoAccessCard } from "@/components/demo-access/demo-access-card";
import { MotionProvider } from "@/components/motion-provider";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

const platformName = (id: string) =>
  PLATFORMS.find((p) => p.id === id)?.name ??
  id.charAt(0).toUpperCase() + id.slice(1);

// Deduped per request across generateMetadata + the page.
const getDemo = cache((token: string) =>
  getPublicDemoLinkByToken(token).catch(() => null),
);

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { token } = await params;
  const demo = await getDemo(token);
  const robots = { index: false, follow: false };
  if (!demo) return { title: "Demo no disponible", robots };
  return {
    title: `${platformName(demo.platformId)} · Demo`,
    description: demo.description ?? "Accede al demo — tu cuenta ya está lista.",
    robots,
  };
}

export default async function PublicDemoPage({ params }: { params: Params }) {
  const { token } = await params;
  const demo = await getDemo(token);
  if (!demo) return <UnavailableDemo />;

  // Fire-and-forget — a failed tally must never break the page.
  await recordDemoLinkView(demo.id).catch(() => {});

  const heroVideo = roomHeroVideo(demo.heroVideoKey);
  const brand = platformName(demo.platformId);

  return (
    <MotionProvider>
      <main lang="es" className="min-h-screen bg-[var(--bg-page)]">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6 md:py-10">
          <header
            className={`relative overflow-hidden rounded-2xl border p-6 md:p-8 ${
              heroVideo
                ? "flex min-h-[220px] flex-col justify-end border-black/20"
                : "border-[var(--border)] bg-[var(--card)]"
            }`}
          >
            {heroVideo ? (
              <RoomHeroVideo
                mp4={heroVideo.mp4}
                webm={heroVideo.webm}
                poster={heroVideo.poster}
              />
            ) : (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 60%), radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, var(--primary) 9%, transparent), transparent 55%)",
                }}
              />
            )}
            <div className="relative">
              <p
                className={`inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] ${
                  heroVideo ? "text-white/85" : "text-[var(--primary)]"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                {brand} · Demo
              </p>
              <h1
                className={`mt-2 text-2xl font-semibold tracking-tight md:text-3xl ${
                  heroVideo ? "text-white" : ""
                }`}
              >
                Tu demo está listo
              </h1>
              <p
                className={`mt-2 max-w-lg text-sm leading-6 ${
                  heroVideo ? "text-white/85" : "text-[var(--muted-foreground)]"
                }`}
              >
                Inicia sesión con la cuenta de abajo y entra directo — sin registros
                ni esperas.
              </p>
            </div>
          </header>

          <DemoAccessCard
            label={demo.label}
            description={demo.description}
            url={demo.url}
            username={demo.username}
            password={demo.password}
            accessNotes={demo.accessNotes}
            variant="page"
          />

          <footer className="mt-1 flex flex-col items-center gap-1 border-t border-[var(--border)] pt-5 text-center text-xs text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              Acceso de demostración — compartido solo contigo.
            </span>
            <span>Por favor, no reenvíes este enlace.</span>
          </footer>
        </div>
      </main>
    </MotionProvider>
  );
}

function UnavailableDemo() {
  return (
    <main lang="es" className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto grid min-h-screen w-full max-w-2xl place-items-center px-5 py-10">
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--secondary)]">
            <Lock className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Demo no disponible</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
            Este enlace de demo pudo haber sido revocado o reemplazado. Pide a quien
            te lo compartió el enlace más reciente.
          </p>
        </div>
      </div>
    </main>
  );
}
