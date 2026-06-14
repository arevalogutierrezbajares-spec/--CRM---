# AGB-CRM — End-to-End Functionality Review

**Date:** 2026-06-13
**Reviewer:** Claude (code-level audit + competitive/OSS research + Claude/macOS leverage research)
**Goal:** Make AGB-CRM *crisp, dynamic, easy to use, functional* — and 100x the founder using it for management, strategy alignment, and roadmap creation.
**Method:** Full sweep of `app/`, `components/`, `lib/`, `db/schema.ts`; research on best-in-class CRMs / PKM / cockpits + open-source repos; research on Claude (Desktop/CLI/API/MCP) + native macOS leverage. *Not yet validated by a live click-through — see "Recommended next step."*

> **How to use this doc:** Each item has an ID, severity (P0/P1/P2), and effort (S/M/L). Tick the box to confirm you want it; I'll turn confirmed items into `_tasks/` entries and start building.

---

## 0. Verdict

AGB-CRM is **far more built than the README claims** ("Phase 0 scaffold" is stale — ~35 surfaces, **~70–80% fully wired**). It is genuinely a capable chief-of-staff system: multi-channel capture (voice, WhatsApp, email, macOS helper), AI agent, OKRs, pipeline, roadmap, treasury, network graph, a ⌘K command palette, and an MCP server. The bones are excellent.

The gap between "capable" and "crisp + 100x" is **four things**:
1. **Capture is powerful but not *frictionless from anywhere*** — uploads and quick-add are buried inside specific pages (your instinct is correct).
2. **The AI brain is underpowered by default** — it runs on **Haiku 4.5** (cheapest model) even for strategy/briefing/roadmap reasoning.
3. **Surface sprawl** — 27 top-level nav destinations, with ~5 overlapping planning surfaces (work / initiatives / priorities / sprint / roadmap).
4. **The Claude + macOS leverage you already half-built isn't switched on** — the MCP server, on-device transcription, and Shortcuts capture are the literal 100x layer and they're sitting unused.

---

## 1. YOUR IDEAS — validated & sharpened

### ✅ IDEA-1 — Global "upload doc + link to project" button (top bar / home) — **CONFIRMED, build it**
- **P0 · Effort: S** (the hard parts already exist)
- **Finding:** The upload *plumbing is already built* — presigned-URL upload flow (`lib/project-files/upload-client.ts` → `uploadProjectFile`), type allowlist + 50MB cap (`lib/project-files/allowed-types`), category tagging (business/marketing/tech/ops/design/finance), drag-drop tray (`components/lob/upload-tray.tsx`, FR-DOC-20), audit trail. **But it's only reachable from *inside* a project's links board** (`components/lob/links-board.tsx`). To upload, you must first navigate into the right project. That's the friction you felt.
- **The top bar already has an empty `action` slot** (`components/layout/top-bar.tsx:30`) — a button drops in with zero layout work.
- **Fix (flip the flow: upload first, pick project second):**
  - [ ] Add a **`+` Quick-Add / Upload button** to the TopBar `action` slot (and a ⌘K command "Upload file…").
  - [ ] Build a `GlobalUploadModal` that **reuses `uploadProjectFile`** but adds a **project picker** (+ an "Inbox / no project yet" option so capture never blocks on a decision).
  - [ ] Drag-a-file-anywhere → global drop overlay → same modal.
  - [ ] Stretch: same modal can attach to a **contact** or **meeting**, not just a project (see GAP-3).

### ✅ IDEA-2 — Leverage Claude app / CLI / web — **CONFIRMED, huge, half-built already**
You already have an **MCP server** (`app/api/mcp/route.ts` + `oauth/authorize`) and the app is deployed on Vercel (public HTTPS — which is the one hard prerequisite). See **§5** for the full 100x plan. Top move: register the CRM as a **Claude Desktop Custom Connector** and run a **weekly briefing as a Claude Code scheduled Routine**.

### ✅ IDEA-3 — macOS built-in transcription — **CONFIRMED, switch the helper default**
- **P1 · Effort: M**
- **Finding:** Voice currently goes to **OpenAI Whisper API** (cloud, paid per minute) across `app/api/voice/*` and the macOS helper. macOS 26 ("Tahoe") ships **SpeechAnalyzer / SpeechTranscriber** — fully on-device, **free per minute**, **~55% faster** than Whisper Large v3 Turbo, no length cap, private (audio never leaves the Mac — a real selling point for call recordings).
- **Fix:** Make the Swift helper default to **on-device SpeechAnalyzer**; keep Whisper as an opt-in fallback for max accuracy / diarization / pre-Tahoe machines. Reference implementations: `otaviocc/Stenographer`, `FluidInference/swift-scribe` (both menu-bar SwiftUI apps using these exact APIs — close to your helper's shape).

---

## 2. AI BRAIN — biggest quality lever

### AI-1 — Default model is Haiku 4.5; tier it — **P0 · Effort: S**
- **Finding:** `lib/anthropic-budget.ts:50` sets `DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5"`. Supported set tops out at `claude-opus-4-7`. Haiku is the right call for cheap classification (and `lib/inbound-triage.ts` correctly uses it), but it's the **wrong default for chief-of-staff reasoning** — weekly briefings, strategy synthesis, roadmap drafting, "what should I do today." That's where you most want intelligence.
- **Fix — tier by workload:**
  - **Haiku 4.5** → intake routing, tagging, sentiment, dedupe (keep).
  - **Sonnet 4.6** → agent chat + weekly briefing (the default for anything user-facing & reasoning).
  - **Opus 4.8** → deep strategy / roadmap synthesis / multi-step agent runs. *(Also bump `opus-4-7` → `opus-4-8`, the current top model; Fable 5 exists but is overkill/expensive here.)*
  - [ ] Make the model a per-call decision (the helper already accepts a `model` override — just route it).

### AI-2 — Ground answers in your corpus (RAG + citations) — **P1 · Effort: L**
- **Finding:** The agent is fed recent projects/contacts/meetings as context, but there's no semantic search / embeddings layer, so it can't reliably answer "what did I promise Acme in Q1?" across your whole history, and it doesn't cite sources.
- **Fix:** Embed every note/meeting/touch/email → semantic retrieval → ground the agent → **show citations** (link back to the meeting/contact). Provenance is what makes an AI brain trustworthy (Granola's "your notes black, AI gray + transcript citations" is the pattern to copy). OSS reference: `khoj-ai/khoj` (RAG-over-your-own-history second brain).

### AI-3 — "Who went cold" relationship nudges — **P1 · Effort: M**
- **Finding:** You have touches + last-contact data and a network graph, but no proactive *re-connect* engine. The README mentions a "Re-Intro Generator" that **isn't exposed in the UI**.
- **Fix (the Clay pattern, the single highest-leverage BD steal):** rank lapsed contacts by `cadence-breach × relationship-value × recent-trigger`, and present each as a **card with a reason + a pre-drafted opener** ("Ping Bob — he just changed jobs"), not a dismissable notification. A nudge without a *reason now* + a *ready action* trains you to ignore the nudge stream.

### AI-4 — AI-as-field-type (auto-fill contact attributes) — **P2 · Effort: M**
- Attio's best idea: AI is a *field*, not a sidebar. Auto-summarize a contact, auto-classify ICP tier / warmth, auto-pull a talking point — inline on the record, on demand. Cheap with Haiku.

### AI-5 — Auto-generated weekly briefing (don't make yourself ask) — **P1 · Effort: M**
- A `weekly-briefing` cron exists. Make its output a **first-class home/Review surface that's already waiting Monday morning**: what moved the roadmap, who went cold, top 5 follow-ups (with drafts), pipeline deltas, OKR status, what slipped + auto-carried. This is your "strategy alignment" cockpit.

---

## 3. NAVIGATION / IA — reduce sprawl, sharpen search

### IA-1 — 27 top-level destinations; consolidate the 5 planning surfaces — **P1 · Effort: M**
- **Finding:** Nav is grouped (Now / Plan / Explorer) which helps, but **work, initiatives, priorities, sprint, roadmap** are five separate planning surfaces over overlapping data. Linear's lesson: **one dataset, multiple lenses** (list / board / timeline view-switch) beats five sibling pages.
- **Fix:** Collapse planning into fewer surfaces with a view toggle; demote rarely-used Explorer items into a "More" group or the command palette. Goal: every nav peer earns its place by being used *this week*.

### IA-2 — Command palette is the only search, and it's substring-only — **P1 · Effort: M**
- **Finding:** `components/command/command-palette.tsx` does client-side substring matching over ~500 items (projects, docs, people, OKRs). Good spine, but: no fuzzy ranking, no recency weighting, no semantic/entity search, no "search everything" results page.
- **Fix:** Upgrade to fuzzy + recency-ranked + entity-typed results; show keyboard shortcuts next to commands (teaches power-use); make the palette do *everything* (create contact, **upload**, draft intro, jump anywhere). Lift from `cmdk` / `kbar`.

### IA-3 — One global quick-capture box (text or voice, structure later) — **P1 · Effort: M**
- **Finding:** Capture is excellent but channel-specific (voice page, WhatsApp, email-forward, helper). The palette can "Add to-do" / "Post to Town Hall" — extend that into a true **capture-anywhere inbox**.
- **Fix (Tana supertag / inbox-zero pattern):** a single global hotkey → type or speak → it lands in an **Inbox** as raw text; structure (is it a contact? task? note? meeting follow-up?) is inferred by Haiku and confirmed later. **Never force a folder/field/stage choice at capture time** — that's the #1 capture-friction killer.

---

## 4. SPEED & POLISH — "feels alive"

### SPD-1 — Home fires 16 parallel queries on load — **P2 · Effort: M**
- `app/(app)/(home)/page.tsx` runs ~16 `Promise.all` reads (all `safeRead`-wrapped, good). Verify p95 load; consider streaming/Suspense so the cockpit paints progressively instead of waiting on the slowest query.

### SPD-2 — Optimistic UI on the hot paths — **P2 · Effort: M**
- The reason Linear "feels instant" is optimistic writes (render immediately, sync in background). Apply to: completing a to-do, advancing a pipeline card, logging a touch. No spinner on the actions you do 50×/day.

### SPD-3 — Keyboard-first — **P2 · Effort: S**
- Single-key shortcuts for top actions (`c` create, `/` search, `g`-then-letter "go to"), shown in the palette. Mouse optional, never required.

---

## 5. CLAUDE + macOS — the 100x layer (you already half-built it)

Prioritized; the first three are the highest leverage. **Prereqs already satisfied:** the CRM is on public HTTPS (Vercel) and has an MCP server — the two hardest things.

### X-1 — CRM as a Claude Desktop Custom Connector — **P0 · Effort: S–M**
- **What:** Register your MCP server (`app/api/mcp/route.ts`) as a Custom Connector in the **Claude Desktop app**, inside a **"Chief of Staff" Project** with custom instructions ("read-only by default; confirm before writes"). Then from *any* app: double-tap Option → "Who do I owe a follow-up?" / "Log this call note to [contact]" / snip a LinkedIn profile → "add this person." Claude calls your CRM tools.
- **Watch-outs (from research):** Desktop-connector **OAuth is fragile** post-Dec-2025 — prefer a **static bearer token** for now. The MCP connector is **not ZDR-eligible** (data retained per standard policy) — matters if client data is sensitive. Expose granular tools (`search_contacts`, `log_interaction`, `create_task`, `draft_followup`, `get_pipeline`) and **deny-list write tools by default**.

### X-2 — Weekly briefing as a Claude Code scheduled Routine — **P1 · Effort: S**
- **What:** A `/schedule` cloud Routine (runs on Anthropic's infra, machine-off, min 1h interval) hits the CRM MCP connector every Friday/Monday → "who went cold, top 5 follow-ups + drafts, pipeline deltas, roadmap movement, OKR status" → writes a markdown brief to the repo / emails it. Pairs with AI-5.
- **Watch-out:** From **June 15, 2026**, `claude -p` / Agent SDK on subscription plans draws a separate Agent-SDK credit — budget for heavy automation.

### X-3 — On-device transcription default in the helper — **P1 · Effort: M**
- See IDEA-3. Free, private, faster. Whisper becomes the opt-in fallback.

### X-4 — Universal capture via Apple Shortcuts → intake endpoint — **P1 · Effort: M**
- **What:** A "Log to CRM" **share-sheet** shortcut + a **global-hotkey** quick-capture, both POSTing to a simple intake endpoint with a bearer token (`Get Contents of URL` → POST + `Authorization` header). Capture from any app in 2 seconds: share a LinkedIn URL, select text → save as note, NFC-tap at an event → log a lead.
- **Watch-out:** Shortcuts' JSON body only supports a top-level object (not array); keep intake endpoints "one JSON object in, simple JSON out."

### X-5 — Prompt-cache the contact corpus — **P1 · Effort: S**
- Mark CRM schema + contact corpus with `cache_control` → every briefing/chat reads it at **10% input cost** (90% off). Stack with the Batch API for the nightly classification pass → 95%+ savings. This is the single biggest AI cost lever for a tool that re-feeds the same context all day.

### X-6 — Haiku intake-router (extend what exists) — **P2 · Effort: S**
- `lib/inbound-triage.ts` already classifies with Haiku. Extend: every WhatsApp/email intake → classify (lead / follow-up / noise), extract entities, propose CRM mutations into a **review queue** you approve.

### X-7 — Screenshot → contact / Caps-Lock dictate-to-CRM — **P2 · Effort: M**
- Claude Desktop's screenshot gesture + your `create_contact` tool = snip a business card / email signature / LinkedIn header → contact created. Caps-Lock dictation → structured note against the right contact.

---

## 6. GAPS & DEAD ENDS (from the code sweep)

- [ ] **GAP-1 — Equity OS is demo-only** (hardcoded stakeholders/vesting, no DB). Either wire it or label it "preview." *(P2)*
- [ ] **GAP-2 — Presentations deck editor is a partial shell.** *(P2)*
- [ ] **GAP-3 — Files attach to projects (and items/email) but not first-class to contacts or meetings.** Add doc attachment to contact + meeting detail. *(P1)*
- [ ] **GAP-4 — Roadmap import is a form skeleton** (no CSV/Sheets import wired). *(P2)*
- [ ] **GAP-5 — Partner rooms are read-mostly for partners** (limited upload-back). *(P2)*
- [ ] **GAP-6 — Email sync is Outlook/Graph only** (no Gmail). *(P2)*
- [ ] **GAP-7 — Re-Intro Generator exists in lib but isn't surfaced in UI** (see AI-3). *(P1)*

---

## 7. Recommended sequence (if you confirm)

1. **IDEA-1 global upload + ⌘K "upload"** (S, immediate felt win) →
2. **AI-1 model tiering** (S, instantly smarter brain) →
3. **X-1 Claude Desktop connector** + **X-2 weekly-briefing Routine** (the 100x switch-on) →
4. **AI-3 cold-contact nudges** + **AI-5 auto weekly briefing** (BD + strategy leverage) →
5. **IA-2/IA-3 palette + global capture** (crispness) →
6. **X-3 on-device transcription**, **AI-2 RAG/citations** (depth).

## 8. Recommended next step before building

I reviewed at the **code + research** level, not a live click-through. To catch real UX friction (slow pages, dead buttons, confusing flows) I can run a **live dogfooding pass** against the running app (the `qa` / `browse` tooling) and fold findings in. Say the word.

---

*Sources: competitive (Clay/Mesh, Dex, Folk, Attio, Twenty, Tana, Linear, Sunsama, Granola) and OSS (twentyhq/twenty, monicahq/monica, khoj-ai/khoj, cmdk/kbar, react-force-graph, swift-scribe/Stenographer) research, plus Anthropic + Apple primary docs (Custom Connectors, MCP connector, prompt caching, model catalog, Agent SDK; SpeechAnalyzer WWDC25, Shortcuts API). Full citations in the research threads.*
