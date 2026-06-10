# Q3 2026 — Operational Plan
### July 1 → September 30, 2026

> Detailed milestone breakdown with sub-deliverables for every business line.
> Format: each milestone has a target date, owner, what "done" looks like, and the specific actions/artifacts required.
> Sorted by date within each business line.

---

## ⚡ JUNE IMMEDIATE ACTIONS (before Q3 starts)

These are past or current-week targets — do not wait for July.

| By | Action | Status |
|---|---|---|
| Jun 10 | AGB-CRM: apply schema to prod Supabase, run all seed scripts | 🔴 Overdue |
| Jun 15 | CaneyAcademy: commit all local curriculum changes + reseed prod | 🔴 Overdue |
| Jun 16 | Karen (@karenexplora) partnership meeting + letter of intent signed | 🟡 This week |
| Jun 20 | Entity structure decision memo written — PBC confirmed, filing prep complete | 🟡 Legal |
| Jun 25 | Delaware PBC filed + EIN obtained (same-day online) | 🟡 Legal |
| Jun 30 | AGB-CRM Lines of Business branch (`feat/lines-of-business`) reviewed + merged | 🟡 This month |
| Jun 30 | Alembic convergence confirmed + Wave B accounting to staging | 🟡 This month |

---

## CRITICAL PATH OVERVIEW

| Date | Milestone | Line | Owner |
|---|---|---|---|
| Jun 16 | Karen (@karenexplora) partnership scoped | VAV / Foundation | Tomas |
| Jul 1 | Clara Vegas pitch deck ready | VAV | Tomas |
| Jul 4 | CaneyCloud 10 beta customers: all onboarded + paying | CaneyCloud PMS | Tomas |
| Jul 5 | VAV public launch | VAV | Jose |
| Jul 10 | Clara Vegas pitch meeting | VAV | Tomas |
| Jul 15 | Círculo de Excelencia intro completed | VAV / CaneyCloud | Tomas |
| Jul 7  | Mercury bank account open (PBC EIN from June 25) | Financial | Tomas |
| Jul 15 | OFAC counsel engaged | CaneyCapital | Tomas |
| Jul 15 | CaneyExperiences spec finalized | CaneyExperiences | Tomas |
| Jul 15 | Wave 5 Restaurant sprint kicked off | CaneyRestaurant | Tomas |
| Jul 31 | ⚡ ALL PAYMENT INFRASTRUCTURE LIVE: Stripe (biz entity) + USDT + Zelle + creator payouts | Financial | Tomas |
| Jul 31 | Fiscal sponsor selected + application submitted | Foundation / Legal | Tomas |
| Jul 31 | VAV: La Cabra Verde video + affiliate live | VAV | Jose |
| Jul 31 | CaneyCloud pricing tiers live in app | CaneyCloud PMS | Tomas |
| Jul 31 | CaneyAcademy: curriculum committed + paid certs live | CaneyAcademy | Tomas |
| Jul 31 | GCP: Cloud SQL + Cloud Build CI/CD live on staging | CaneyCloud PMS | Tomas |
| Aug 15 | 5 founding creator agreements signed | VAV | Jose/Tomas |
| Aug 15 | WA Concierge: prod keys live + E2E tested | CaneyCloud PMS | Tomas |
| Aug 31 | Bookkeeper engaged + first monthly financials produced | Financial | Tomas |
| Aug 31 | GCP migration: beta customers cutover — Supabase deprecated | CaneyCloud PMS | Tomas |
| Aug 31 | CaneyExperiences core build complete | CaneyExperiences | Tomas |
| Aug 31 | CaneyRestaurant Wave 5 complete | CaneyRestaurant | Tomas |
| Aug 31 | Karen episode 1 in production | Foundation / VAV | Karen/Tomas |
| Aug 31 | F&F Pitch Feedback module V1 live | CaneyCapital / AGB | Tomas |
| Sep 15 | Clara Vegas ambassador content begins | VAV | Clara/Jose |
| Sep 15 | 5 pilot restaurants in onboarding | CaneyRestaurant | Tomas |
| Sep 15 | CaneyExperiences: 3 guide beta operators | CaneyExperiences | Tomas |
| Sep 30 | GCP: monitoring + alerting fully automated — launch-ready infra | CaneyCloud PMS | Tomas |
| Sep 30 | **Q3 GATES** | All lines | All |

---

---

# VAV — VAMOS A VENEZUELA

---

## M-VAV-01 · Karen (@karenexplora) Partnership Scoped
**Date:** June 16 · **Owner:** Tomas

**Done when:** signed partnership agreement in place covering all four pillars.

**Deliverables:**
- [ ] Draft partnership scope document covering 4 pillars:
  - (1) VAV accommodation: complimentary posada stays via VAV in exchange for content + booking attribution
  - (2) Foundation Conservation: Foundation co-funds conservation research layer of documentary via grants; Karen credited as conservation program advisor
  - (3) CaneyExperiences: Karen identifies bookable endangered-species observation experiences in each episode location → listed on VAV
  - (4) Content licensing: VAV can use documentary footage and stills for marketing with attribution
- [ ] Identify first 3 posadas for Karen's episode 1 filming locations → list on VAV in advance of shoot
- [ ] Identify first conservation NGO partner to approach for co-grant application
- [ ] Define content deliverables: episodes per quarter, Instagram posts, VAV editorial placement
- [ ] Draft simple letter of intent (not full legal contract yet — speed matters)
- [ ] Schedule follow-up call with Karen to review and sign off

---

## M-VAV-02 · Clara Vegas Pitch Deck Ready
**Date:** July 1 · **Owner:** Tomas

**Done when:** deck is polished, printed (PDF), and rehearsed. Meeting scheduled for July 10.

**Deliverables:**
- [ ] Confirm intro path to Clara Vegas and schedule pitch meeting for week of July 7–11
- [ ] Build pitch deck (10–12 slides) covering:
  - Slide 1: Cover — "Venezuela's moment is now"
  - Slide 2: The opportunity — Venezuela tourism re-rating, diaspora longing
  - Slide 3: What VAV is — the marketplace, what's live today
  - Slide 4: Traction — providers onboarded, launch date, early bookings
  - Slide 5: Miss Universe — the November moment, global reach, Venezuela on stage
  - Slide 6: The ambassador role — what we're asking of Clara specifically
  - Slide 7: What Clara gets — territory rights, commission structure, equity-like upside, mission
  - Slide 8: The activation plan — Jul–Nov content arc, Miss Universe peak, post-event
  - Slide 9: The ecosystem — CaneyCloud, Foundation, the bigger mission
  - Slide 10: The ask — sign by July 31, content starts August
- [ ] Draft ambassador agreement term sheet (not full legal yet):
  - Territory: national (Venezuela) + diaspora communities
  - Commission: founding creator rate (higher than standard)
  - Content obligations: X posts/mo, Miss Universe activation, 1 VAV feature
  - Exclusivity: travel/tourism category only (no competing booking platforms)
  - Duration: 12 months minimum
- [ ] Draft Miss Universe activation plan (1-page):
  - Aug–Sep: "Venezuela is open" content series
  - Oct: countdown content, posada features
  - Nov: live Miss Universe co-content, VAV booking push, "Book the Venezuela Clara loves"
  - Post-event: conversion campaign targeting new followers
- [ ] Set up Clara Vegas in AGB-CRM with project link to VAV ✅ (done June 9)
- [ ] Add F&F pitch feedback invite for Clara once AGB-CRM module is live

---

## M-VAV-03 · VAV Public Launch
**Date:** July 5 · **Owner:** Jose

**Done when:** countdown gate down, site fully public, bookings open, first booking confirmed within 48 hours.

**Deliverables:**

*Pre-launch (before July 5):*
- [ ] Remove countdown gate from codebase
- [ ] All 50 onboarded providers: complete profiles (min. 5 photos, full description, pricing, availability)
- [ ] Booking flow E2E tested: search → select → book → payment → confirmation email
- [ ] Stripe live-mode verified (not test mode)
- [ ] Resend: traveler confirmation email + provider notification email live
- [ ] PostHog + Vercel Analytics wired in `app/layout.tsx` (currently not wired)
- [ ] SEO: meta titles, descriptions, OG images on all destination + provider pages
- [ ] Mobile: full booking flow tested on iOS Safari + Android Chrome
- [ ] Customer support: WhatsApp number live for traveler questions
- [ ] Provider dashboard: each provider can see their bookings + update availability
- [ ] Influencer platform: creator codes active, earnings dashboard live

*Launch day (July 5):*
- [ ] Instagram: announcement post + 10-story series (one per featured destination)
- [ ] WhatsApp broadcast to all 50 onboarded providers: "VAV is live — you're on it"
- [ ] Email to waitlist (if any) announcing launch
- [ ] Anabella Guzmán: personal WhatsApp message asking her to share with her network

*Post-launch (July 6–15):*
- [ ] Daily monitoring: bookings, errors, provider issues — first 10 days
- [ ] First booking: screenshot + share internally as milestone
- [ ] Provider feedback: WhatsApp check-in with first 10 providers after launch week
- [ ] Fix list: capture all bugs/UX issues in first week → prioritize sprint

---

## M-VAV-04 · Clara Vegas Pitch Meeting
**Date:** July 10 · **Owner:** Tomas

**Done when:** meeting has happened, verbal yes or clear next step confirmed.

**Deliverables:**
- [ ] Pitch meeting held (in-person or video)
- [ ] Deck presented, ambassador terms discussed
- [ ] Outcome documented in AGB-CRM (touch logged on Clara Vegas contact)
- [ ] If yes: term sheet sent same day, countersigned by July 20
- [ ] If "interested, need more info": follow-up materials sent within 24 hours, next meeting in 5 days
- [ ] If no: debrief on objections, identify alternative Venezuela ambassador candidate

---

## M-VAV-05 · Círculo de Excelencia Intro Completed
**Date:** July 15 · **Owner:** Tomas (via Anabella)

**Done when:** intro meeting with Círculo network happened, 10+ posadas in active onboarding pipeline.

**Deliverables:**
- [ ] Follow up with Anabella post-VAV launch: confirm intro meeting date
- [ ] Prepare provider pitch for Círculo posadas (2-page PDF):
  - What VAV offers: international + diaspora traveler reach
  - What CaneyCloud offers: PMS, WA concierge, channel manager
  - Pricing: clear, simple, no surprises
  - Onboarding: 30-min demo, live in 48 hours
- [ ] Attend/join Círculo intro meeting
- [ ] Capture every posada contact in AGB-CRM with project link to both VAV + CaneyCloud PMS
- [ ] Immediately after meeting: send each posada owner a WhatsApp with VAV listing link + CaneyCloud trial link
- [ ] Set 5-day follow-up reminder on each new contact
- [ ] Goal: 10 posadas confirmed for onboarding within 5 days of intro

---

## M-VAV-06 · La Cabra Verde Video + Affiliate Link Live
**Date:** July 31 · **Owner:** Jose

**Done when:** video published on @lacabraverdevzla with working VAV affiliate link in bio/caption.

**Deliverables:**
- [ ] Brief La Cabra Verde: talking points, key destinations to mention, what to show
- [ ] VAV affiliate code generated for @lacabraverdevzla in influencer platform
- [ ] Video published (Reel format, min. 60 seconds): "Coming to Venezuela — here's how I booked via VAV"
- [ ] VAV link in bio active + tracked
- [ ] First-week tracking: views, link clicks, VAV signups from her link
- [ ] Log touch in AGB-CRM (La Cabra Verde contact)

---

## M-VAV-07 · 5 Founding Creator Agreements Signed
**Date:** August 15 · **Owner:** Jose + Tomas

**Done when:** 5 creators have signed territory agreements and are posting.

**Deliverables:**
- [ ] Identify 5 founding creator candidates (La Cabra Verde = 1; need 4 more):
  - Niche map: Venezuela travel · Venezuelan diaspora lifestyle · birding/nature · adventure/outdoor · food/gastronomy
  - Minimum: 10K engaged followers, authentic Venezuela connection
- [ ] Creator outreach sequence:
  - DM: 2-line personal message (not a template)
  - Follow-up: deck or 1-pager if interested
  - Call: 30-min walkthrough of program
- [ ] Ambassador program 1-pager finalized:
  - Commission: 8% standard / 12% founding rate
  - Territory model explained simply
  - What we provide: booking platform, co-content, Foundation story
  - What they provide: X posts/mo, authentic use of VAV
- [ ] Founding creator agreements signed (simple DocuSign):
  - Territory defined
  - Commission rate + payment schedule
  - Content minimums
  - 12-month term with renewal option
- [ ] Each creator: affiliate code active, earnings dashboard onboarded, first briefing call done
- [ ] Clara Vegas: if term sheet signed by July 20, she counts as founding creator #1

---

## M-VAV-08 · Q3 Gate
**Date:** September 30 · **Owner:** Jose + Tomas

**Done when:** all metrics hit.

**Deliverables / success criteria:**
- [ ] 150+ registered travelers on platform
- [ ] 50+ confirmed bookings processed
- [ ] $8K+ GMV
- [ ] 5 active creators posting + generating clicks
- [ ] 50+ verified providers live on platform (Stays + early Experiences)
- [ ] Zero P0 bugs open
- [ ] NPS check: 5 traveler + 5 provider feedback calls done
- [ ] Q4 sprint planned and approved

---

---

# CANEYCLOUD PMS

---

## M-PMS-01 · Alembic Convergence + Wave B to Staging
**Date:** June 30 · **Owner:** Tomas (+ JEAV)

**Done when:** single alembic head confirmed, Wave B accounting deployed to staging and smoke-tested.

**Deliverables:**
- [ ] Resolve any remaining alembic head divergence (ORCH-135 confirmed single head at 076)
- [ ] Wave B accounting migrations applied to staging Supabase
- [ ] Staging smoke test: create expense, bind to Libro de Compras, verify SENIAT route
- [ ] JEAV sign-off on Wave B before production deploy
- [ ] Production deploy of Wave B accounting

---

## M-PMS-02 · 10 Beta Customers — Full Acquisition + Onboarding Plan
**Date:** July 4 · **Owner:** Tomas

**Done when:** 10 posada operators are active paying customers — rooms set up, calendar live, at least 1 real booking confirmed, feedback call completed.

### What "beta customer" means
These are founding customers, not free trial users. They pay (at the founding rate), they use the product for real operations, and they give weekly feedback that shapes the product before public launch. In return they get: discounted price locked for life, personal onboarding support from Tomas directly, first access to new features, and a case study credit if they agree.

**Founding customer rate:** $69/mo Professional tier (vs $99 at launch) — locked for life as long as they stay active.

---

### Step 1 — Build the pipeline of 20 candidates (June 9–15)

Need 20 targets to get 10 conversions. Sources, in priority order:

**Tier 1 — Already warm (go here first):**
- [ ] Posada from today's first meeting (June 9) → log in AGB-CRM, send demo video same day
- [ ] Karen Brewer's network: ask Karen on June 16 for 3–5 posada introductions she can personally vouch for — her referral converts at 50%+
- [ ] Livio Leopardi (Delfino Tours, in AGB-CRM) → ask for 2 Los Roques posada introductions
- [ ] Anabella Guzmán → even before the formal July 15 Círculo intro, ask her informally for 3–5 pre-intro names to warm up now

**Tier 2 — VAV-listed posadas (motivated by bookings incoming):**
- [ ] Every posada listed on VAV at launch (July 5) gets a same-day CaneyCloud WhatsApp: "Tu posada está en VAV — cuando lleguen las reservas, ¿cómo las vas a manejar? Te muestro CaneyCloud en 10 min"
- [ ] Target: 10 outreach messages to VAV-listed posadas on July 5 launch day

**Tier 3 — Instagram cold outreach:**
- [ ] Search: `#posadavenezuela` `#posadamerida` `#posadalosgigantes` `#losroque` on Instagram — identify 10 posadas with >500 followers, recent posts, active DMs
- [ ] DM: "Hola [nombre], tu posada en [destino] parece increíble. Estoy construyendo CaneyCloud — una herramienta que te ayuda a manejar tus reservas por WhatsApp sin perder ninguna. ¿Te puedo mostrar en 10 minutos esta semana?"

---

### Step 2 — Outreach sequence (rolling, June 9 – July 4)

For each of the 20 candidates, follow this exact sequence:

- **Day 0:** Personal WhatsApp message (not a template — mention their posada by name)
- **Day 0 (if interested):** Send the 3-min demo video (screen record, WhatsApp-friendly format, in Spanish)
- **Day 1–2:** Follow-up: "¿Qué te pareció? ¿Tienes 15 minutos esta semana para que te lo muestre en vivo?"
- **Day 3:** 15-min demo call: show live product — rooms, calendar, WhatsApp booking flow
- **Demo call outcome:**
  - Yes → Send founding offer + trial link same day; onboarding call within 48 hours
  - Interested but not now → Set a follow-up date; log in AGB-CRM with specific objection
  - No → Ask one question: "¿Qué te haría considerarlo en el futuro?" Log the answer

**Volume target:** 5 outreach messages per day from June 9 = 125 touches before July 4. Even at 20% demo rate = 25 demos → 40% close = 10 customers.

---

### Step 3 — Onboarding each beta customer (within 48 hours of sign-up)

For each of 10 beta customers, Tomas personally runs this:

- [ ] Rooms + rate plan imported (Tomas imports with the operator on a 15-min call)
- [ ] Calendar live: at least 60 days of availability set
- [ ] Stripe: payment method on file, founding rate applied, first charge confirmed
- [ ] First real booking: if no real booking yet, Tomas creates a test booking and walks operator through the accept/modify flow
- [ ] WhatsApp concierge: explain it exists, offer to enable it (even if the operator stays on Starter)
- [ ] Academy enrollment: every beta customer enrolled in CaneyCloud Operator Certification (free for beta cohort)
- [ ] Feedback cadence set: "Voy a llamarte cada semana por 15 minutos durante los primeros 30 días — ¿funciona los [día]?"
- [ ] AGB-CRM: logged with project link, tier, onboarding date, next feedback call date

---

### Step 4 — Weekly feedback calls (July 5 – August 4)

The 4 weeks post-onboarding are the most important. This is where the product gets made.

- [ ] Each beta customer: weekly 15-min WhatsApp call for the first 4 weeks
- [ ] Feedback script (3 questions max):
  1. "¿Usaste CaneyCloud esta semana? ¿Para qué?"
  2. "¿Qué fue lo más difícil o confuso?"
  3. "¿Qué falta que necesitarías para recomendárselo a otro posadero?"
- [ ] Log every answer in AGB-CRM as a touch note
- [ ] Triage feedback weekly: critical bugs → fix immediately; product gaps → add to backlog with priority

---

### Technical prerequisites (must be live before onboarding any beta customer)
- [ ] Pricing tiers finalized: $69 founding / $49 Starter / $99 Professional / $199 Enterprise
- [ ] Stripe live-mode activated on production backend
- [ ] Billing flow tested: subscribe → charged → invoice emailed
- [ ] Trial period (30 days for non-founders): auto-converts or cancels — tested
- [ ] Failed payment: email notification + 3-day grace period

---

## M-PMS-03 · Pricing Tiers Live in App + Stripe
**Date:** July 15 · **Owner:** Tomas

**Done when:** operators can self-select a tier, enter payment, and be live — no manual intervention.

**Deliverables:**
- [ ] Tier selection screen live in onboarding flow
- [ ] Stripe Checkout / Billing Portal integrated (subscription management)
- [ ] Upgrade/downgrade between tiers: tested
- [ ] Trial period (30 days): auto-converts or cancels — tested
- [ ] Failed payment handling: email notification + 3-day grace period
- [ ] Invoice PDF: generated with posada name, tier, period
- [ ] CaneyCloud pricing page live on caneycloud.com (public)

---

## M-PMS-GCP-01 · GCP Infrastructure Setup — Staging Ready
**Date:** July 31 · **Owner:** Tomas

**Context:** CaneyCloud currently runs on Cloud Run (GCP compute) + Supabase (hosted Postgres + Auth) with manual `gcloud` deploys. The goal is a fully GCP-native production stack — Cloud SQL replacing Supabase Postgres, Cloud Build replacing manual deploys, Secret Manager for all credentials — so the product is launch-ready and operationally independent of any third-party database host.

This migration happens in parallel with beta customer onboarding. Beta customers stay on the current stack until the GCP environment is verified and ready.

**Done when:** GCP staging environment is fully operational, Cloud Build CI/CD is running automated deploys, Cloud SQL is live with a copy of the data schema, and the staging environment passes a complete smoke test.

**Deliverables:**

**GCP Project Structure:**
- [ ] Two GCP projects created: `caneycloud-prod` + `caneycloud-staging`
- [ ] Billing alerts configured on both projects (alert at 80% of budget)
- [ ] APIs enabled: Cloud Run, Cloud SQL, Cloud Build, Secret Manager, Cloud Monitoring, Artifact Registry
- [ ] IAM: Tomas (owner), JEAV (editor on staging, viewer on prod until agreed otherwise), service accounts for Cloud Build + Cloud Run

**Cloud SQL (staging):**
- [ ] PostgreSQL 15 instance provisioned on `caneycloud-staging`
- [ ] Instance tier: db-g1-small for staging (cost-efficient)
- [ ] Private IP only: Cloud Run connects via Cloud SQL Auth Proxy (no public IP)
- [ ] Automated backups: daily, 7-day retention
- [ ] Schema applied: run all Alembic migrations clean (single head confirmed) against Cloud SQL staging DB
- [ ] Staging DB smoke test: create operator, add rooms, create booking, verify all FK relationships intact

**Cloud Build CI/CD:**
- [ ] Artifact Registry: Docker image repository created (`us-central1-docker.pkg.dev/caneycloud-staging/backend`)
- [ ] `cloudbuild.yaml` written: build → push image → deploy to staging Cloud Run
- [ ] Trigger: push to `staging` branch → auto-deploy to staging (no approval gate)
- [ ] Trigger: push to `main` → deploy to prod Cloud Run with manual approval gate
- [ ] Build includes: Alembic `upgrade head` as a build step (before new revision serves traffic)
- [ ] Test: push a trivial commit to `staging` → verify Cloud Build runs and staging Cloud Run updates

**Secret Manager:**
- [ ] All environment variables migrated from `.env` files to Secret Manager:
  - `DATABASE_URL` (Cloud SQL connection string)
  - `ANTHROPIC_API_KEY`
  - `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `WHATSAPP_TOKEN`
  - `FRONTEND_BASE_URL`, `SUPABASE_JWT_SECRET` (until Supabase Auth is replaced)
- [ ] Cloud Run service account: granted `secretmanager.secretAccessor` role
- [ ] No secrets in environment variables directly or in git

**Cloud Monitoring (staging):**
- [ ] Uptime check: HTTP ping to staging Cloud Run URL every 60 seconds
- [ ] Alert: if staging is down > 5 minutes → Tomas email notification (test only, not PagerDuty yet)
- [ ] Log-based metric: count of 5xx errors → dashboard tile

---

## M-PMS-GCP-02 · GCP Migration — Beta Customers Cutover
**Date:** August 31 · **Owner:** Tomas (+ JEAV coordination)

**Done when:** all 10 beta customers are running on the GCP Cloud SQL production stack, Supabase Postgres is decommissioned (Auth can stay for now), and production deployments are fully automated via Cloud Build.

**Deliverables:**

**Production GCP setup (first week of August):**
- [ ] Cloud SQL prod instance: `db-n1-standard-1` (upgrade from staging's g1-small — appropriate for real customers)
- [ ] Read replica: not needed yet, but instance class must support it when we do
- [ ] VPC connector: Cloud Run → Cloud SQL via private IP in prod (same as staging)
- [ ] Cloud Build prod trigger: manual approval gate confirmed working

**Data migration plan (write before executing):**
- [ ] Migration runbook written (1-page):
  1. Set app to maintenance mode (return 503 with "Back in 2 hours" message)
  2. `pg_dump` from Supabase Postgres → compressed `.sql.gz` file
  3. Restore to Cloud SQL prod: `psql` or `gcloud sql import`
  4. Run Alembic `upgrade head` on Cloud SQL prod to confirm schema matches
  5. Update Cloud Run environment variables to point to Cloud SQL
  6. Remove maintenance mode
  7. Smoke test: create booking, verify data, check logs
  8. Beta customer notification: WhatsApp to all 10 — "Migración completada — todo está funcionando"
- [ ] Rollback plan: keep Supabase Postgres active and reachable for 14 days post-migration (if something is wrong, can revert Cloud Run env var in < 5 min)

**Beta customer communication:**
- [ ] Notify all 10 beta customers 5 days before maintenance window: WhatsApp message — "Vamos a hacer una mejora de infraestructura el [date] — habrá 2 horas de mantenimiento de 2am a 4am hora Venezuela. Todo estará automaticamente disponible después."
- [ ] Maintenance window: Sunday 2am–4am Venezuela time (lowest traffic)
- [ ] Post-migration: WhatsApp confirmation to all 10 — "Listo — todo funciona. Si ves algo raro avísame"

**Execution:**
- [ ] Maintenance window executed: all steps in runbook completed
- [ ] Smoke test passed: create room, create booking, charge test card, WA concierge test
- [ ] All 10 beta customers: confirm each one can log in and their data is intact (check within 24 hours)
- [ ] Supabase Postgres: read-only for 14 days, then decommission (note: Supabase Auth stays active until replaced)

**Production monitoring (post-migration):**
- [ ] Cloud Monitoring dashboard: request latency, error rate, Cloud SQL CPU/storage, Cloud Run instance count
- [ ] Alert policy: 5xx error rate > 1% in 5 minutes → PagerDuty or WhatsApp alert to Tomas
- [ ] Alert policy: Cloud SQL storage > 80% → email alert
- [ ] Uptime check: prod URL pinged every 60 seconds; alert if down > 2 minutes
- [ ] Weekly infra review: Tomas checks Cloud Monitoring dashboard every Monday

---

## M-PMS-04 · WA Concierge Production-Ready
**Date:** August 15 · **Owner:** Tomas

**Done when:** WA Concierge handles a full guest interaction (inquiry → booking lookup → confirmation) on a live posada without human intervention.

**Deliverables:**
- [ ] GROQ_API_KEY wired to production (voice transcription)
- [ ] DEEPGRAM_API_KEY wired to production (streaming transcription)
- [ ] End-to-end test on live posada: guest sends WhatsApp → concierge responds with availability → guest confirms → booking created in PMS
- [ ] Conversation memory: guest context persists across messages in same session
- [ ] Fallback: if concierge can't handle, routes to posada owner WhatsApp with summary
- [ ] 3 posada operators trained on WA Concierge: know how to enable/disable, review transcripts
- [ ] Error monitoring: Sentry alerts on edge function failures

---

## M-PMS-05 · OTA Channel Manager Integration Started
**Date:** August 31 · **Owner:** Tomas

**Done when:** SiteMinder API connected, at least 1 posada syncing availability to Booking.com.

**Deliverables:**
- [ ] SiteMinder API credentials obtained (or alternative: Cloudbeds, Little Hotelier)
- [ ] Two-way calendar sync implemented: CaneyCloud → OTA + OTA → CaneyCloud
- [ ] Rate push: CaneyCloud rates push to OTAs
- [ ] Booking pull: OTA bookings appear in CaneyCloud calendar automatically
- [ ] Overbooking protection: tested (book same night on both sides — confirm block)
- [ ] 1 pilot posada live on Booking.com via the integration
- [ ] Operator documentation: "How to connect your Booking.com to CaneyCloud" (WhatsApp-friendly — short video + 3-step guide)

---

## M-PMS-06 · Q3 Gate
**Date:** September 30

**Done when:** all metrics hit.
- [ ] 10 beta customers: all onboarded, paying, feedback loop completed (4 weeks)
- [ ] 20+ total paying posadas · $1,500+ MRR
- [ ] <5% monthly churn on beta cohort
- [ ] WA Concierge live on 5+ properties
- [ ] OTA sync live on 1+ property
- [ ] CaneyAcademy: every new posada enrolled in onboarding track
- [ ] Financial Passport: data accrual confirmed on all 20 posadas (daily snapshots running)
- [ ] GCP migration complete: all customers on Cloud SQL, Cloud Build CI/CD running
- [ ] GCP monitoring: dashboards live, alerting active, no manual deploys required
- [ ] Launch readiness: self-serve onboarding can handle a new customer with zero Tomas involvement

---

---

# CANEYEXPERIENCES

---

## M-EXP-01 · Product Spec Finalized
**Date:** July 15 · **Owner:** Tomas

**Done when:** full product requirements doc written, schema designed, VAV integration interface defined.

**Deliverables:**
- [ ] Delta analysis vs CaneyCloud PMS: what's the same, what's different
  - Same: auth, billing, Supabase stack, WA integration patterns
  - Different: experience catalog (not room catalog), availability windows (not nightly), group sizes + guide assignment, itinerary templates, safety waiver flow, per-experience pricing (not ADR)
- [ ] Database schema designed:
  - `experiences` table: name, type (birding/fishing/adventure/cultural/dive), description, duration, max_group_size, price_per_person, location, guide_id
  - `experience_availability`: date, time_slot, spots_total, spots_remaining
  - `experience_bookings`: experience_id, traveler_id, group_size, date, status, payment
  - `guides`: operator_id, name, certifications, languages, bio
- [ ] VAV Experiences inventory feed interface designed:
  - API endpoint CaneyExperiences → VAV: available experiences + slots
  - Booking flow: VAV triggers booking → CaneyExperiences confirms → both systems updated
- [ ] Safety waiver flow designed: digital waiver signed at booking, stored per booking record
- [ ] Pilot operator agreements: 3 bird guide candidates from Avitourism Curriculum identified and contacted
- [ ] Sprint plan: 6-week build broken into 2-week sprints

---

## M-EXP-02 · Core Build Complete
**Date:** August 15 · **Owner:** Tomas

**Done when:** an operator can list an experience, set availability, and receive a test booking via VAV.

**Deliverables:**
- [ ] Experience catalog: operator can create/edit/publish an experience (type, description, photos, pricing, group size, duration)
- [ ] Availability calendar: operator sets available dates + time slots + max group size
- [ ] Booking flow: traveler books via VAV → operator notified via WhatsApp → booking confirmed
- [ ] Guide assignment: operator assigns a guide to a confirmed booking
- [ ] Payment: Stripe Checkout, per-person pricing, group total calculated
- [ ] Digital waiver: traveler signs at booking, PDF stored and emailed
- [ ] Operator dashboard: see upcoming bookings, manage availability, view earnings
- [ ] VAV Experiences feed: live API connection serving experience listings to VAV
- [ ] Mobile-responsive: full flow tested on iOS Safari

---

## M-EXP-03 · VAV Experiences Integration Live
**Date:** August 31 · **Owner:** Tomas + Jose

**Done when:** a traveler can discover and book an experience on VAV, and the booking appears in CaneyExperiences for the operator.

**Deliverables:**
- [ ] VAV Experiences section live (distinct from Stays — own navigation tab)
- [ ] Experience discovery: filter by type (birding, fishing, adventure, cultural), location, group size, date
- [ ] Experience detail page: photos, guide bio, what's included, what to bring, safety info, reviews (empty at launch)
- [ ] End-to-end booking: VAV → CaneyExperiences → operator WA notification → traveler confirmation email
- [ ] First 3 experiences live with real availability (from beta guides)

---

## M-EXP-04 · 3 Beta Guide Operators Live
**Date:** September 15 · **Owner:** Tomas

**Done when:** 3 certified/experienced guides have live experience listings on VAV with real availability.

**Deliverables:**
- [ ] Bird guide 1: listing live (species focus, routes, pricing, availability)
- [ ] Bird guide 2: listing live
- [ ] Fishing operator: Los Roques bonefishing charter listing live (or Delfino Tours / confirm with Livio Leopardi)
- [ ] Each guide: onboarded to CaneyExperiences, can manage their own availability
- [ ] Each guide: enrolled in CaneyAcademy guide certification track
- [ ] Feedback loop: weekly 15-min check-in call with each guide for first 4 weeks

---

## M-EXP-05 · Q3 Gate
**Date:** September 30

- [ ] Product in beta, stable
- [ ] 3 guide operators active
- [ ] 5+ experiences live on VAV
- [ ] First test bookings processed (even if internal/friends-and-family)
- [ ] Feedback from 3 guides documented → Q4 improvements scoped

---

---

# CANEYRESTAURANT

---

## M-RES-01 · Wave 5 Sprint Kicked Off
**Date:** July 15 · **Owner:** Tomas

**Done when:** Wave 5 sprint is running, first stories in progress.

**Deliverables:**
- [ ] Review Wave 5 HLR (`docs/OPS-SUITE-WAVE5-PRODUCTIONIZATION.md`) — confirm scope unchanged
- [ ] Wave 5 Overlord board set up with all stories
- [ ] Sprint 1 stories pulled and in_progress
- [ ] Production infrastructure checklist started:
  - Vercel project created for CaneyRestaurant frontend
  - Cloud Run service created for backend
  - Supabase project created (separate from PMS)
  - Domain decided (restaurant.caneycloud.com or caneyrestaurant.com)
- [ ] Feature flags: all Wave 4 features behind flags, Wave 5 enables them for production

---

## M-RES-02 · Wave 5 Complete — Production Ready
**Date:** August 31 · **Owner:** Tomas

**Done when:** CaneyRestaurant passes production readiness checklist and can onboard a real restaurant.

**Deliverables:**
- [ ] All Wave 5 stories shipped and passing tests
- [ ] Production readiness checklist complete:
  - [ ] Auth: Supabase Auth with Google SSO
  - [ ] Multi-tenancy: each restaurant is isolated (RLS)
  - [ ] Payments: Stripe live-mode (subscription billing)
  - [ ] Error monitoring: Sentry wired
  - [ ] Analytics: Vercel Analytics + PostHog
  - [ ] Email: Resend (reservation confirmations, daily summary to owner)
  - [ ] WhatsApp: reservation notification to owner + confirmation to guest
  - [ ] Performance: <2s page load on VZ connection (tested via VPN)
  - [ ] Mobile: full flow on iOS Safari + Android Chrome
- [ ] QR menu: restaurant can generate a QR code linking to their digital menu
- [ ] Onboarding flow: restaurant owner self-onboards in <30 minutes
- [ ] Demo environment: seeded demo restaurant for sales demos

---

## M-RES-03 · 5 Pilot Restaurants in Onboarding
**Date:** September 15 · **Owner:** Tomas

**Done when:** 5 restaurant owners have started the onboarding flow (free tier).

**Deliverables:**
- [ ] Target restaurants identified: Caracas fine dining / expat-frequented (5 candidates):
  - Criteria: >50 covers, active on social media, owner reachable via WhatsApp
  - Sources: personal network, IG search, Anabella/Círculo network referrals
- [ ] Outreach: personal WhatsApp to each owner (not cold email)
  - Opening line: "Te puedo mostrar en 10 minutos cómo tomar reservas por WhatsApp sin perder ninguna"
- [ ] Demo: 10-min screen share showing QR menu + reservation flow
- [ ] Free tier activated for each restaurant
- [ ] First QR menu printed and placed on tables for at least 1 restaurant

---

## M-RES-04 · Q3 Gate
**Date:** September 30

- [ ] Wave 5 complete and production-deployed
- [ ] 5 restaurants on free tier
- [ ] 0 on paid tier yet (Q4 objective) — but pricing conversation initiated with at least 2
- [ ] Onboarding SOP documented

---

---

# CANEYACADEMY

---

## M-ACA-01 · Uncommitted Curriculum Committed + Reseeded to Prod
**Date:** June 15 · **Owner:** Tomas

**Done when:** all local curriculum changes are committed to main and reseeded to learn.caneycloud.com.

**Deliverables:**
- [ ] Commit all local curriculum changes (B2 expanded 6 modules, A2/A3/A4 vocab unified, Core C0–C2, real graded quizzes)
- [ ] Reseed prod: `npx tsx scripts/seed-curriculum.ts` (or equivalent) run against prod DB
- [ ] Smoke test: complete 1 lesson end-to-end on prod, confirm quiz grading works
- [ ] Verify "Hazlo en tu posada" tasks appear per lesson
- [ ] Verify per-course assignments visible

---

## M-ACA-02 · Paid Certification Checkout Live
**Date:** July 31 · **Owner:** Tomas

**Done when:** a posada operator can enroll in a paid certification, complete it, and receive a digital certificate.

**Deliverables:**
- [ ] Pricing decided and live:
  - CaneyCloud Operator Certification: $49
  - Guide Certification (CaneyExperiences): $79
  - Hospitality Staff Training: $29/staff
- [ ] Stripe Checkout integrated into Academy enrollment flow
- [ ] Digital certificate: generated on completion (PDF with operator name, date, certification type)
- [ ] Email: certificate emailed on completion via Resend
- [ ] CaneyCloud PMS integration: PMS onboarding flow includes Academy enrollment CTA
- [ ] CaneyExperiences integration: guide onboarding includes guide certification CTA

---

## M-ACA-03 · Guide Certification Track Live
**Date:** September 30 · **Owner:** Tomas

**Done when:** a bird guide or fishing operator can complete a guide-specific certification track covering their niche + safety + VAV platform.

**Deliverables:**
- [ ] Guide certification curriculum designed (modules):
  - Module 1: Venezuelan tourism landscape + opportunities
  - Module 2: Guest experience standards (Forbes LQA adapted for guides)
  - Module 3: Safety protocols (first aid basics, emergency procedures, waiver management)
  - Module 4: CaneyExperiences platform (how to manage bookings, availability, payments)
  - Module 5: VAV — how your listing works, how to get more bookings
  - Module 6: Niche module (birding OR fishing OR adventure — operator selects)
- [ ] Content authored for all 6 modules
- [ ] Quizzes: real graded (not polls) for each module
- [ ] Partnership with VZ Avitourism Curriculum: cross-credit / accreditation pathway defined

---

## M-ACA-04 · Q3 Gate
**Date:** September 30

- [ ] All curriculum changes live in prod
- [ ] Paid certs live and purchasable
- [ ] 30+ operators enrolled (majority bundled with PMS onboarding)
- [ ] $300+ cert revenue
- [ ] Guide cert track: content authored, 3 beta guides enrolled

---

---

# CANEYCLOUD CAPITAL (CaneyCapital)

---

## M-CAP-01 · OFAC Counsel Engaged
**Date:** July 15 · **Owner:** Tomas

**Done when:** engagement letter signed with a qualified attorney, initial brief submitted.

**Deliverables:**
- [ ] Identify 2–3 candidate attorneys:
  - Must have: OFAC + Venezuela experience, Florida or DC based
  - Sources: network referrals, LACBA (Latin American Corporate Counsel Association), LinkedIn
  - Candidates to consider: attorneys who've worked on Cuba/Iran OFAC matters (closest analogues)
- [ ] Outreach: email each with 1-page brief describing the structure (PBC + Foundation, posada upgrade fund, Night Certificate instrument, Venezuela operations)
- [ ] Selection: choose based on response speed, relevant experience, fee structure
- [ ] Engagement letter signed
- [ ] Initial brief submitted to counsel:
  - Entity structure: Delaware PBC + fiscal sponsorship → eventual 501(c)(3)
  - Operations: CaneyCloud SaaS to Venezuelan operators (B2B tech, not capital flows)
  - Capital side: Night Certificates (M1), Revenue-share (M2) — describe each
  - Question 1: Is operating CaneyCloud SaaS (billing in USD to VZ operators) OFAC-clean under GL-31?
  - Question 2: What is the correct instrument structure for Night Certificates under current OFAC + securities law?
  - Question 3: What triggers a securities offering — at what point does M2 Revenue-share require registration?

---

## M-CAP-02 · Delaware PBC Entity Structure Decision
**Date:** August 31 · **Owner:** Tomas

**Done when:** entity structure confirmed, formation process started.

**Deliverables:**
- [ ] Receive initial OFAC memo from counsel (or interim guidance)
- [ ] Decision session: PBC solo vs PBC + fiscal sponsorship from day 1
  - If OFAC memo clears SaaS operations → proceed with PBC formation
  - If OFAC memo requires Foundation arm from start → initiate fiscal sponsorship in parallel
- [ ] Delaware PBC formation initiated (registered agent, charter with mission language)
- [ ] Cap table stub: founder shares, option pool size, SAFE terms for Phase-0 raise
- [ ] Bank account: open Mercury or Relay business account for PBC
- [ ] EIN obtained

---

## M-CAP-03 · F&F Pitch Feedback Module V1 Live in AGB-CRM
**Date:** August 31 · **Owner:** Tomas

**Done when:** Tomas can create a pitch campaign, send a private link to a contact, and see their feedback tracked in AGB-CRM.

**Deliverables:**
- [ ] V1A — Tracking substrate:
  - Campaign entity: create, activate, version
  - Invite entity: linked to CRM contact, unique tokenized link
  - Contact panel: pitch status visible on contact detail page
  - Event capture: sent, opened, progress, completed events recorded
- [ ] V1B — Recipient walkthrough:
  - Public review page: no CRM login required
  - Sections: can move through campaign sections in order
  - Feedback prompts: reactions, scores, short text
  - Progress indicator: shows completion %
  - Mobile-first: tested on iOS Safari
- [ ] V1C — CRM review loop:
  - Campaign dashboard: funnel counts (sent/opened/completed)
  - Invite detail: see all responses per contact
  - Follow-up: create action item from feedback
- [ ] V1D — AI insight (basic):
  - Post-completion: AI summary generated (sentiment, key objections, recommended next step)
  - Summary visible on contact page
- [ ] First campaign created: "Caney VAV — F&F Round 1"
  - Sections: Vision, Product (VAV), Product (CaneyCloud), Market Opportunity, The Ask
- [ ] First 10 invites sent: family, close friends, advisors

---

## M-CAP-04 · Q3 Gate
**Date:** September 30

- [ ] OFAC counsel engaged + initial guidance received
- [ ] Entity formation process started
- [ ] F&F Pitch Feedback module live
- [ ] First 20 F&F pitch invites sent + tracked
- [ ] 5+ completed feedback responses with AI summaries
- [ ] Warm investor list: 10 names identified, 3 in active conversation

---

---

# CANEY FOUNDATION

---

## M-FND-01 · Fiscal Sponsorship in Place
**Date:** August 31 · **Owner:** Tomas

**Done when:** signed fiscal sponsorship agreement with an established 501(c)(3), able to receive charitable donations and grant applications.

**Deliverables:**
- [ ] Research fiscal sponsorship options:
  - Preferred: an organization with existing Venezuela/LatAm focus
  - Options: Hispanics in Philanthropy, Americas Society, CESAL, or a general sponsor like Tides Foundation or TSNE
  - Criteria: fast onboarding, reasonable admin fee (typically 7–10% of grants), alignment with education/conservation/technology mission
- [ ] Application submitted to chosen fiscal sponsor
- [ ] Agreement signed
- [ ] Donation intake page live (even if basic): "Support the Caney Foundation"
- [ ] First grant application identified and in progress (education or conservation focus)

---

## M-FND-02 · Conservation Program Defined + First NGO Partner
**Date:** July 31 · **Owner:** Tomas + Karen Brewer

**Done when:** conservation program has a name, a focus species/area, a partner NGO, and a link to Karen's documentary series.

**Deliverables:**
- [ ] Name the conservation program (e.g. "Caney Wildlife Corridors" or "Venezuela Viva")
- [ ] Focus area confirmed: endangered species in Karen's episode 1 location (bird species? marine? mammals?)
- [ ] Partner NGO identified and contacted:
  - Options: Provita (Venezuela biodiversity), Audubon Venezuela, Fundación La Salle, WCS Venezuela
- [ ] Partnership MOU drafted: Foundation funds conservation research, NGO provides scientific credibility + grant co-application
- [ ] Conservation fund launched: % of VAV bird-watching bookings → conservation fund (set at 2–3% of category GMV)
- [ ] Conservation fund page live on Foundation (or VAV) website: "Every birding booking funds habitat protection"

---

## M-FND-03 · Q3 Gate
**Date:** September 30

- [ ] Fiscal sponsorship signed or in final review
- [ ] Conservation program named and publicly announced
- [ ] 1 partner NGO in active conversation
- [ ] First grant application submitted (education or conservation)
- [ ] Karen partnership: episode 1 filming started at VAV posadas
- [ ] Foundation presence: at minimum a page on caneycloud.com or vamosavenezuela.com

---

---

# AGB-CRM (Internal)

---

## M-CRM-01 · AGB-000A Supabase Prod Wiring
**Date:** June 10 · **Owner:** Tomas

**Deliverables:**
- [ ] Apply schema to production Supabase (run migrations)
- [ ] Run seed scripts: `seed-portfolio.mjs`, `seed-real-q2.sql`, `seed-initiatives.sql`, `seed-kpis.sql`, `seed-notes-batch-1.sql`
- [ ] Verify: all 10 projects visible in `/projects`, Q2 objectives visible in `/priorities`
- [ ] Verify: Tomas + Jose (cofounder) both able to log in
- [ ] GROQ_API_KEY + DEEPGRAM_API_KEY: added to Vercel env vars for AGB-CRM
- [ ] Lines of Business branch (`feat/lines-of-business`) reviewed + merged

---

## M-CRM-02 · Q3 Gate
**Date:** September 30

- [ ] AGB-CRM stable in production
- [ ] F&F Pitch Feedback module live (see M-CAP-03)
- [ ] 50+ contacts tracked
- [ ] All Q3 BD conversations logged as touches
- [ ] Weekly briefing running: at least 6 weeks of briefings generated and acted on
- [ ] Clara Vegas + Karen Brewer: all interactions logged with project links

---

---

# LEGAL & FINANCIAL INFRASTRUCTURE

> Payment infrastructure is done by end of July — not Q4. Entity decision in June unlocks banking in early July; all rails live July 31. The research and execution are collapsed into a single compressed track.

---

## M-LEG-01 · Entity Decision + Delaware PBC Filed
**Date:** June 25 · **Owner:** Tomas

**Accelerated to June — PBC EIN is required to open Mercury bank in early July. Everything else in this section depends on this.**

**Done when:** Delaware PBC certificate filed, EIN obtained same day, Florida foreign qualification filed.

**Decisions (June 9–20 — 2 weeks max):**
- [ ] **PBC vs C-Corp:** Talk to 2 founders who've raised on a PBC (LinkedIn/YC alumni). Confirm investor pushback is minimal. Recommendation: PBC — DFI + impact investor conversations require it.
- [ ] **Multi-entity timing:** CaneyCapital stays inside PBC until M1 raise. Add to OFAC counsel brief (M-CAP-01): "At what point must CaneyCapital be a separate entity?"
- [ ] **Venezuelan entity:** No VZ entity in 2026. Confirm with OFAC counsel July 15.
- [ ] **Delaware franchise tax method:** Use **Assumed Par Value Capital Method** at filing — flag this to registered agent. (Authorized Shares Method on 10M shares = $50K+; APVCM = ~$400.)

**Filing (June 20–25):**
- [ ] Registered agent selected: Registered Agents Inc. or Northwest ($50–125/year)
- [ ] Delaware PBC certificate filed: mission language, 10M authorized shares at $0.0001 par, Tomas (CEO) + Jose (CTO/Secretary)
- [ ] EIN obtained: IRS online SS-4 — **same day**
- [ ] Florida foreign qualification: sunbiz.org within 1 week of DE certificate ($138.75/year — required since Tomas operates from FL)
- [ ] Decision memo: `AGB-CRM/docs/legal/entity-structure-decision.md`

---

## M-LEG-02 · Non-Profit Structure + Fiscal Sponsor Application
**Date:** July 31 · **Owner:** Tomas

**Done when:** fiscal sponsor selected and application submitted; 501(c)(3) path confirmed; arm's-length policy written.

- [ ] **Fiscal sponsorship model:** Model C (Pre-Approved Grant) — Foundation is independent, applies for grants under sponsor's 501(c)(3) umbrella. Compare: Tides Foundation (broadest), Hispanics in Philanthropy (LatAm focus), New Venture Fund. Pick based on fastest Model C onboarding + lowest admin fee (target: ≤9%).
- [ ] **501(c)(3) path confirmed:** Form 1023-EZ (4–6 weeks, $275) if projected year 1 revenue < $50K — confirm eligibility with nonprofit attorney. Target filing: Q1 2027.
- [ ] **Independent director identified by July 15:** Ask Karen Brewer on June 16 — conservation expertise + authentic VZ connection + no financial conflict with CaneyCloud PBC. If she can't, find a VZ conservation/NGO contact from the partner NGO search.
- [ ] **Arm's-length policy written** (1 page): all CaneyCloud↔Foundation transactions at FMV; CaneyAcademy access either donated (documented) or billed FMV; Tomas's Foundation time tracked. Saved at `AGB-CRM/docs/legal/nonprofit-structure-decision.md`.
- [ ] **Required governance docs drafted** (needed for 501(c)(3) application — prepare now): bylaws, conflict of interest policy, gift acceptance policy, Tomas time-allocation schedule.
- [ ] **Fiscal sponsor application submitted** by July 31.

---

## M-FIN-01 · All Payment Infrastructure Live
**Date:** July 31 · **Owner:** Tomas

**Done when:** every payment rail is open and tested. No money flows through personal accounts after July 31.**

**Week 1 — July 1–7: Banking foundation (requires PBC EIN from June 25)**
- [ ] **Mercury Bank opened** under CaneyCloud PBC EIN — primary business checking; all Stripe payouts + USDT conversions land here
- [ ] **Chase Business opened** — secondary account for investor wire transfers + large transactions (walk into branch with EIN letter + DE certificate + passport)
- [ ] **Stripe migrated** to CaneyCloud PBC EIN + Mercury bank account. Prepare the Venezuela answer for Stripe's onboarding: *"B2B SaaS for Venezuelan hospitality businesses, billed in USD, operating under OFAC General License 31."*
- [ ] **Test:** trigger $1 charge → confirm payout lands in Mercury within 2 business days

**Week 2 — July 7–14: Venezuela operator billing**
- [ ] **Stripe Venezuela test:** ask beta customer #1 to pay with their Venezuelan-issued Visa/Mastercard. If accepted → Stripe is rail #1 for operators with international-capable cards. If rejected → USDT is primary, Stripe is diaspora-only fallback.
- [ ] **USDT wallet live:**
  - Coinbase Commerce (business) account opened under CaneyCloud PBC
  - USDT wallet address generated and saved
  - Payment instruction page written in Spanish: wallet address, how to include email in memo
  - Reconciliation SOP: Tomas checks wallet daily, matches by memo to customer accounts, marks paid, converts USDT→USD→Mercury weekly
- [ ] **Zelle:** Mercury's Zelle (or business phone number) registered — third option for operators with a US number
- [ ] **Payment methods documented:** "Aceptamos tarjeta USD (Visa/Mastercard), USDT, y Zelle" — added to CaneyCloud onboarding flow and pricing page

**Week 3 — July 14–21: Creator and guide payouts**
- [ ] **Add to OFAC counsel brief (July 15):** "Are USDT payments to Venezuelan residents OFAC-clean under GL-31?" — get written answer before first payout
- [ ] **Ask Karen on June 16:** how does she receive money from her content work? (This is the real-world answer for VZ creators)
- [ ] **Creator payout method confirmed** (based on OFAC answer + Karen's answer):
  - Expected: USDT to creator's exchange wallet address as primary; Zelle secondary for those with US numbers
- [ ] **First test payout:** send $10 USDT to one beta creator — confirm receipt, document the process end-to-end
- [ ] **SDN screening SOP documented:** before any payment to a VZ individual, run name through ofac.treas.gov/SDN; log: name, date, result, payment amount. Stripe handles this for card payments automatically; USDT/Zelle is manual.

**Week 4 — July 21–31: Stripe Connect decision + cleanup**
- [ ] **Stripe Connect confirmed:** Venezuelan operators likely cannot be Connect recipients (VZ not in supported countries). Document the manual payout alternative: operator booking commissions paid via USDT/Zelle on the 15th of each month.
- [ ] **Stripe account structure finalized:** one account for CaneyCloud PBC (PMS + VAV + Academy + Restaurant + Experiences). CaneyCapital investor transactions = wire only.
- [ ] **All 10 beta customers:** payment method confirmed — card on file in Stripe OR at least one USDT payment received
- [ ] **Decision memo saved:** `AGB-CRM/docs/legal/banking-payments-decision.md`

---

## M-FIN-02 · Bookkeeping + CPA Engaged
**Date:** August 31 · **Owner:** Tomas

**Done when:** bookkeeper running on Mercury + Stripe feeds; first monthly financials produced by Sep 15; CPA identified.

- [ ] **Bookkeeper selected:** Bench Accounting ($299/mo to start — accrual basis, monthly P&L + balance sheet). Connect to Mercury bank feed + Stripe. Switch to Pilot when MRR > $10K.
- [ ] **Chart of accounts:** revenue by product line (PMS / VAV / Academy / Restaurant / Experiences), COGS (API costs / Stripe fees / Cloud SQL / WA API), OpEx, R&D
- [ ] **Classification guide written** for bookkeeper: CaneyCloud PBC vs Foundation transactions; what counts as COGS vs OpEx
- [ ] **Foundation books kept separate** — simple spreadsheet (donations / grants / program expenses / fiscal sponsor fees); bookkeeper does not touch Foundation books
- [ ] **CPA identified** for year-end 2026 tax prep (April 2027 deadline):
  - Requirements: startup accounting, international ops (Venezuela-source income), FL-based or remote
  - Sources: OFAC counsel referral, YC alumni network, LACBA
  - Budget: $2,500–5,000/year
  - Introductory call done: briefed on PBC + Foundation + VZ SaaS ops structure
- [ ] **First monthly financials** produced by Sep 15 covering July + August

---

## M-LEG-Q3 · Legal & Financial Q3 Gate
**Date:** September 30

- [ ] Entity structure: decision memo written — PBC confirmed, multi-entity structure decided, VZ entity deferred
- [ ] Non-profit: fiscal sponsor selected + application submitted; 501(c)(3) path confirmed; independent board director identified
- [ ] Foundation governance: conflict of interest policy + arm's-length policy written
- [ ] Banking: Mercury account ready to open on PBC formation; USDT payment rail researched and method decided
- [ ] Payment rails: Stripe Venezuela payment acceptance confirmed; creator payout method decided
- [ ] OFAC counsel: banking compliance question added to brief; SDN screening approach decided
- [ ] Bookkeeper: engaged and running; first monthly financials produced
- [ ] CPA: identified and briefed on structure

---

---

# Q3 SCORECARD (September 30)

| Metric | Target | Source |
|---|---|---|
| VAV registered travelers | 150+ | PostHog |
| VAV confirmed bookings | 50+ | Stripe |
| VAV GMV | $8,000+ | Stripe |
| VAV active creators | 5 | Influencer dashboard |
| CaneyCloud paying posadas | 20+ | Stripe MRR |
| CaneyCloud MRR | $1,500+ | Stripe |
| CaneyExperiences guide operators | 3 (beta) | CaneyExperiences |
| CaneyRestaurant restaurants on free tier | 5+ | CaneyRestaurant |
| CaneyAcademy enrolled operators | 30+ | Academy |
| CaneyAcademy certification revenue | $300+ | Stripe |
| Clara Vegas: agreement signed | Yes/No | AGB-CRM |
| Karen partnership: active | Yes/No | AGB-CRM |
| OFAC counsel: engaged | Yes/No | AGB-CRM |
| F&F pitch invites sent | 20+ | AGB-CRM |
| Foundation: fiscal sponsorship | In progress / Signed | AGB-CRM |
| CaneyCapital: warm investor conversations | 3+ | AGB-CRM |

---

*Q3 2026 Operational Plan — v0.1 — June 9, 2026*
*Next: Q4 2026 Operational Plan (Oct–Dec)*
