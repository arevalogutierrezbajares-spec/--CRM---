import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
          href="/meetings"
          className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> All meetings
        </Link>
        <RecordingDetail id={id} />
      </main>
    </>
  );
}
