# Caney — 12-Month Business Roadmap
### June 2026 → June 2027  |  v0.2

> **How to read this:** Bottom-up, business-line first. Each line covers: what it is, current state, GTM, revenue model, and quarterly milestones with specific deliverables.
>
> **Quarters:** Q3 2026 (Jul–Sep) · Q4 2026 (Oct–Dec) · Q1 2027 (Jan–Mar) · Q2 2027 (Apr–Jun)
>
> **The root dependency:** CaneyCloud adoption is the "meter." Real RevPAR/ADR/occupancy data per posada = the Financial Passport that CaneyCapital underwrites against. VAV drives the guests that give operators the reason to get on the meter.

---

## Architecture

```
CANEY ECOSYSTEM
│
├── CaneyCloud  ──────────────  B2B SaaS · operator tools
│   ├── PMS                     posada / stay management
│   ├── CaneyRestaurant         restaurant management
│   ├── CaneyExperiences        tour / activity / guide operator PMS
│   ├── CaneyAcademy            operator education + certification
│   └── CaneyCapital            posada upgrade financing · Night Certs ·
│                               M1–M5 instrument ladder · infra financing ·
│                               supply-chain SPV · DFI / blended finance
│
├── VAV  ─────────────────────  B2C marketplace · traveler-facing
│   ├── Stays                   books into CaneyCloud PMS inventory
│   ├── Experiences             books into CaneyExperiences inventory
│   └── Influencer / Affiliate  built-out influencer marketing platform ·
│                               creator territory system · earnings dashboard
│
└── Caney Foundation  ────────  Non-profit · runs alongside all verticals
    ├── Education               CaneyLearn · FormaVZ · scholarships
    ├── Technology              Starlink · solar · batteries for communities
    └── Conservation            environment · wildlife · biodiversity
```

**What's not in this plan:** RUTA / CaneySafe (separate entity/track).

---

## Wave Sequencing

| Wave | What | Gate | Status |
|---|---|---|---|
| **0** | CaneyCloud PMS + VAV Stays | — (mostly built) | 🟡 July 5 launch |
| **1** | CaneyExperiences + CaneyAcademy + VAV Experiences + Influencer platform + Legal entity | Wave 0 live | 🟡 Parallel starts |
| **2** | CaneyRestaurant + Foundation Technology + Foundation Conservation programs | Legal + grants | ⬜ Q4 2026 |
| **3** | CaneyCapital (Night Certs → Fund) | OFAC + Financial Passport data (6+ mo) | ⬜ Q1 2027 |
| **4** | Scale · CaneyCapital return-tier · multi-country | Platform compounding + funded round | ⬜ Q3 2027+ |

---

---

# CaneyCloud

## CaneyCloud — PMS (Posada Management System)

### What it is
Vertical SaaS for Venezuelan posada operators. Reservations, calendar, accounting (SENIAT-compliant), payments (USDT + card + USD), WhatsApp AI concierge, channel manager (OTA sync). The **meter** — every posada on CaneyCloud produces the Financial Passport that CaneyCapital underwrites against.

### Current state
- 92/155 tasks (~59%) — Accounting Wave B in PM review
- Wave A accounting shipped to prod; alembic single-head at 076
- WhatsApp Concierge: Supabase edge function, production
- First posada onboarding meeting: today (June 9)
- Co-owned with JEAV on `--TOURISM--` repo

### GTM
**Wedge: free trial → paid, with VAV as the pull**
- "Get on VAV and take bookings → you need CaneyCloud to receive them" — the marketplace creates urgency
- Anabella Guzmán → Círculo de Excelencia (premium posada network) = warm pipeline of 20+ quality properties
- Primary sales motion: WhatsApp demo (3 min) → 30-day free trial → paid
- CaneyAcademy as onboarding accelerator: operators who certify convert faster and churn less

**Expansion: depth per property**
- Starter tier (core PMS) → Professional (+ WA Concierge) → Enterprise (+ dynamic pricing + channel manager)
- Each posada's Financial Passport becomes a sales tool for CaneyCapital ("your property qualifies for an upgrade loan")

### Revenue model
| Tier | Price/mo | Includes |
|---|---|---|
| Starter | $49 | Reservations, calendar, basic accounting |
| Professional | $99 | + WA Concierge, SENIAT accounting, payments |
| Enterprise | $199 | + Dynamic pricing, OTA channel manager, CaneyCapital access |
| WA Concierge add-on | $29 | For Starter tier operators |

**MRR targets:** 20 posadas = $1,500 (Q3) → 40 = $3,500 (Q4) → 80 = $8,000 (Q1 2027) → 150 = $16,000 (Q2 2027)

### Milestones

**Q3 2026 (Jul–Sep)**
- [ ] Jul 4: 10 beta posadas onboarded (Q2 gate)
- [ ] Jul 15: Pricing tiers live in app · Stripe live-mode active
- [ ] Jul 31: Wave B accounting shipped to production
- [ ] Aug 15: WA Concierge: Groq + Deepgram keys in production · end-to-end booking tested
- [ ] Aug 31: OTA channel manager (SiteMinder) integration started
- [ ] Sep 30: **20 paying posadas · $1,500 MRR · <5% monthly churn**

**Q4 2026 (Oct–Dec)**
- [ ] Oct 15: SENIAT-compliant accounting fully live (Libro de Compras/Ventas)
- [ ] Oct 31: SiteMinder/channel manager integration live → first OTA sync
- [ ] Nov 30: WA Concierge live on 10+ properties
- [ ] Dec 31: **40 paying posadas · $3,500 MRR · 3 published case studies**

**Q1 2027 (Jan–Mar)**
- [ ] Jan 31: Dynamic pricing module live (target: ~6% RevPAR uplift per property)
- [ ] Feb 28: 60+ days of Financial Passport data on 30+ posadas
- [ ] Mar 31: **80 paying posadas · $8,000 MRR · Financial Passport v1 dashboard live**

**Q2 2027 (Apr–Jun)**
- [ ] Apr 30: Financial Passport data room ready (CaneyCapital underwriting input)
- [ ] May 31: Enterprise tier: CaneyCapital access wired in app
- [ ] Jun 30: **150 paying posadas · $16,000 MRR · avg posada on platform 4+ months**

---

## CaneyCloud — CaneyExperiences

### What it is
PMS tuned for operators of experiences: bird guides, fishing charters, adventure tours, cultural experiences, excursion companies, dive operators. Same architectural DNA as the PMS but built around: availability windows (not room nights), group sizes, multi-guide management, itinerary templates, safety/waiver flows, and per-experience pricing. Inventory feeds directly into **VAV Experiences**.

### Current state
- Not started as a product
- Architecture reusable from CaneyCloud PMS (Supabase, same stack)
- Context: VZ Avitourism Curriculum being built → natural pilot customer base (bird guides)
- Avitourism operators: ~$310/day willingness-to-pay from travelers; guides currently unmanaged

### GTM
**Lead with bird guides and fishing operators (highest yield, most motivated)**
- Avitourism: partner with VZ Avitourism Curriculum graduates → they're trained, certified, and immediately need booking infrastructure
- Fishing: Los Roques multi-operator charter network; Delfino Tours (Livio Leopardi) already in CRM
- Expansion: adventure (Mérida trekking/paragliding), cultural (community tours, cacao harvest), dive (Morrocoy)

**The VAV pull works here too:** "Get your experiences listed on VAV → need CaneyExperiences to manage them"

**Pricing discipline: keep it simple at launch**
- One tier to start; complexity adds friction before there's traction

### Revenue model
| Tier | Price/mo | Includes |
|---|---|---|
| Operator | $49 | Experience catalog, booking calendar, group management, payments |
| Guide Pro | $79 | + Multi-guide scheduling, itinerary templates, safety waivers, VAV priority listing |
| Agency | $149 | + Multi-operator, sub-guide accounts, custom branding, analytics |

**MRR targets:** 0 (Q3) → 15 operators = $900 (Q4) → 40 = $2,500 (Q1 2027) → 80 = $5,500 (Q2 2027)

### Milestones

**Q3 2026 (Jul–Sep) — Build**
- [ ] Jul 15: Product spec finalized (borrowing PMS architecture — 2-week sprint to scope delta)
- [ ] Aug 15: Core build: experience catalog, availability calendar, booking flow, payments
- [ ] Aug 31: VAV Experiences integration wired (inventory feed)
- [ ] Sep 15: Beta with 3 bird guide operators (Avitourism Curriculum pilot cohort)
- [ ] Sep 30: **Product in beta · 3 operators · feedback loop running**

**Q4 2026 (Oct–Dec) — First revenue**
- [ ] Oct 15: Safety waiver + group size management live
- [ ] Oct 31: Los Roques fishing charter operators onboarded (2–3 operators)
- [ ] Nov 30: VAV Experiences: first bookings flowing through CaneyExperiences
- [ ] Dec 31: **15 paying operators · $900 MRR · Guide Pro tier live**

**Q1 2027 (Jan–Mar)**
- [ ] Jan 31: Multi-guide scheduling live
- [ ] Feb 28: Mérida adventure operators in pipeline (trekking, paragliding, rappelling)
- [ ] Mar 31: **40 operators · $2,500 MRR · agency tier launched**

**Q2 2027 (Apr–Jun)**
- [ ] Apr 30: Dive operators (Morrocoy) onboarded
- [ ] May 31: Cultural experience operators (cacao harvest, community tours)
- [ ] Jun 30: **80 operators · $5,500 MRR · avg operator earning $800+/mo via VAV**

---

## CaneyCloud — CaneyAcademy

### What it is
LMS that trains and certifies posada operators, experience guides, and hospitality staff on CaneyCloud products + Venezuelan hospitality standards. Benchmarked against Ritz/St-Regis/Forbes LQA standards for content quality. Live at **learn.caneycloud.com**.

### Current state
- Live — full curriculum delivered (17-agent review, Ritz/Aman/EHL benchmark)
- Real graded quizzes, per-lesson "Hazlo en tu posada" tasks, B2 expanded (6 modules), Core C0–C2 authored
- Changes uncommitted locally (need to push + reseed prod)
- Used as: operator onboarding accelerator → adopt faster, churn less

### GTM
**Operator onboarding:** every new CaneyCloud PMS or CaneyExperiences customer gets an Academy enrollment as part of onboarding
**Standalone certification:** for operators not yet on CaneyCloud — a foot-in-the-door product
**Foundation scholarships:** free access for operators who can't pay (non-profit arm covers cost via grants)

### Revenue model
| Product | Price | Notes |
|---|---|---|
| CaneyCloud operator certification | $49/operator | Bundled at discount with PMS subscription |
| Guide certification (CaneyExperiences) | $79/guide | Includes avitourism + safety modules |
| Hospitality staff training | $29/staff member | Volume pricing for larger properties |
| Foundation scholarship | $0 | Grant-funded through Foundation |

**Revenue target:** small but strategic — $2K–5K/mo by Q2 2027. Primary value is retention/conversion, not direct revenue.

### Milestones

**Q3 2026 (Jul–Sep)**
- [ ] Jun 15: Uncommitted curriculum changes pushed + reseeded to prod
- [ ] Jul 31: Paid certification checkout live in Academy
- [ ] Aug 31: Every new CaneyCloud PMS onboarding includes Academy enrollment
- [ ] Sep 30: 30 certified operators · first cohort of experience guide certifications

**Q4 2026 (Oct–Dec)**
- [ ] Oct 31: Guide certification track live (avitourism + fishing + adventure modules)
- [ ] Dec 31: 80 certified operators · $1,000/mo revenue

**Q1 2027 (Jan–Mar)**
- [ ] Jan 31: Foundation scholarship program live (first 20 sponsored operators)
- [ ] Mar 31: 150 certified operators · $2,500/mo revenue

**Q2 2027 (Apr–Jun)**
- [ ] Jun 30: 250 certified operators/guides · $4,000/mo revenue · partner with Avitourism Curriculum for accreditation pathway

---

## CaneyCloud — CaneyRestaurant

### What it is
Restaurant operations platform: table management, reservations, POS, kitchen display, customer loyalty. "Beli + Resy + Toast for LATAM." Wave 4 of code complete (144 stories, 3,119 tests); needs Wave 5 productionization to ship.

### Current state
- Wave 4: 56 stories merged · suite 3,119 passed / 2 xfailed
- Wave 5 HLR drafted (`docs/OPS-SUITE-WAVE5-PRODUCTIONIZATION.md`) — not started
- Zero live restaurants, zero revenue

### GTM
**Wedge: free QR menu + digital reservations**
- Free QR menu tool → any restaurant in Caracas can be live in 10 min
- Conversion: "Take WhatsApp reservations managed in one dashboard"
- Target first: Caracas fine dining + expat-frequented restaurants (higher price point, more willing to pay, English-comfortable)
- Sales: 1 person in Caracas doing demos in person

**Phase 2: POS + diaspora ordering**
- Once 20+ restaurants on free tier → upsell to full POS + kitchen display
- Diaspora feature: Venezuelans abroad order for family in Caracas (high emotional pull, meaningful GMV)

### Revenue model
| Tier | Price/mo | Includes |
|---|---|---|
| Starter | $29 | QR menu, reservations, basic WA notifications |
| Professional | $59 | + POS, kitchen display, customer loyalty |
| Enterprise | $99 | + Diaspora ordering, analytics, multi-location |
| Diaspora order fee | 10% | Commission on remote family orders |

**MRR targets:** 0 (Q3) → $500 (Q4) → $2,500 (Q1 2027) → $8,000 (Q2 2027)

### Milestones

**Q3 2026 (Jul–Sep) — Wave 5 productionization**
- [ ] Jul 15: Wave 5 sprint kicked off (OPS-SUITE HLR approved, autopilot fired)
- [ ] Aug 31: Wave 5 complete — production-ready build
- [ ] Sep 15: 5 pilot restaurants in Caracas identified and in onboarding
- [ ] Sep 30: First restaurant live in production (free QR menu tier)

**Q4 2026 (Oct–Dec) — First revenue**
- [ ] Oct 31: 10 restaurants live on free tier
- [ ] Nov 30: First 5 restaurants on paid tier
- [ ] Dec 31: **15 restaurants · $500 MRR**

**Q1 2027 (Jan–Mar)**
- [ ] Jan 31: POS beta live with 3 restaurants
- [ ] Feb 28: Diaspora ordering pilot live
- [ ] Mar 31: **30 restaurants · $2,500 MRR**

**Q2 2027 (Apr–Jun)**
- [ ] Apr 30: 50 restaurants · marketing push with VAV (dining recommendations on platform)
- [ ] Jun 30: **75 restaurants · $8,000 MRR · first diaspora order revenue**

---

## CaneyCloud — CaneyCapital

### What it is
The investment and financing platform that converts Venezuela tourism into private-capital returns — and finances posada/infra upgrades for operators who can't self-fund. Two sides: **(1) operator financing** (upgrade loans, anchor kit financing) and **(2) investor instruments** (Night Certificates → Revenue-share → Equity → institutional Fund). The Financial Passport CaneyCloud PMS produces is the underwriting data. **Fully gated on OFAC clearance + 6+ months of real posada data.**

### Capital structure (the ladder)
| Tier | Investor type | Instrument | Illustrative return |
|---|---|---|---|
| 0 | Diaspora / F&F | Night Certificate (M1) · Diaspora Bond | ~10% IRR + free nights |
| 1 | Accredited / family office | Revenue-share (M2) · Equity/JV (M3) | 12.5–17.3% IRR |
| 2 | Institutional / DFI | Fund (8% pref + 20% carry) · Blended first-loss · Infra levy · Supply-Chain SPV | Portfolio returns + measured impact |

### Operator financing products
| Product | What it funds | Structure |
|---|---|---|
| Posada anchor kit loan | Starlink + solar + battery | Repaid via 5–8% of monthly room revenue; 18–30 month payback |
| Posada upgrade loan | Renovation + furniture + equipment | M2 revenue-share or M3 equity stake |
| Infrastructure levy | Road/water/power/cold-chain fix for a cluster | Per-foreign-night levy; ~17× benefit-to-levy |
| Supply-chain pre-finance | Advance to producers (fishers, farmers, crafts) | CaneyX offtake margin repays; ~8% throughput margin |

### Revenue model (platform economics)
| Stream | Rate |
|---|---|
| Origination fee | ~2% of capital deployed |
| Annual management fee | ~1.5% of AUM |
| Carried interest | 20% above 8% preferred return |
| Infrastructure levy | ~$4/foreign night on financed fixes |
| Loan origination fee | 1–2% of loan principal |
| Supply-chain margin | ~8% of offtake throughput |

### Milestones

**Q3 2026 (Jul–Sep) — Legal clock starts**
- [ ] Jul 15: OFAC counsel engaged (FL-based securities + OFAC attorney)
- [ ] Jul 31: F&F Pitch Feedback module live in AGB-CRM → first 20 pitch walkthroughs sent
- [ ] Aug 31: Delaware PBC entity structure decision locked
- [ ] Sep 30: OFAC memo received · 5 warm investor conversations active · fiscal sponsorship for Foundation in place

**Q4 2026 (Oct–Dec) — Data clock starts**
- [ ] Oct 31: Delaware PBC incorporated
- [ ] Nov 15: 10 posadas with 60+ days of Financial Passport data
- [ ] Nov 30: Securities path confirmed (§3(a)(4) + Reg CF feasibility opinion)
- [ ] Dec 31: Cap table + data room drafted · posada anchor kit loan product designed with counsel

**Q1 2027 (Jan–Mar) — Night Certificate soft launch**
- [ ] Jan 15: Night Certificate (M1) offering docs finalized with counsel
- [ ] Jan 31: First anchor kit loans issued to 3–5 posadas (from operator financing product)
- [ ] Feb 28: Data room complete (Financial Passport + OFAC + model + legal)
- [ ] Mar 15: Soft-circle: 3–5 family office / angel conversations active
- [ ] Mar 31: **Night Certificate soft launch with F&F — target $100K raised · 3 posadas financed**

**Q2 2027 (Apr–Jun) — DFI soft circle**
- [ ] Apr 30: IDB/IFC/CAF first introduction meeting
- [ ] May 31: 20+ posadas with 4+ months of Financial Passport data
- [ ] Jun 30: **$250K raised (M1 + first family office) · DFI conversation active · supply-chain SPV structure designed**

---

---

# VAV — Vamos a Venezuela

## What it is
B2C tourism marketplace. Connects international travelers and Venezuelan diaspora to verified Venezuelan operators: posadas, experiences, tours, transport. **Demand engine of the ecosystem.** VAV drives guests → operators adopt CaneyCloud/CaneyExperiences → Financial Passport accumulates → CaneyCapital unlocks.

Three product lines under VAV:
1. **Stays** — books posada inventory from CaneyCloud PMS
2. **Experiences** — books tour/activity inventory from CaneyExperiences
3. **Influencer / Affiliate** — built-out creator platform with territory system, earnings dashboard, and social content engine

### Current state
- v0.8.0.0 — birding section live (92 endemic species, eBird integration)
- Influencer marketing functionality already built (invite system, portal, dashboard, earnings, codes — Wave 6 shipped)
- IG-seeded provider onboarding complete (WS-A→D) — providers being onboarded
- Countdown gate still up — **July 5 launch target**
- Preview env gap: Supabase env not in Preview deploys (prod fine)

---

## VAV — Stays

### GTM
- **Provider-led first:** fill inventory fast with quality posadas from Círculo de Excelencia (Anabella's network)
- **Traveler-led second:** diaspora-first (Venezuelan diaspora in US/Spain/Colombia — highest WTP, strongest emotional pull)
- Content strategy: destination-first (Los Roques, Mérida, Canaima, Los Llanos) before brand-first
- SEO: long-tail Venezuela travel content (birding + fishing + adventure) builds organic over 12 months

### Revenue model
| Stream | Rate | Active from |
|---|---|---|
| Booking commission | 10–15% of confirmed reservation | Q3 2026 (launch) |
| Bespoke Journeys (curated itinerary) | $150–500 flat fee | Q4 2026 |
| Premium listing placement | $50–150/mo per operator | Q1 2027 |

---

## VAV — Experiences

### GTM
- Inventory comes from CaneyExperiences operators (bird guides, fishing, adventure, cultural)
- Avitourism as flagship: certified guides from Avitourism Curriculum → listed on VAV → world-class birding product
- Los Roques fishing: multi-day bonefishing charters, high ATV
- Packages: "Stays + Experiences" bundled booking (higher AOV, lower CAC)

### Revenue model
| Stream | Rate | Active from |
|---|---|---|
| Experience booking commission | 12–18% of experience price | Q4 2026 |
| Bundle commission | 10% flat on Stays + Experiences packages | Q1 2027 |

---

## VAV — Influencer & Affiliate Platform

### What it is
Built-out influencer marketing system: creator invites, territory rights, personal referral codes, earnings dashboard, payout processing. Influencers create content → drive traffic to VAV → earn commission on bookings. Not generic affiliate links — **territory-based creator partnerships** (one lead creator per destination/niche).

### Current state
- Wave 6 fully shipped (invite system, portal, dashboard, earnings, codes)
- Gated until July 5 launch
- La Cabra Verde VZLA (Charles's aunt) — first committed creator, free video + affiliate link
- Influencer pipeline KPI: 5 influencers in pipeline (Q2 CRM objective)

### GTM
**Phase 1: Founding creators (territory model)**
- 5–10 founding creators with territorial exclusivity + higher commission rates (equity-like upside)
- Niches: Venezuela travel, Venezuelan diaspora lifestyle, birding/nature, adventure/outdoor, food/gastronomy
- Criteria: authentic Venezuela connection, existing audience of diaspora or travel-interested followers

**Priority partnerships in play:**

**Clara Vegas — Miss Universe activation**
- Miss Universe is in November 2026 — one of the most-watched global events, massive Venezuela visibility moment
- Pitch target: **early July** (deck must be ready by July 1)
- Positioning: Clara as VAV's Venezuela tourism ambassador; VAV as the official "Visit Venezuela" booking platform for the Miss Universe moment
- Activation plan: ambassador content through Aug/Sep → Miss Universe pre-event content in Oct → live activation in November
- What we offer: founding creator territory (national), equity-like commission upside, mission alignment ("rebuilding Venezuela's story"), VAV platform feature as ambassador
- Expected impact: diaspora reach in US/LatAm/Europe at the exact moment Venezuela is on the global stage

**Karen Brewer (@karenexplora) — Conservation + Experiences**
- Currently producing a documentary series on endangered species across Venezuela, staying in remote communities, documenting culture/tradition/way of life — already had call June 9
- Triple fit: (1) **Foundation Conservation** — documentary subjects become conservation programs; grant co-applications with partner NGOs; (2) **VAV Experiences** — endangered species observation experiences listed on platform, Karen as featured guide/creator; (3) **Foundation Technology** — remote community connectivity as part of the documentary narrative (Starlink + solar impact story)
- Partnership structure: Karen stays at posadas via VAV (authentic content + bookings), Foundation co-funds conservation elements via grants, VAV features her documentary as editorial content driving bookings
- Follow-up from June 9 call: scope full partnership terms by June 16

**Phase 2: Open affiliate program**
- Any influencer/creator can sign up with a referral code
- Standard commission: 5–8% on bookings via their link
- High-performers get upgraded to founding creator status + territory

**Phase 3: Brand partnerships**
- Tourism brands (binoculars/optics for birding, outdoor gear, travel insurance) pay for VAV placement + affiliate collaboration
- Example: Swarovski Optik partners with VAV for avitourism content · Osprey for adventure

### Revenue model
| Stream | Rate | Notes |
|---|---|---|
| Influencer-driven booking commission | 7–12% net to VAV (after 5% creator cut) | Creator earns 5%, VAV earns remainder |
| Brand partnership placement | $500–3,000/campaign | Paid by travel brands |
| Affiliate program standard | 10–12% total (8% VAV, 4% creator) | Open program post-launch |

### Milestones

**Q3 2026 (Jul–Sep) — Creator launch + Miss Universe build-up**
- [ ] Jul 1: Clara Vegas pitch deck ready
- [ ] Jul 5: Influencer platform goes live with public launch
- [ ] Jul 10: Clara Vegas pitch meeting — VAV ambassador + Miss Universe activation
- [ ] Jul 15: Círculo de Excelencia intro → 10+ posadas in pipeline, listed on VAV Stays
- [ ] Jul 16: Karen (@karenexplora) partnership terms scoped + agreement signed
- [ ] Jul 31: La Cabra Verde VZLA first video published + affiliate link live
- [ ] Aug 15: 5 founding creator agreements signed (territory + commission terms)
- [ ] Aug 31: Karen's first documentary episode features VAV posadas + Foundation conservation story
- [ ] Aug 31: Avitourism Curriculum graduates — 3 certified guides listed on VAV Experiences
- [ ] Sep 15: Clara Vegas ambassador content begins (pre-Miss Universe build-up)
- [ ] Sep 30: **150 registered travelers · 50 bookings · $8K GMV · 5 active creators**

**Q4 2026 (Oct–Dec) — Miss Universe moment + Experiences live**
- [ ] Oct 1: VAV Experiences live with CaneyExperiences inventory feed
- [ ] Oct 15: First Bespoke Journey sold
- [ ] Oct 31: Karen documentary — second episode live; Foundation conservation fund launches
- [ ] Nov 1–30: **Miss Universe activation** — Clara Vegas content drives peak VAV traffic; "Visit Venezuela" editorial live on VAV; diaspora audience conversion push
- [ ] Nov 15: Anabella's conference — VAV presented to high-profile tourism audience
- [ ] Nov 30: Livestream cameras live in 3 locations
- [ ] Dec 31: **500 registered travelers · 200 bookings/mo · $30K GMV/mo · 8 active creators**

**Q1 2027 (Jan–Mar) — Post-Miss Universe momentum + premium niches**
- [ ] Jan 15: Post-Miss Universe retargeting campaign — convert awareness to bookings
- [ ] Jan 31: Los Roques fishing packages live (full Stays + Experiences bundle)
- [ ] Feb 15: Open affiliate program launched
- [ ] Feb 28: First brand partnership (outdoor/birding gear brand) · Karen grant co-application submitted with conservation NGO partner
- [ ] Mar 31: **1,000 travelers · 400 bookings/mo · $55K GMV/mo · 15 active creators**

**Q2 2027 (Apr–Jun) — Scale**
- [ ] Apr 30: SEO traffic = 30%+ of new traveler acquisition
- [ ] May 31: 5 founding creators generating consistent booking revenue · Karen documentary series full season complete
- [ ] Jun 30: **2,500 travelers · 700 bookings/mo · $85K GMV/mo · 25 active creators · $8K brand partnership revenue**

---

---

# Caney Foundation

## What it is
Non-profit arm that runs **alongside** all Caney verticals. Not a CSR add-on — it is the **capital-intake infrastructure** (grants + DFI first-loss capital), the **community impact story** that unlocks CaneyCapital blended finance, and the **mission** that differentiates the whole ecosystem from extractive tourism platforms.

Three programs: Education · Technology · Conservation.

### Why it matters to the business
- **CaneyCapital:** DFI first-loss tranches (IDB/IFC/CAF) require measured community impact. The Foundation produces those measurements.
- **CaneyAcademy:** Foundation provides free scholarships for operators who can't pay → increases adoption → more Financial Passport data.
- **CaneyConnectivity:** Foundation funds the community internet hubs (free village internet, non-profit); the for-profit anchor kit (posada Starlink/solar) pays for itself. Same infrastructure, dual benefit.
- **Brand moat:** "Every booking powers a community" is the story that makes VAV sticky and CaneyCapital defensible to a DFI.

### Entity structure
- **Phase 1 (Q3 2026):** Fiscal sponsorship under an existing 501(c)(3) — operational in weeks, not months. Enables grant applications + charitable donations immediately.
- **Phase 2 (Q1 2027):** Stand up own 501(c)(3) once grant income justifies the overhead.
- **For-profit ↔ Foundation rule:** strictly arm's-length FMV. Private-benefit doctrine — no sloppiness.

---

## Foundation — Education

### Programs
- **CaneyLearn:** free version of CaneyAcademy content for operators who can't afford the paid tier. Grant-funded.
- **FormaVZ:** Spanish-first LMS for Venezuelan learners (general hospitality, English, digital skills). Free access, foundation-operated.
- **Guide scholarships:** fund avitourism + fishing guide certification for community members (feeds CaneyExperiences operator pipeline).

### Funding sources
- Tourism & hospitality foundation grants (Conrad N. Hilton Foundation, Skoll, etc.)
- DFI education grants (IDB Lab, CAF)
- VAV "1% for community" pledge — 1% of every booking revenue goes to Foundation Education fund

### Milestones
**Q3 2026:** FormaVZ curriculum cleaned up + live · fiscal sponsorship in place · first grant application submitted
**Q4 2026:** First 20 foundation scholarships issued (Academy) · CaneyLearn launched
**Q1 2027:** $50K in grants received · 50 scholarship recipients
**Q2 2027:** 100 scholarship recipients · guide certification program fully grant-funded

---

## Foundation — Technology

### Programs
- **Community connectivity hubs:** Starlink + solar + battery installed free for communities around posada clusters. Paid by Foundation (grants); posada anchor kits are separate for-profit product.
- **Posada solar/battery kit financing:** Foundation subsidizes 20–30% of anchor kit cost for operators in underserved communities → makes the for-profit loan more accessible.
- **Digital literacy:** training on Starlink, basic device use, digital payments — delivered via CaneyLearn.

### Why it's non-profit
Community internet is a charitable purpose (free access, no commercial return). The posada kit is commercial (revenue from room nights pays back the loan). The Foundation funds the former; CaneyCapital finances the latter.

### Milestones
**Q3 2026:** Technology program designed · first grant application submitted (connectivity focus)
**Q4 2026:** Fiscal sponsorship active for technology grants
**Q1 2027:** First pilot community hub installed (1 cluster — Mérida or Los Roques surroundings)
**Q2 2027:** 3 community hubs live · $75K in technology grants received

---

## Foundation — Conservation

### Programs
- **Avitourism conservation fund:** % of bird-watching booking revenue (via VAV) directed to habitat protection and species monitoring programs.
- **Wildlife corridor grants:** partner with Venezuelan conservation NGOs (Provita, Audubon Venezuela) for grant co-applications.
- **Posada eco-certification:** Foundation certifies posadas meeting sustainability standards → listed on VAV as "eco-certified" (marketing benefit for operator + conservation outcome for Foundation).
- **Canaima/Pemón stewardship:** community co-ownership framework for any operations in indigenous territories (FPIC + co-ownership → required for any Canaima-area products on VAV).
- **Karen Brewer (@karenexplora) documentary partnership:** Karen is producing a documentary series on endangered species across Venezuela, staying in remote communities and documenting culture/tradition/way of life. Foundation co-funds the conservation research layer of the series via grants; VAV provides posada accommodation (authentic content); CaneyExperiences lists endangered-species observation experiences Karen identifies in each episode. Each episode = a conservation program + a bookable experience + an authentic travel content piece.

### Milestones
**Q3 2026:** Conservation program defined · Karen partnership agreement signed (Jun 16) · first partner NGO identified · Karen's first documentary episode in production featuring VAV posadas
**Q4 2026:** Avitourism conservation fund launched (% of VAV bird-watching bookings) · Karen episode 2 live · Foundation conservation fund publicly announced
**Q1 2027:** First eco-certification issued to posada · Karen grant co-application submitted with NGO partner · endangered-species experiences listed on VAV via CaneyExperiences
**Q2 2027:** 5 eco-certified posadas on VAV · full Karen documentary season complete · Canaima FPIC framework drafted · first conservation grant received

---

---

# Revenue Consolidation

## Quarterly revenue by line

| Business Line | Q3 2026 | Q4 2026 | Q1 2027 | Q2 2027 |
|---|---|---|---|---|
| CaneyCloud PMS (MRR) | $1,500 | $3,500 | $8,000 | $16,000 |
| CaneyExperiences (MRR) | $0 | $900 | $2,500 | $5,500 |
| CaneyRestaurant (MRR) | $0 | $500 | $2,500 | $8,000 |
| CaneyAcademy (certs) | $300 | $1,000 | $2,500 | $4,000 |
| CaneyCapital (fees) | $0 | $0 | $2,000 | $5,000 |
| VAV GMV × ~11% net | $880 | $3,300 | $6,050 | $9,350 |
| VAV brand partnerships | $0 | $0 | $1,000 | $3,000 |
| **Total (recurring + GMV net)** | **~$2,680** | **~$9,200** | **~$24,550** | **~$50,850** |

> Note: Figures are net revenue (not GMV). CaneyCapital fees begin Q1 2027 from loan origination + first M1 raise management. VAV net = GMV × blended 11% after creator payouts.

## Cumulative ARR trajectory
- End Q3 2026: ~$8K ARR (MRR × 12 equivalent)
- End Q4 2026: ~$55K ARR
- End Q1 2027: ~$147K ARR
- End Q2 2027: ~$305K ARR

---

# Critical Path

The 6 gates that block everything else:

| # | Gate | Blocks | Owner | Target |
|---|---|---|---|---|
| 1 | VAV July 5 public launch | GMV, creator platform, VAV → CaneyCloud funnel | Jose | Jul 5 |
| 2 | CaneyCloud 10 paying posadas | Financial Passport clock, MRR, CaneyCapital gating | Tomas | Jul 4 |
| 3 | OFAC counsel engaged | CaneyCapital legality, Night Certificates, DFI conversations | Tomas | Jul 15 |
| 4 | Anabella → Círculo de Excelencia intro | Quality inventory pipeline for VAV + CaneyCloud | Tomas | Jul 15 |
| 5 | CaneyExperiences v1 spec finalized | Avitourism guide onboarding, VAV Experiences inventory | Tomas | Jul 15 |
| 6 | Fiscal sponsorship in place | Foundation grant applications, CaneyAcademy scholarships | Tomas | Aug 31 |

---

# Open Decisions

| # | Decision | Options | Blocks |
|---|---|---|---|
| D-1 | CaneyCloud pricing: exact tier prices | $49/$99/$199 proposed above — confirm or adjust | Operator deck, conversion |
| D-2 | CaneyRestaurant vs CaneyExperiences: which ships first? | Both in Q3 but CaneyExperiences has clear inventory demand from Avitourism program | Q3 sprint allocation |
| D-3 | Foundation entity: fiscal sponsor partner | Which 501(c)(3) to approach for sponsorship? | Grant timeline |
| D-4 | CaneyCapital: posada loan product design | Revenue-share repayment vs fixed monthly? | Q4 product design |
| D-5 | VAV territory model: how many founding creators? | 5 at launch vs 10? | Creator acquisition budget |
| D-6 | CaneyCapital brand name | CaneyCapital vs CaneyComunidad? | Investor comms |

---

*Version 0.2 — June 9, 2026. Built from: AGB-CRM seed data, 36-month-roadmap.json, Caney build roadmap (docs 20–21), Employ Venezuela business plan + research (docs 00–10), project memory. Figures illustrative; not an offering; obtain OFAC + securities counsel before any solicitation.*
