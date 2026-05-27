/**
 * Thin wrapper around the WhatsApp Cloud API.
 *
 * Env required to activate sending:
 *   WA_PHONE_NUMBER_ID    Cloud API phone number id
 *   WA_ACCESS_TOKEN       permanent system-user token
 *   WA_VERIFY_TOKEN       arbitrary secret used by the webhook GET handshake
 */

const GRAPH_VERSION = "v21.0";

/**
 * Verify the x-hub-signature-256 header that Meta attaches to webhook POSTs.
 * Signature is `sha256=<hex hmac>` of the raw request body, keyed by
 * WA_APP_SECRET. Returns true on match (or when the secret isn't configured —
 * we treat that as dev mode). Returns false on mismatch or malformed header.
 */
export async function verifyMetaSignature(opts: {
  header: string | null;
  rawBody: string;
}): Promise<boolean> {
  const secret = process.env.WA_APP_SECRET;
  if (!secret) return true; // unconfigured → skip (dev / no Meta app yet)
  if (!opts.header || !opts.header.startsWith("sha256=")) return false;
  const expected = opts.header.slice("sha256=".length);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(opts.rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hex.length !== expected.length) return false;
  // Constant-time compare to avoid timing attacks.
  let diff = 0;
  for (let i = 0; i < hex.length; i++) {
    diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WA_PHONE_NUMBER_ID &&
      process.env.WA_ACCESS_TOKEN &&
      process.env.WA_VERIFY_TOKEN,
  );
}

export async function sendWhatsAppText(opts: {
  to: string; // E.164, e.g. +15551234567
  body: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  const token = process.env.WA_ACCESS_TOKEN;
  if (!phoneId || !token) {
    return { ok: false, error: "WA credentials not configured" };
  }
  const resp = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: opts.to.replace(/^\+/, ""),
        type: "text",
        text: { body: opts.body.slice(0, 4096), preview_url: false },
      }),
    },
  );
  const json = (await resp.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };
  if (!resp.ok) {
    return {
      ok: false,
      error: json.error?.message ?? `WA send failed (${resp.status})`,
    };
  }
  return { ok: true, id: json.messages?.[0]?.id ?? "unknown" };
}

/**
 * Parse a slash-command body. Examples:
 *   /log @marta had coffee, talked about funding
 *   /note bd: chase carlos next week
 *   /find marta
 */
export type ParsedCommand =
  | { kind: "log"; targetHint: string; body: string }
  | { kind: "note"; tagHint: string | null; body: string }
  | { kind: "find"; query: string }
  | { kind: "help" }
  | { kind: "unknown"; raw: string };

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return { kind: "unknown", raw: trimmed };
  }
  // Pull off the command word, preserve the remainder verbatim (newlines + all).
  const afterSlash = trimmed.slice(1);
  const headMatch = afterSlash.match(/^(\S+)\s*([\s\S]*)$/);
  const head = (headMatch?.[1] ?? afterSlash).trim();
  const rest = headMatch?.[2] ?? "";
  const cmd = head.toLowerCase();

  if (cmd === "help" || cmd === "?") return { kind: "help" };
  if (cmd === "find") return { kind: "find", query: rest };
  if (cmd === "log") {
    // First whitespace-delimited token starting with @ is the contact hint.
    const m = rest.match(/^@(\S+)\s*([\s\S]*)$/);
    if (m) return { kind: "log", targetHint: m[1], body: m[2] };
    return { kind: "log", targetHint: "", body: rest };
  }
  if (cmd === "note") {
    const m = rest.match(/^([a-z0-9-]+):\s*([\s\S]*)$/);
    if (m) return { kind: "note", tagHint: m[1], body: m[2] };
    return { kind: "note", tagHint: null, body: rest };
  }
  return { kind: "unknown", raw: trimmed };
}
