/**
 * Guest-facing loading skeleton for a partner room. Shown while the server
 * resolves the room (getPublicPartnerRoomByToken) on a cold navigation. Mirrors
 * the real layout — hero header, messages CTA bar, then the content/aside grid —
 * so the shell doesn't shift when content arrives. Covers both /access/<token>
 * and the /room/<slug>/<token> rewrite, since both render this route.
 *
 * Purely presentational: no room data (there is none yet), no client hooks.
 */
export default function RoomLoading() {
  return (
    <main
      className="min-h-screen bg-[var(--bg-page)]"
      aria-busy="true"
      aria-label="Cargando la sala…"
    >
      <div className="mx-auto flex w-full max-w-6xl animate-pulse flex-col gap-5 px-5 py-5 motion-reduce:animate-none md:px-8 md:py-8">
        {/* Hero header */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 md:p-9">
          <div className="h-14 w-14 rounded-xl bg-[var(--secondary)]" />
          <div className="mt-5 h-3 w-40 rounded bg-[var(--secondary)]" />
          <div className="mt-3 h-8 w-3/4 rounded-lg bg-[var(--secondary)] md:w-1/2" />
          <div className="mt-4 h-4 w-full max-w-2xl rounded bg-[var(--secondary)]" />
          <div className="mt-2 h-4 w-2/3 max-w-xl rounded bg-[var(--secondary)]" />
        </div>

        {/* Messages CTA bar */}
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--secondary)]" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 w-32 rounded bg-[var(--secondary)]" />
            <div className="h-3.5 w-2/3 rounded bg-[var(--secondary)]" />
          </div>
        </div>

        {/* Content + aside grid */}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
              >
                <div className="h-4 w-40 rounded bg-[var(--secondary)]" />
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full rounded bg-[var(--secondary)]" />
                  <div className="h-3 w-5/6 rounded bg-[var(--secondary)]" />
                  <div className="h-3 w-3/4 rounded bg-[var(--secondary)]" />
                </div>
              </div>
            ))}
          </div>
          <aside className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="h-4 w-24 rounded bg-[var(--secondary)]" />
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--secondary)]" />
                    <div className="h-3 flex-1 rounded bg-[var(--secondary)]" />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
