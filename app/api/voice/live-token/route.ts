import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

/**
 * Mints a short-lived Deepgram token so the browser can open a streaming
 * WebSocket directly to Deepgram without ever seeing the real API key.
 * Token TTL is 30s — long enough to establish the connection; the live
 * session stays open once connected.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY not set" },
      { status: 503 },
    );
  }

  try {
    const resp = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 30 }),
    });
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Deepgram grant failed (${resp.status})`, detail: await resp.text() },
        { status: 502 },
      );
    }
    const json = (await resp.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) {
      return NextResponse.json(
        { error: "Deepgram returned no token" },
        { status: 502 },
      );
    }
    return NextResponse.json({
      token: json.access_token,
      expiresIn: json.expires_in ?? 30,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
