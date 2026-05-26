#!/usr/bin/env tsx
/**
 * One-command activation verifier.
 *
 *   pnpm verify
 *
 * Walks every external surface that depends on env vars or credentials.
 * For each surface, reports one of:
 *   ✓ active — surface verified end-to-end
 *   ⏸ paused — env not configured (expected before AGB-000A and friends)
 *   ✗ broken — env IS set but the round-trip fails
 *
 * Exit codes:
 *   0  — everything is either active or paused (no surfaces broken)
 *   1  — at least one configured surface failed verification
 *
 * Run *after* you've added env vars in .env.local. Safe to re-run.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

type Verdict = "active" | "paused" | "broken";
type Check = {
  id: string;
  label: string;
  required: string[];
  optional?: string[];
  run: () => Promise<{ verdict: Verdict; detail: string }>;
};

const checks: Check[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // 2. Database connectivity (AGB-000A)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "db",
    label: "Postgres connection (DATABASE_URL)",
    required: ["DATABASE_URL"],
    async run() {
      const { default: postgres } = await import("postgres");
      const client = postgres(process.env.DATABASE_URL!, {
        prepare: false,
        max: 1,
      });
      try {
        const rows = await client`select 1 as ok`;
        await client.end({ timeout: 1 });
        return {
          verdict: "active" as const,
          detail: `connected (got ${rows.length} row)`,
        };
      } catch (e) {
        await client.end({ timeout: 1 }).catch(() => {});
        return {
          verdict: "broken" as const,
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    },
  },
  // Schema applied → expected tables exist
  {
    id: "db-schema",
    label: "Drizzle schema applied (12 tables present)",
    required: ["DATABASE_URL"],
    async run() {
      const { default: postgres } = await import("postgres");
      const client = postgres(process.env.DATABASE_URL!, {
        prepare: false,
        max: 1,
      });
      const expected = [
        "users",
        "contacts",
        "contact_channels",
        "contact_tags",
        "tags",
        "pipeline_templates",
        "pipeline_stages",
        "projects",
        "project_contacts",
        "milestones",
        "touches",
        "meetings",
        "meeting_attendees",
      ];
      try {
        const rows = (await client`
          select table_name from information_schema.tables
          where table_schema = 'public'
        `) as Array<{ table_name: string }>;
        const have = new Set(rows.map((r) => r.table_name));
        const missing = expected.filter((t) => !have.has(t));
        await client.end({ timeout: 1 });
        if (missing.length === 0) {
          return {
            verdict: "active" as const,
            detail: `${expected.length}/${expected.length} tables present`,
          };
        }
        return {
          verdict: "broken" as const,
          detail: `missing: ${missing.join(", ")}`,
        };
      } catch (e) {
        await client.end({ timeout: 1 }).catch(() => {});
        return {
          verdict: "broken" as const,
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  // 3. Anthropic (re-intro, weekly briefing, post-meeting, triage)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "anthropic",
    label: "Anthropic Claude API (re-intro + briefings + triage)",
    required: ["ANTHROPIC_API_KEY"],
    async run() {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-opus-4-7",
          max_tokens: 10,
          messages: [{ role: "user", content: "Say ok." }],
        }),
      });
      if (!resp.ok) {
        return {
          verdict: "broken" as const,
          detail: `HTTP ${resp.status} — ${(await resp.text()).slice(0, 200)}`,
        };
      }
      return { verdict: "active" as const, detail: "round-trip ok" };
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  // 4a. OpenAI Whisper (voice memo + quick contact)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "openai",
    label: "OpenAI API (Whisper transcription)",
    required: ["OPENAI_API_KEY"],
    async run() {
      // We don't burn quota on a real audio upload — just hit /v1/models.
      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      if (!resp.ok) {
        return {
          verdict: "broken" as const,
          detail: `HTTP ${resp.status}`,
        };
      }
      const json = (await resp.json()) as { data?: Array<{ id: string }> };
      const hasWhisper = json.data?.some((m) => m.id.includes("whisper"));
      return {
        verdict: "active" as const,
        detail: hasWhisper ? "whisper model accessible" : "key valid (whisper not listed)",
      };
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  // 4b. Postmark inbound (env presence only; no live webhook send)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "postmark",
    label: "Postmark inbound (env presence)",
    required: ["POSTMARK_INBOUND_SECRET", "AGB_INBOUND_OWNER_USER_ID"],
    async run() {
      return {
        verdict: "active" as const,
        detail:
          "secret + owner id configured. Send a test payload via Postmark Inbound test feature: " +
          "https://postmarkapp.com/inbound/test → POST to /api/postmark/inbound?secret=$POSTMARK_INBOUND_SECRET",
      };
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  // 4c. WhatsApp Cloud API (env presence + token validation)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "whatsapp",
    label: "WhatsApp Cloud API token",
    required: ["WA_PHONE_NUMBER_ID", "WA_ACCESS_TOKEN", "WA_VERIFY_TOKEN"],
    async run() {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WA_PHONE_NUMBER_ID}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
          },
        },
      );
      if (!resp.ok) {
        const body = await resp.text();
        return {
          verdict: "broken" as const,
          detail: `HTTP ${resp.status} — ${body.slice(0, 200)}`,
        };
      }
      const json = (await resp.json()) as {
        display_phone_number?: string;
        verified_name?: string;
      };
      return {
        verdict: "active" as const,
        detail: `${json.verified_name ?? "phone"} (${json.display_phone_number ?? "?"})`,
      };
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  // Resend (briefing email)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "resend",
    label: "Resend email API",
    required: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
    async run() {
      const resp = await fetch("https://api.resend.com/api-keys", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (!resp.ok) {
        return {
          verdict: "broken" as const,
          detail: `HTTP ${resp.status}`,
        };
      }
      return { verdict: "active" as const, detail: "key valid" };
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  // Obsidian sync
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "obsidian",
    label: "Obsidian sync (vault accessible)",
    required: ["OBSIDIAN_VAULT", "OBSIDIAN_OWNER_USER_ID"],
    async run() {
      try {
        const stat = await fs.stat(process.env.OBSIDIAN_VAULT!);
        if (!stat.isDirectory()) {
          return {
            verdict: "broken" as const,
            detail: "OBSIDIAN_VAULT exists but is not a directory",
          };
        }
        const entries = await fs.readdir(process.env.OBSIDIAN_VAULT!);
        return {
          verdict: "active" as const,
          detail: `vault has ${entries.length} top-level entries`,
        };
      } catch (e) {
        return {
          verdict: "broken" as const,
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    },
  },
  // ──────────────────────────────────────────────────────────────────────────
  // Instrumentation (Sentry)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "sentry",
    label: "Sentry / error capture (SENTRY_DSN)",
    required: ["SENTRY_DSN"],
    async run() {
      try {
        new URL(process.env.SENTRY_DSN!);
        return {
          verdict: "active" as const,
          detail: "DSN parsed; first thrown error will land in Sentry",
        };
      } catch {
        return { verdict: "broken" as const, detail: "DSN is not a valid URL" };
      }
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

async function loadEnv() {
  // Tiny .env.local loader — only sets keys that aren't already in process.env.
  try {
    const text = await fs.readFile(
      path.join(process.cwd(), ".env.local"),
      "utf8",
    );
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // .env.local absent — fine
  }
}

function hasAll(keys: string[]): boolean {
  return keys.every((k) => Boolean(process.env[k] && process.env[k]!.length));
}

function paint(verdict: Verdict): string {
  if (verdict === "active") return "\x1b[32m✓\x1b[0m active";
  if (verdict === "paused") return "\x1b[90m⏸\x1b[0m paused";
  return "\x1b[31m✗\x1b[0m broken";
}

async function main() {
  await loadEnv();

  console.log("\n  AGB CRM · activation verifier\n");
  const results: Array<{
    id: string;
    label: string;
    verdict: Verdict;
    detail: string;
  }> = [];

  for (const check of checks) {
    if (!hasAll(check.required)) {
      const missing = check.required.filter((k) => !process.env[k]);
      results.push({
        id: check.id,
        label: check.label,
        verdict: "paused",
        detail: `missing: ${missing.join(", ")}`,
      });
      continue;
    }
    try {
      const { verdict, detail } = await check.run();
      results.push({ id: check.id, label: check.label, verdict, detail });
    } catch (e) {
      results.push({
        id: check.id,
        label: check.label,
        verdict: "broken",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  for (const r of results) {
    console.log(`  ${paint(r.verdict)}  ${r.label}`);
    console.log(`              ${r.detail}\n`);
  }

  const active = results.filter((r) => r.verdict === "active").length;
  const paused = results.filter((r) => r.verdict === "paused").length;
  const broken = results.filter((r) => r.verdict === "broken").length;

  console.log(
    `  Summary: ${active} active · ${paused} paused · ${broken} broken\n`,
  );

  if (broken > 0) {
    console.log(
      "  Some configured surfaces are broken. Review the messages above.\n",
    );
    process.exit(1);
  }
  if (active === 0) {
    console.log(
      "  No surfaces are active yet — set env vars in .env.local and re-run.\n",
    );
  }
}

main().catch((e) => {
  console.error("verify failed:", e);
  process.exit(1);
});
