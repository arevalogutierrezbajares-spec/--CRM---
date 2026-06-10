import {
  getPresentationByShareToken,
  listPresentationComments,
} from "@/db/queries/presentations";
import { PresentationPlayer } from "@/components/presentations/presentation-player";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

export default async function PublicPresentationPage(props: { params: Params }) {
  const { token } = await props.params;
  const pres = await getPresentationByShareToken(token).catch(() => null);

  if (!pres) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-2 bg-neutral-950 px-6 text-center text-white">
        <p className="text-lg font-medium">This presentation isn’t available.</p>
        <p className="text-sm text-white/50">
          The link may have been turned off or is incorrect.
        </p>
      </main>
    );
  }

  const comments = await listPresentationComments({ presentationId: pres.id });

  return (
    <PresentationPlayer
      presentationId={pres.id}
      slides={pres.slides}
      initialComments={comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      }))}
      mode="external"
      token={token}
      allowComments={pres.allowComments}
    />
  );
}
