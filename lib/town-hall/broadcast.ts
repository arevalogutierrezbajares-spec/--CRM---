import "server-only";

/**
 * Server-side Town Hall broadcast. Browser posts notify peers via the client
 * channel's `.send()`, but server-originated posts (e.g. the WhatsApp bot's
 * `post_to_townhall`) have no browser to do that — so open feeds would stay
 * stale until a manual reload. This pings the same Realtime channel the clients
 * listen on (`town-hall:<workspaceId>`, event `new-post`) via the Realtime
 * broadcast REST endpoint.
 *
 * Best-effort: any failure (missing env, network) is swallowed — the post is
 * already persisted; live delivery is a nicety, never a correctness dependency.
 */
export async function broadcastNewPost(workspaceId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: `town-hall:${workspaceId}`, event: "new-post", payload: {} }],
      }),
    });
  } catch {
    // swallow — delivery is best-effort
  }
}
