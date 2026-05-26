/**
 * Tiny Resend wrapper. Returns shaped result for graceful degradation.
 */

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, error: "Resend not configured" };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });
  const body = (await resp.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!resp.ok) {
    return { ok: false, error: body.message ?? `HTTP ${resp.status}` };
  }
  return { ok: true, id: body.id ?? "unknown" };
}
