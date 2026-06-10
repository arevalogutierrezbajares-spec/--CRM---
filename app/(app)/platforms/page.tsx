import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { PlatformCard } from "@/components/platforms/platform-card";
import { PLATFORMS } from "@/lib/platforms/config";
import {
  caneyChecks,
  vavChecks,
  type PlatformCheck,
} from "@/lib/platforms/status.server";

// Status pings must run fresh on every visit, never from the build cache.
export const dynamic = "force-dynamic";

export default async function PlatformsPage() {
  const user = await requireUser();

  const checksById: Record<string, PlatformCheck[]> = {};
  await Promise.all(
    PLATFORMS.map(async (p) => {
      checksById[p.id] =
        p.id === "vav"
          ? await vavChecks(p.baseUrl)
          : await caneyChecks(p.baseUrl);
    }),
  );

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">
            Platform Management
          </h1>
          <p className="text-[13px] text-text-secondary">
            Jump into each venture&apos;s admin — links open in a new tab and use
            that platform&apos;s own login.
          </p>
        </header>

        {PLATFORMS.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            checks={checksById[platform.id] ?? []}
          />
        ))}
      </main>
    </>
  );
}
