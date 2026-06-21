Perfect. Now let me output the final markdown report directly as the response:

---

## SURFACE MAP: CaneyLearn / Caney Academy (PLANNED SYSTEM)

**Status:** PLANNED — Roadmap-derived, no code yet. Subtype: fog-of-war nodes with `contract_status=none`.
**Derivation sources:** `/Users/tomas/vz-avitourism-curriculum/` (14-module curriculum scaffold) + `/Users/tomas/vz-avitourism-curriculum/modules/lms-integration-plan.md` (integration roadmap)
**Platform:** Builds on CaneyEducation (FastAPI + Postgres + Next.js) at `learn.caneycloud.com`

---

## (A) TOP-LEVEL L1 DOMAINS / MODULES

### Domain 1: **Curriculum Content Architecture**
- **One-line:** Organize 14 modules into 4 phases (trails AV-1…AV-4) with programmatic authoring pipeline
- **Function:** Content/Catalog
- **Subdomains:**
  - Phase I — Foundations (M0–M2: Why avitourism, ornithology, taxonomy)
  - Phase II — Species Mastery (M3–M7: Endemics, Pantepui, regional specialties, ID, vocalizations)
  - Phase III — Field & Region Craft (M8–M9, M11: Hotspots, field craft, eBird)
  - Phase IV — Professional Guide (M10, M12–M14: Ethics, business, client handling, capstone certification)
- **Contract source:** `/Users/tomas/vz-avitourism-curriculum/CURRICULUM.md` (340 hours total, eBird/Clements v2025 taxonomy) + `modules/lms-integration-plan.md` (trail/course mapping)

### Domain 2: **Species Reference & Quiz Bank**
- **One-line:** Catalog 92 endemic/Pantepui/specialist Venezuelan birds; feed M3–M7 quizzes and reference materials
- **Function:** Content/Catalog + Ops/Intelligence
- **Subdomains:**
  - Species quick-reference (field marks, IUCN status, voice, confusion pairs, hotspots)
  - Programmatic MCQ generation from species metadata
  - Endemic ID card PDF export (offline study)
  - AI-tutor RAG corpus (pgvector embeddings for "where do I find X species?" queries)
- **Contract source:** `/Users/tomas/vz-avitourism-curriculum/data/endemic-species-catalog.md` (92 species, Clements v2025) + `data/species-corrected.json` (PLANNED: structured JSON with fieldMarks, confusionSpecies, iucn, xeno_canto_id, voice_refs)

### Domain 3: **Regional Hotspots & Logistics Framework**
- **One-line:** 8-region profile (Andes, Perijá, Llanos, Gran Sabana/tepuis, Henri Pittier, Paria, Amazonas, Delta) with logistics, permits, safety, accreditation partners
- **Function:** Ops/Intelligence
- **Subdomains:**
  - Regional profiles (elevation, habitat, signature birds, best season, lodging, access)
  - Hotspot directory (eBird IDs, coordinates, recent sightings)
  - Permit & legal (INPARQUES, seasonal safety, visa requirements)
  - Accreditation partners (Provita, Audubon Venezuela, Red Siskin Initiative)
  - Safety & weather (altitude hazards, insects, tropical disease precautions)
- **Contract source:** `/Users/tomas/vz-avitourism-curriculum/data/regional-hotspots.md` (PLANNED: 8 regions, hotspots, permits, partners, safety notes)

### Domain 4: **Course Authoring & Content Helpers**
- **One-line:** Python-first authoring pipeline (author_avitourism.py) + idempotent seeding to CaneyEducation API
- **Function:** Ops/Intelligence
- **Subdomains:**
  - Course definition DSL (TRAILS, COURSES tuples with chapters, blocks, assessments)
  - Content block helpers (h, p, ul, quote, callout, reto_campo, lesson, quiz, assignment)
  - Quiz pool generation (species JSON → MCQ bank)
  - Bilingual authoring (Spanish-first, optional English expansion)
  - Idempotent seeding (re-runnable for taxonomy updates)
- **Contract source:** PLANNED script at `/Users/tomas/caneyeducation/apps/api/scripts/author_avitourism.py` (mirrors existing `author_content.py` pattern)

### Domain 5: **Assessment & Certification (Blended)**
- **One-line:** Auto-graded per-course quizzes (knowledge gates) + educator-reviewed assignments + external field practical (mentor sign-off) for professional guide certification
- **Function:** Ops/Intelligence + Identity/Access
- **Subdomains:**
  - Knowledge quizzes (MCQ gates, per-module progression)
  - Assignment submissions (eBird checklists, study-recording sets, sample itineraries, trip reports)
  - Capstone portfolio (accumulated artifacts + field exam sign-off)
  - Certificate issuance (partner-accredited; gate = portfolio + field exam pass)
  - Mentor assignment workflow (evaluator assignment + sign-off tracking)
- **Contract source:** `lms-integration-plan.md` § 6 (blended assessment design); CaneyEducation `ActivityAssessment`, `AssessmentSubmission`, `Certificate` models

### Domain 6: **Localization & Bilingual Framework**
- **One-line:** Spanish-first authoring (Venezuelan tú form) with optional English pathways; bird names canonical English + scientific + Spanish common
- **Function:** Content/Catalog
- **Subdomains:**
  - Venezuelan Spanish content (all course prose, assignments, soft skills)
  - English for Guides (client communication track, optional Phase B expansion)
  - Bilingual bird names (English primary in reference materials)
  - Translation/adaptation workload (40–60 hrs, native Spanish speaker preferred)
- **Contract source:** `lms-integration-plan.md` § 7; CaneyEducation engine supports `i18n: ["es", "en"]` at content level

---

## (B) MACHINE-READABLE CONTRACTS TO DERIVE FROM

### **OpenAPI / REST Endpoint Contract**
**Location (planned):** `/Users/tomas/caneyeducation/apps/api/openapi.json` (to be extended)
- **Base URL:** `https://learn.caneycloud.com/api/v1`
- **Auth:** JWT (RS256 keypair shared with CaneyCloud PMS)
- **Planned endpoint count:** ~15–20 across 6 tags:
  - `/species` — reference data (GET `/species`, GET `/species/{id}`, POST `/quizzes/generate`)
  - `/regions` — logistics (GET `/regions`, GET `/regions/{slug}`, GET `/hotspots/{region}`, POST `/permits/lookup`)
  - `/courses` — curriculum (PUT `/courses/{slug}`, GET `/courses/{slug}`)
  - `/assessments` — submissions (POST `/assessments/submit`, GET `/assessments/{user_id}/portfolio`)
  - `/certificates` — blended workflow (POST `/certificates/request`, PUT `/certificates/{id}/mentor-sign-off`, GET `/certificates/{id}`)
  - `/admin/authoring` — script-facing (POST `/trails`, POST `/courses` stubs)

**Example endpoints (planned, not yet implemented):**
- `GET /api/v1/species?region=Gran%20Sabana&endemic=true` (filter species by region + endemic status)
- `GET /api/v1/species/{id}/cards/pdf` (downloadable endemic ID card)
- `POST /api/v1/quizzes/generate` (auto-gen MCQ from species metadata)
- `GET /api/v1/regions/{region_slug}` (full regional profile + accreditation partners)
- `POST /api/v1/permits/lookup` (check INPARQUES status by region + season)
- `POST /api/v1/tutor/index/avitourism` (seed RAG corpus with species + hotspot docs)

---

### **Database Schema / Migrations**
**Location (planned):** `/Users/tomas/caneyeducation/apps/api/alembic/versions/` (Alembic revisions)
- **Base schema:** Reuses CaneyEducation models (`Org`, `Trail`, `Course`, `CourseChapter`, `CourseActivity`, `ActivityAssessment`, `AssessmentSubmission`, `Certificate`)
- **Planned new tables (for avitourism extension):**

| Table | Columns | Key purpose | Rows est. |
|---|---|---|---|
| `species` | id, slug, scientific_name, common_names_es_en, endemic_regions, hotspots, field_marks, iucn_status, xeno_canto_id, confusion_species_ids, confusion_species_json, created_at, updated_at | Canonical bird reference; feeds M3–M7 quizzes and AI-tutor RAG | ~92 |
| `regional_profile` | id, region_name, slug, elevation_m, habitat, signature_birds_json, best_season, lodges_json, permits_json, accreditation_partners_json, safety_notes_json, verified_at, updated_at | Regional operational guide; feeds M8 chapters + M12 business content | ~8 |
| `hotspot` | id, region_id, name, ebird_id, coordinates_lat_lng, recent_sightings_ebird_url, created_at | Hotspot directory (eBird integration); feeds M8, M11 | ~40 (8 regions × 3–5 per region) |
| `mentor_assignment` | id, learner_id, mentor_id, course_id, field_practical_date, sign_off_status, notes, created_at, updated_at | Field practical evaluator assignment; feeds M14 capstone | ~500 (projected learners) |
| `certificate_blended` | id, learner_id, course_id, portfolio_status (pending/approved/rejected), field_exam_status (pending/passed/failed), partner_accredited_by (Provita/Audubon/etc), issued_date, created_at | Blended cert gate tracking; Phase C feature | ~500 (projected) |

**Key constraints:** Foreign keys to CaneyEducation `Course`, `User`, `OrganizationTenant` (multi-tenancy); `species.id` referenced by quiz pool generation; `mentor_assignment.mentor_id` sourced from staff role.

---

## (C) CROSS-SYSTEM INTEGRATION POINTS / EDGES

### **Edge 1: ← CaneyEducation (parent platform)**
- **Type:** Content + authentication dependency
- **Interchange contract:**
  - Courses seeded as POST to `/api/v1/courses` (create trail + course stubs)
  - Content filled via PUT `/api/v1/courses/{slug}` with chapters + activities (chapters from regional hotspots, activities from curriculum modules)
  - Learner identity + progress: read CaneyEducation `User`, `CourseProgress`, `AssessmentSubmission` tables (shared Postgres)
  - Auth: JWT from CaneyCloud PMS issuer (RS256 keypair)
  - Tenant: single CaneyEducation `Org` (or separate "Aviturismo" Org if learner isolation needed)
- **Direction:** Push (content authoring) + pull (learner progress, assessment data)
- **Criticality:** Blocking — all content lives in CaneyEducation; no standalone CaneyLearn backend

### **Edge 2: → CaneyCloud PMS (future: identity + staff qualification)**
- **Type:** Planned future edge (not Phase 0–B1)
- **Interchange contract (TBD):**
  - Idea: posada operators enroll guides in CaneyLearn; PMS staff module tracks "trained guides" with cert status
  - Cert status → staff qualification display in PMS operations (staff/guide view shows "certified" badge + expiry)
  - PMS booking module could require certified guides for premium bookings
- **Direction:** Pull (PMS reads cert status from CaneyLearn)
- **Criticality:** Nice-to-have; deferred to Phase B2+

### **Edge 3: ← eBird (data source, external)**
- **Type:** Read-only API + static data feed
- **Interchange contract:**
  - Hotspot data: GET `ebird.org/ws2.0/ref/hotspot/info?loc=<EBIRD_HOTSPOT_ID>` (public, no auth)
  - Taxonomy: eBird/Clements v2025 annual October release → parse JSON, update `species.scientific_name`, `species.endemic_regions`, re-seed courses (idempotent)
  - Recent sightings: optional daily polling to populate `hotspot.recent_sightings_ebird_url` (UI feature, not required for Phase 0)
- **Direction:** Pull only
- **Frequency:** Manual October taxonomy refresh; optional daily for sightings
- **Criticality:** Reference data; curriculum quality depends on Oct sync

### **Edge 4: ← Xeno-canto, Macaulay Library (media sources, external)**
- **Type:** Read-only, embedded reference links
- **Interchange contract:**
  - Species record: `xeno_canto_id` field → link to `https://xeno-canto.org/species/<species_num>` or specific recording ID for study sets
  - Media quiz questions (Phase B2, platform extension): embed Xeno-canto audio URL or Macaulay photo URL in `ActivityAssessment` question JSON
  - Player renders `<audio src="xeno-canto-url">` or `<img src="macaulay-url">` during quiz
- **Direction:** Pull only (reference links embedded in content)
- **Frequency:** Manual curation (quiz authors cherry-pick recordings)
- **Criticality:** Required for professional-grade ID assessment (Phase B2+)

### **Edge 5: ← pgvector + LlamaIndex (AI-tutor RAG store, internal)**
- **Type:** Embedding + retrieval infrastructure
- **Interchange contract:**
  - Species catalog + regional hotspot docs indexed via LlamaIndex → pgvector embeddings (same Postgres instance)
  - Query example: "¿Dónde encuentro la cotinga dorada y en qué estación?" → embedding search → LLM synthesis from retrieved species + hotspot chunks
  - Tutor context: separate namespace from CaneyCloud PMS tutor (avoids PMS hotel questions polluting bird queries)
- **Direction:** Push (content indexing) + pull (query + synthesis)
- **Frequency:** One-time seeding; optional re-index on major content updates
- **Criticality:** Recommended for B2, not required for Phase 0–B1

### **Edge 6: Vercel / GCP Cloud Run (deploy targets)**
- **Type:** CI/CD infrastructure
- **Interchange contract:**
  - Frontend: `learn.caneycloud.com` (Vercel Next.js, GitHub push to main → auto-deploy)
  - Backend: existing CaneyEducation FastAPI on Cloud Run (southamerica-east1), shared with PMS
  - Database: Supabase Postgres (São Paulo), same as PMS + CaneyEducation
  - Health: GET `/api/v1/health` returns CaneyEducation readiness
- **Direction:** Deploy push (git push to main triggers pipeline)
- **Frequency:** Per commit to main
- **Criticality:** Required for live staging

---

## (D) DEPLOY / LIVENESS SIGNALS

### **Git Discipline**
- **Content repo:** `/Users/tomas/vz-avitourism-curriculum/` (curriculum docs + roadmap, NOT code; read-only for CaneyLearn feature dev)
- **Code repo (destination):** `/Users/tomas/caneyeducation/` (CaneyEducation platform; CaneyLearn tasks live as feature branches)
- **Branch strategy:** `feature/avitourism-phase-<N>` per phase (Phase-0, Phase-A, Phase-B1, Phase-B2, Phase-C)
- **Commits:** Content translated to Spanish → author_avitourism.py + seed scripts written → PR to caneyeducation main
- **Status tracking:** `status.md` (if tracked via cron; otherwise manual per session)

### **CI/CD Signals (CaneyEducation repo)**
- **GitHub Actions:**
  - `.github/workflows/ci.yml` — lint + unit tests (runs on PRs to main)
  - `.github/workflows/deploy-staging.yml` — builds Docker image, pushes to Artifact Registry, deploys to Cloud Run + Vercel (runs on merge to main)
- **No separate CaneyLearn CI** — reuses CaneyEducation infra
- **Smoke test:** POST to `/api/v1/courses` + verify trail + course stubs created in Postgres

### **Production Readiness**
- **Staging URL:** `https://learn.caneycloud.com` (Vercel frontend + CaneyEducation backend)
- **Database:** Supabase Postgres (São Paulo-adjacent), same tenant as PMS
- **Health check:** GET `https://learn.caneycloud.com/api/v1/health` (CaneyEducation endpoint)
- **Monitoring:** Shared with CaneyEducation (no separate stack)
- **Rollback:** Vercel deployment history; revert to previous known-good deploy in ~10s

---

## (E) FUNCTIONAL CLASSIFICATION (6 Functions Served)

| Domain | Booking/Commerce | Content/Catalog | Identity/Access | Messaging/Comms | Payments/Money | Ops/Intelligence |
|---|---|---|---|---|---|---|
| Curriculum Architecture | — | ✓ (14 modules, 4 trails) | — | — | — | ✓ (authoring pipeline) |
| Species Reference | — | ✓ (92 species, quiz bank, ID cards) | — | — | — | ✓ (AI-tutor RAG, quiz generation) |
| Regional Hotspots | — | ✓ (8 regions, logistics profiles) | — | — | — | ✓ (permit lookup, safety versioning) |
| Course Authoring | — | — | — | — | — | ✓ (Python DSL, idempotent seeding) |
| Assessment & Cert | — | — | ✓ (cert issuance, partner accreditation) | — | — | ✓ (blended gate, mentor workflow) |
| Localization | — | ✓ (Spanish-first, bilingual bird names) | — | — | — | ✓ (translation management) |

---

## PLANNED L1 DOMAIN SUMMARY TABLE

| Domain | L1 Node Name | Subtype | Contract Status | Function(s) | Key Files | Endpoints (Planned) | Tables (Planned) | Dependencies |
|---|---|---|---|---|---|---|---|---|
| Curriculum | `avitourism-curriculum` | planned | none | Content/Catalog | CURRICULUM.md, lms-integration-plan.md | PUT `/courses/{slug}`, GET `/courses/{slug}` | `course`, `course_chapter`, `course_activity` (reuse) | CaneyEducation platform |
| Species Ref | `species-reference` | planned | none | Content + Ops | endemic-species-catalog.md, species-corrected.json (PLANNED) | GET `/species`, GET `/species/{id}`, POST `/quizzes/generate`, GET `/species/{id}/cards/pdf` | `species`, `species_confusion_pair` (link table) | eBird taxonomy (Oct sync) |
| Hotspots | `regional-logistics` | planned | none | Ops/Intelligence | regional-hotspots.md (PLANNED) | GET `/regions`, GET `/hotspots/{region}`, POST `/permits/lookup` | `regional_profile`, `hotspot`, `accreditation_partner` | eBird hotspot IDs, INPARQUES permits |
| Authoring | `content-helpers` | planned | none | Ops/Intelligence | author_avitourism.py (PLANNED) | (Python scripts, no REST) | N/A | CaneyEducation API |
| Assessment | `blended-cert` | planned | none | Ops + Identity/Access | lms-integration-plan.md § 6 | POST `/assessments/submit`, GET `/portfolio/{user}`, POST `/certificates/request`, PUT `/certificates/{id}/mentor-sign-off` | `mentor_assignment`, `certificate_blended` | CaneyEducation assessment models |
| i18n | `localization` | planned | none | Content/Catalog | lms-integration-plan.md § 7 | (content-level in author scripts) | N/A | Spanish translation effort (40–60 hrs) |

---

## KNOWN GAPS / FOG OF WAR

1. **Media-quiz platform extension (Phase B2 blocker):** CaneyEducation's `ActivityAssessment` model is text-only MCQ. Real bird-ID assessment needs image- and audio-prompted questions. Scope: 3–4 eng weeks. Without it, ID exams are weak.

2. **AI-tutor RAG context isolation:** Existing CaneyEducation tutor is indexed on PMS docs; avitourism content needs separate context namespace. Requires architecture review; ~2 eng weeks. Recommended but not blocking Phase 0.

3. **Certificate issuance + partner metadata:** Blended capstone workflow + partner accreditation UI (Provita/Audubon sign-off). Scope: 2–3 eng weeks. Deferred to Phase C.

4. **Seasonal verification pipeline:** Safety/permits/regional logistics decay rapidly; no automated refresh. Mitigation: flag content "verify locally," re-check each season manually.

5. **Taxonomy versioning (October):** eBird/Clements updates annually → curriculum must refresh. Mitigation: author_avitourism.py is idempotent; re-run with updated `species-corrected.json` each October.

6. **Spanish authoring workload:** Translating/adapting 14 modules to Venezuelan Spanish is the critical path for Phase 0. Estimate: 40–60 hrs, native Spanish speaker preferred. No code bottleneck, but resource constraint.

---

## CRITICAL PATH & PHASED ROLLOUT (from lms-integration-plan.md)

| Phase | Scope | Platform work | Outcome | Est. time |
|---|---|---|---|---|
| **0 — Spike** | Author 1 sample course (M0) in Spanish; seed to staging CaneyEducation | zero | End-to-end pipeline proven | 1–2 wks |
| **A — Posada-host trail** | 3–4 courses (Recibe Avituristas) for existing posada audience | zero | Live upsell; validates demand | 4–6 wks |
| **B1 — Pro track content** | Author AV-1…AV-4 (14 courses), species quiz pool, regional chapters, all Spanish | zero | Full knowledge curriculum live | 8–12 wks |
| **B2 — Media & ID** | Image/audio quiz questions, species ID cards, AI-tutor RAG | media-quiz extension + RAG seeding | Real ID assessment enabled | 6–8 wks (parallel eng) |
| **C — Certification** | Blended capstone + partner accreditation + certificate issuance UI | cert-issuance feature | Recognized pro qualification issued | 4–6 wks (post-B2) |

**Current status:** Phase 0 spike not yet started. Phase A is zero-platform-change quick win + demand validation.

---

## CONCLUSION

**CaneyLearn is a planned content + platform extension layer on CaneyEducation**, NOT a standalone system. No new deployment, no new database, no new REST contract from scratch — it reuses CaneyEducation infrastructure (Postgres, FastAPI, Next.js, Vercel, Cloud Run). The 14 curriculum modules become 4 trails (AV-1…AV-4) and ~14 courses, seeded programmatically by an author_avitourism.py Python script.

**Key edges:** CaneyEducation (parent platform, required), CaneyCloud PMS (future, planned), eBird (data source, external), Xeno-canto/Macaulay (media refs, external), pgvector (AI-tutor RAG, optional Phase B2).

**Immediate next steps:** Phase 0 spike — draft author_avitourism.py + Spanish translation of M0, seed to staging CaneyEducation instance to prove pipeline, then Phase A posada trail as zero-platform-change quick win.