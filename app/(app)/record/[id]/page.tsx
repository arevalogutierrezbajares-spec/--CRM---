import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { RecordingDetail } from "@/components/voice/recording-detail";

export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <Link
          href="/record"
          className="mb-4 inline-block text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          ← All recordings
        </Link>
        <RecordingDetail id={id} />
      </main>
    </>
  );
}
