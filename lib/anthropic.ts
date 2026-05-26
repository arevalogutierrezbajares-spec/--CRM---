/**
 * Thin Anthropic client. Activates with ANTHROPIC_API_KEY. Returns a 503-shaped
 * error result when missing so callers can degrade gracefully.
 *
 * Default model: claude-opus-4-7 (latest as of project knowledge cutoff).
 */

export type ClaudeResult =
  | { ok: true; text: string }
  | { ok: false; error: string; status?: number };

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function claudeChat(opts: {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  const model = opts.model ?? "claude-opus-4-7";

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    return { ok: false, error: body || `HTTP ${resp.status}`, status: resp.status };
  }
  const json = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text =
    json.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ?? "";
  return { ok: true, text };
}
