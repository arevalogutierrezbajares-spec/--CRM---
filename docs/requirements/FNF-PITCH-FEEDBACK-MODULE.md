# AGB CRM - F&F Pitch Feedback Module Requirements

**Version:** v1.0, 2026-06-07  
**Status:** GigaRico requirements contract for new AGB CRM module  
**Scope:** Contact-linked private pitch walkthroughs, embedded feedback capture, engagement tracking, AI feedback analysis, and CRM follow-up workflow  
**Source:** Founder request, 2026-06-07: "incorporate F&F feedback functionality in AGB CRM; link to contacts; track who received the link, who viewed it, all from contacts; leverage AI as much as possible."  
**Requirement count:** 58 FRs, 22 NFRs, 12 launch gates.  
**ID prefix:** `FR-FNF-`, `NFR-FNF-`, `LG-FNF-`, `TASK-AGB-FNF-`.

> Reader contract: this document defines what the module must do. It is intentionally contact-centric. The public pitch link is only the capture surface; AGB CRM remains the source of truth for sends, views, responses, AI insight, and relationship follow-up.

---

## 1. Product Boundary

| Layer | Owner | Requirement |
|---|---|---|
| Contact source of truth | AGB CRM Contacts | Every invite, view, response, insight, and follow-up must resolve back to a workspace-scoped contact when the invite is contact-specific. |
| Pitch campaign authority | Pitch Feedback module | Owns pitch campaign content, section order, prompt definitions, feedback rounds, and campaign-level analytics. |
| Public recipient surface | Pitch Feedback public review route | Presents a private silent walkthrough and captures recipient feedback without exposing CRM internals. |
| Relationship history | Contact timeline and touches | Receives milestone rollups only; granular section events remain in module analytics. |
| AI insight authority | AGB CRM Active Brain / AI layer | Generates personalization, summaries, classifications, pitch edit suggestions, and follow-up drafts under workspace AI policy. |
| Delivery channels | Existing CRM channels | Email, WhatsApp, Signal, copy-link, or manual send can deliver invites; send status remains recorded in Pitch Feedback and Contact surfaces. |
| Out of scope for V1 | This module | Does not become a generic slide builder, investor data room, webinar platform, public survey product, or autonomous outreach system. |

---

## 2. Actors

| Actor | Definition | V1 Access Principle |
|---|---|---|
| Founder | Tomas or workspace user operating the CRM | Can create campaigns, create invites, send/copy links, review responses, read AI insights, and follow up. |
| Recipient | External F&F/advisor/contact opening a private link | Can view only the approved pitch experience for their invite and submit feedback without CRM login. |
| Contact | A CRM contact record tied to a recipient | Receives rollups, status, AI summary, and follow-up history. |
| Active Brain | AI assistant inside AGB CRM | Can personalize, summarize, classify, cluster, and draft follow-up only when policy allows. |
| Workspace Admin | Workspace user with elevated access | Can configure campaigns, revoke links, export feedback, and review tracking/audit records. |
| System Worker | Background/system process | Records events, computes rollups, queues AI jobs, and maintains aggregate campaign metrics. |

---

## 3. Strong V1 Scope

| Area | Included in V1 | Deferred |
|---|---|---|
| Contact-specific invite | One unique tokenized link per contact per campaign | Anonymous public campaigns not tied to contacts |
| Campaign content | Structured campaign sections with prompts and status | Full drag-and-drop slide builder |
| Recipient review | Silent dynamic presentation with embedded feedback | Voice narration, live chat, or synchronous review rooms |
| Tracking | Sent/opened/progress/completion/response event capture | Heatmap replay, eye tracking, or invasive behavioral analytics |
| CRM rollup | Contact-side panel, invite detail, campaign dashboard | Full partner portal integration |
| AI | Pre-send personalization, post-completion summary, support classification, objection clustering, follow-up drafts | Autonomous sending or automatic pitch rewriting |
| Delivery | Copy-link first; email/WhatsApp send through existing CRM channels when available | Bulk mail merge as initial dependency |
| Privacy | Token hashing, expiry/revocation, minimal public payload, transparent tracking | Account-based recipient authentication |

---

## 4. UX/UI and Dynamic Behavior Contract

The module should feel like a private founder feedback room, not a generic survey. A recipient should move through a polished silent walkthrough, react in context, and finish in under 5-8 minutes. A Founder should manage the whole loop from the contact record.

| Surface | Required UX | Dynamic Behavior |
|---|---|---|
| Contact detail panel | Compact `Pitch Feedback` panel near existing relationship surfaces. Shows latest invite, status, completion, sentiment, top objection, and next action. | Updates after invite creation, link open, response submission, AI summary, revoke, and follow-up. |
| Send invite dialog | Founder selects campaign, channel, expiry, optional personal note, and AI personalization. | Preview updates when contact/campaign/personalization changes; copy/send state is explicit. |
| Public review page | Full-screen, mobile-first, no CRM chrome, no account creation, no voice requirement. | Smooth section transitions, progress indicator, next/back navigation, autosaved feedback, completion state. |
| Feedback prompts | Lightweight reactions, scores, flags, and short text prompts embedded inside relevant sections. | Responses persist as the recipient moves; errors do not lose entered feedback. |
| Invite detail | One-contact analysis page with session history, responses, AI insight, and follow-up action. | Shows events and AI output after completion without requiring manual database inspection. |
| Campaign dashboard | Aggregate view of invited contacts, funnel, drop-off, response feed, objection clusters, and follow-up queue. | Aggregates update after events and AI jobs complete. |
| AI insight card | Concise summary, support level, objections, confusion points, champion potential, recommended next ask, and draft follow-up. | Regeneration is explicit and versioned; AI output never overwrites original feedback. |
| Mobile CRM | Contact panel and invite details remain usable on mobile for status checks and copy-link/follow-up. | No text overlap, hidden controls, or unreachable actions on narrow viewports. |

---

## 5. Functional Requirements

### 5.1 Campaign Authoring and Scope

Purpose: A Founder can define a structured feedback round without turning the MVP into a full presentation-builder product.

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-FNF-1 | MUST | Founder can create a pitch feedback campaign for a defined audience and project context. | Given a signed-in Founder, when they create a campaign with name, audience, optional project, and purpose, then the campaign is saved as draft and appears in Pitch Feedback campaign list. | Founder module request |
| FR-FNF-2 | MUST | Founder can define campaign sections with ordered content and feedback prompts. | Given a draft campaign, when Founder adds 5-10 sections with section keys, titles, body content, and prompt definitions, then recipient review renders sections in that order. | Dynamic pitch vision |
| FR-FNF-3 | MUST | Founder can activate or close a campaign. | Given a campaign is draft, when Founder activates it, then new invites can be created; when Founder closes it, then new invites are blocked but historical invite data remains visible. | Campaign lifecycle |
| FR-FNF-4 | MUST | Founder can version campaign content before sending new invites. | Given campaign content changes after at least one invite exists, when Founder saves changes, then new invites use the new version and prior invites retain the version snapshot they were sent. | Feedback traceability |
| FR-FNF-5 | SHOULD | Founder can duplicate an existing campaign for a new feedback round. | Given a prior campaign exists, when Founder duplicates it, then sections and prompts copy into a draft campaign with no invites or responses. | Iteration workflow |
| FR-FNF-6 | SHOULD | Founder can tag a campaign by audience type such as friends-family, advisor, partner, customer, or investor. | Given campaign has audience tag `friends-family`, when campaign list is filtered by audience, then matching campaigns appear and unrelated campaigns are hidden. | Audience clarity |

### 5.2 Contact-Linked Invites

Purpose: Every recipient workflow starts from, and reports back to, a CRM contact.

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-FNF-7 | MUST | Founder can create a pitch feedback invite from a contact record. | Given Contact Marta exists and active campaign exists, when Founder creates an invite from Marta's detail page, then an invite is linked to Marta, the campaign, workspace, creator, and status `draft`. | "Link to contacts" |
| FR-FNF-8 | MUST | Founder can generate a unique private review link for one contact invite. | Given a draft invite exists, when Founder generates link, then CRM displays a copyable URL and stores only a server-verifiable token representation, not the raw token. | Tracking requirement |
| FR-FNF-9 | MUST | Founder can see invite status on the related contact record. | Given a contact has an invite, when Founder opens contact detail, then status, sent time, first open, last view, completion percent, response count, and AI summary state are visible. | Contact source of truth |
| FR-FNF-10 | MUST | Founder can create multiple invites for the same contact across different campaigns or versions. | Given Marta reviewed Campaign A v1, when Founder sends Campaign A v2 or Campaign B, then the new invite is separately tracked and prior invite history remains visible. | Iterative feedback |
| FR-FNF-11 | MUST | Founder can revoke an invite from the contact record or invite detail. | Given invite is active, when Founder revokes it, then public access is blocked, status becomes revoked, revocation time is recorded, and contact panel updates. | Privacy/control |
| FR-FNF-12 | MUST | Founder can set invite expiry. | Given invite has an expiry date, when recipient opens after expiry, then the public page shows unavailable state and CRM records an expired access attempt without exposing pitch content. | Private link control |
| FR-FNF-13 | SHOULD | Founder can send invites to selected contacts in bulk. | Given Founder selects 20 contacts and one campaign, when they send in bulk, then each contact receives a distinct invite and aggregate results show sent, skipped, and failed counts. | Scale path |
| FR-FNF-14 | SHOULD | Founder can filter contacts by feedback status. | Given contacts have invite states, when Founder filters contacts by not-sent, sent-not-opened, opened-not-completed, completed, champion, or skeptical, then the contact grid returns matching contacts. | CRM tracking |

### 5.3 Invite Delivery

Purpose: The module records the handoff and enables practical sharing without making delivery the core MVP dependency.

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-FNF-15 | MUST | Founder can copy a private invite link and mark delivery channel manually. | Given invite has link, when Founder copies it and selects manual, WhatsApp, Signal, email, or link channel, then delivery channel and timestamp are recorded. | MVP delivery |
| FR-FNF-16 | MUST | Founder can preview the recipient-facing invite before sending. | Given invite exists, when Founder previews, then CRM shows the exact campaign version and personalization snapshot without recording recipient open events. | Quality control |
| FR-FNF-17 | SHOULD | Founder can send an invite through a contact's existing email channel. | Given contact has a primary email and Email module send is available, when Founder sends by email, then the invite is delivered, send outcome is recorded, and a contact touch is created. | CRM channel integration |
| FR-FNF-18 | SHOULD | Founder can send an invite through a contact's WhatsApp channel. | Given contact has WhatsApp channel and WhatsApp sending is available, when Founder sends by WhatsApp, then delivery attempt and provider outcome are recorded on invite and contact timeline. | Existing CRM capture/channel model |
| FR-FNF-19 | MUST | System can prevent duplicate delivery attempts from creating duplicate invites. | Given Founder clicks send twice for the same invite/channel/message, then exactly one delivery attempt is marked current and duplicate attempts are rejected or recorded as no-op. | Reliability |
| FR-FNF-20 | SHOULD | Founder can customize the outbound invite message per contact. | Given AI creates a suggested message, when Founder edits it before send/copy, then the edited message snapshot is stored with the invite. | Personal relationship fit |

### 5.4 Recipient Public Review Experience

Purpose: The recipient experiences a guided silent presentation, not a long form.

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-FNF-21 | MUST | Recipient can open a valid private review link without creating an account. | Given invite token is valid, active, and unexpired, when Recipient opens the link, then they see the campaign welcome and no CRM navigation or internal contact data. | F&F accessibility |
| FR-FNF-22 | MUST | Recipient can move through campaign sections in order. | Given campaign has seven sections, when Recipient uses next/back controls or keyboard navigation, then section transitions preserve order and progress. | Dynamic presentation |
| FR-FNF-23 | MUST | Recipient can see a clear progress indicator. | Given Recipient is on section 4 of 7, then progress indicates current position and completion state without requiring CRM knowledge. | Presentation clarity |
| FR-FNF-24 | MUST | Recipient can submit lightweight section feedback. | Given a section has reaction, score, and text prompts, when Recipient submits any prompt, then the response is saved against invite, section, prompt, and session. | Embedded feedback |
| FR-FNF-25 | MUST | Recipient can skip non-required feedback prompts. | Given a section has optional prompt, when Recipient advances without answering, then progress continues and unanswered prompt is recorded as skipped only if needed for analytics. | Low-friction feedback |
| FR-FNF-26 | MUST | Recipient can submit final feedback at the end of the walkthrough. | Given Recipient reaches final section, when they submit final confidence, comments, and optional next-step willingness, then invite status becomes completed and completion time is recorded. | End-to-end flow |
| FR-FNF-27 | MUST | Recipient can resume an in-progress review from the same invite link. | Given Recipient completed 50 percent and returns later before expiry, when they reopen the link, then prior progress and saved responses are available. | Practical recipient use |
| FR-FNF-28 | MUST | Recipient can recover from validation or network errors without losing feedback already entered. | Given a response save fails, when the page shows retry, then previously typed feedback remains visible and can be resubmitted. | UX reliability |
| FR-FNF-29 | SHOULD | Recipient can choose a preferred next step after final feedback. | Given final step includes options, when Recipient selects call, intro, second review, early user, advisor, or no follow-up, then the selection is stored for AI and follow-up queue. | Relationship development |
| FR-FNF-30 | COULD | Recipient can provide an intro suggestion. | Given final prompt asks who else should see this, when Recipient enters a person or organization, then CRM stores it as feedback data and can later convert it into a contact or task. | Network expansion |

### 5.5 Engagement Tracking and Event Rollups

Purpose: Founder can understand engagement without turning the contact timeline into raw telemetry.

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-FNF-31 | MUST | System can record first open and last viewed timestamps for each invite. | Given valid invite is opened, then first_opened_at is set once, last_viewed_at updates on subsequent visits, and contact panel reflects both. | "Who viewed it" |
| FR-FNF-32 | MUST | System can track section progress per invite. | Given Recipient enters section 5 of 7, then invite completion percent and current section update to reflect reached progress. | Progress tracking |
| FR-FNF-33 | MUST | System can record granular review events without creating timeline spam. | Given Recipient enters sections, reacts, submits responses, or completes, then granular events are stored in Pitch Feedback event history and only milestone rollups create touches. | Contact timeline quality |
| FR-FNF-34 | MUST | Founder can see open-but-not-completed contacts. | Given invites are opened but incomplete, when Founder views campaign dashboard or contact filters, then those contacts appear with last viewed time and current section. | Follow-up workflow |
| FR-FNF-35 | MUST | Founder can see campaign funnel metrics. | Given campaign has invites, when Founder opens campaign dashboard, then invited, sent, opened, in-progress, completed, expired, and revoked counts are shown. | Campaign analytics |
| FR-FNF-36 | SHOULD | Founder can see section drop-off by campaign. | Given multiple recipients have progressed through sections, when Founder views campaign analytics, then each section shows entered count, completed count, and drop-off count. | Pitch improvement |
| FR-FNF-37 | MUST | System can update contact last-touch only for meaningful milestone events. | Given section events occur, then contact `last_touch_at` is not updated for every section view; invite sent, completed feedback, and follow-up sent may update timeline according to touch policy. | CRM signal quality |
| FR-FNF-38 | MUST | Founder can export campaign feedback and engagement records. | Given Founder exports a campaign, then export includes invite status, contact references, response summaries, AI classifications, and event aggregates without exposing raw tokens. | Portability/audit |

### 5.6 Feedback Review and CRM Workflow

Purpose: Feedback must become relationship intelligence and action, not static survey output.

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-FNF-39 | MUST | Founder can view all feedback responses for one invite. | Given invite has section and final responses, when Founder opens invite detail, then responses are grouped by section with prompt labels, timestamps, and original response values. | Review workflow |
| FR-FNF-40 | MUST | Founder can view a campaign-level feedback feed. | Given campaign has completed and partial responses, when Founder opens campaign dashboard, then feedback appears newest-first with contact, section, prompt, and response preview. | Campaign learning |
| FR-FNF-41 | MUST | Founder can convert high-signal feedback into a contact touch. | Given a response is useful, when Founder logs it as touch, then a touch is created for the contact with source invite and response reference. | CRM continuity |
| FR-FNF-42 | SHOULD | Founder can create an action item from feedback or AI recommendation. | Given response says "explain pricing better", when Founder creates action item, then action item includes title, source contact, source invite, and optional project link. | Follow-up action |
| FR-FNF-43 | SHOULD | Founder can mark a contact's feedback disposition. | Given AI suggests champion/supportive/skeptical, when Founder confirms or overrides disposition, then confirmed disposition is stored separately from AI classification. | Human authority |
| FR-FNF-44 | MUST | Founder can search and filter feedback by contact, campaign, section, sentiment, support level, objection, or completion state. | Given feedback records exist, when Founder filters by "skeptical + pricing", then matching responses and contacts are returned. | Analysis workflow |
| FR-FNF-45 | SHOULD | Founder can compare feedback across campaign versions. | Given Campaign v1 and v2 have responses, when Founder compares versions, then dashboard shows completion, sentiment, and objection differences by version. | Pitch iteration |

### 5.7 AI Personalization and Insight

Purpose: AI should perform concrete CRM jobs: personalize, summarize, classify, cluster, and draft next steps.

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-FNF-46 | SHOULD | Active Brain can personalize invite framing for a contact before send. | Given contact context and campaign content, when Founder requests personalization, then AI returns a suggested welcome note, send message, and 2-3 contact-relevant questions. | "Leverage AI" |
| FR-FNF-47 | MUST | Active Brain can summarize completed feedback for one invite. | Given Recipient completes final feedback, when AI summary job runs, then invite has summary, positive signals, objections, confusion points, and recommended follow-up. | AI summarization |
| FR-FNF-48 | MUST | Active Brain can classify feedback sentiment and support level. | Given responses exist, when AI analyzes invite, then sentiment is one of positive, neutral, mixed, negative and support level is one of champion, supportive, curious, skeptical, disengaged. | Follow-up prioritization |
| FR-FNF-49 | MUST | Active Brain can identify section-specific confusion and objections. | Given responses reference unclear sections, when AI analyzes, then confusion points and objections retain source section keys and representative response references. | Pitch improvement |
| FR-FNF-50 | SHOULD | Active Brain can draft a follow-up message from a contact's feedback. | Given invite has AI summary and contact context, when Founder requests draft, then AI returns editable WhatsApp/email copy and suggested next ask; no message is sent automatically. | Human-in-loop safety |
| FR-FNF-51 | SHOULD | Active Brain can cluster campaign-level objections. | Given at least five responses exist, when campaign analysis runs, then AI groups recurring objections, counts affected contacts, cites source responses, and suggests pitch edit priorities. | Campaign learning |
| FR-FNF-52 | SHOULD | Active Brain can identify potential champions and intro opportunities. | Given responses contain high support or intro willingness, when AI analyzes campaign, then dashboard flags contacts with champion potential and suggested next action. | Network leverage |
| FR-FNF-53 | MUST | Founder can regenerate AI insight without deleting prior AI output. | Given AI insight exists, when Founder regenerates, then new insight version is added with timestamp/model and prior version remains available or auditable. | AI governance |

### 5.8 Privacy, Access, and Governance

Purpose: External links should be private, revocable, minimally exposed, and respectful.

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-FNF-54 | MUST | Public review page can render only the invite-approved payload. | Given Recipient opens valid link, then public response includes campaign snapshot, invite personalization, prompts, and no unrelated contact fields, CRM notes, channels, tags, projects, or internal AI output. | Privacy boundary |
| FR-FNF-55 | MUST | Public review page can show a concise tracking disclosure. | Given Recipient opens review, then the page communicates that progress and feedback are recorded for Tomas's review without listing invasive telemetry details. | Trust with F&F |
| FR-FNF-56 | MUST | Workspace Admin can audit invite lifecycle events. | Given invite is created, sent, opened, completed, expired, revoked, or exported, then audit/event history identifies workspace, contact, invite, event type, actor if internal, and timestamp. | Governance |
| FR-FNF-57 | MUST | System can enforce workspace scoping on all internal pitch feedback records. | Given user belongs to Workspace A, when querying Pitch Feedback records, then records from Workspace B are never returned. | AGB CRM security model |
| FR-FNF-58 | SHOULD | Founder can remove or redact a recipient's feedback from campaign analytics while preserving audit. | Given feedback needs removal, when Founder redacts it, then dashboard excludes content from analysis, export marks it redacted, and audit records the action. | Privacy/data control |

---

## 6. Non-Functional Requirements

| ID | Category | Requirement | Acceptance Target |
|---|---|---|---|
| NFR-FNF-1 | Security | Raw public invite tokens shall never be stored after generation. | Code review and DB inspection show only derived/verifiable token representation. |
| NFR-FNF-2 | Security | Invite access shall fail closed for missing, malformed, expired, revoked, or inactive campaign links. | Integration tests cover all deny paths. |
| NFR-FNF-3 | Security | All internal records shall be workspace-scoped and contact/campaign scoped where applicable. | Query tests prove cross-workspace denial. |
| NFR-FNF-4 | Privacy | Public invite payload shall exclude internal CRM notes, contact channels, tags, project details, and prior AI analysis unless explicitly included in invite personalization. | Public route snapshot test verifies payload shape. |
| NFR-FNF-5 | Privacy | IP and user-agent data, if retained, shall be minimized or derived for abuse/debugging rather than displayed as recipient profile data. | Data review confirms no raw IP/user-agent shown in CRM UI by default. |
| NFR-FNF-6 | Trust | Recipient tracking disclosure shall be visible before or during the first feedback submission. | Browser smoke verifies disclosure presence. |
| NFR-FNF-7 | Reliability | Recipient feedback saves shall be idempotent for retries and network failures. | Retry test creates one logical response per prompt attempt. |
| NFR-FNF-8 | Reliability | Invite rollup fields shall reconcile from event/response records after partial failures. | Reconciliation job or query test restores correct status/progress. |
| NFR-FNF-9 | Performance | Public review first meaningful content shall load within 2.5 seconds on normal production conditions for campaigns with up to 10 sections. | Browser performance smoke at seeded campaign size. |
| NFR-FNF-10 | Performance | Contact Pitch Feedback panel shall load within the existing contact detail page budget and not block core contact data. | Contact page smoke verifies panel fallback/loading state. |
| NFR-FNF-11 | Usability | Recipient can complete a 7-section review with required prompts in under 8 minutes in usability smoke. | Manual or scripted smoke with seeded content. |
| NFR-FNF-12 | Accessibility | Public review controls shall be keyboard navigable and have unique accessible names. | Playwright keyboard/accessibility smoke. |
| NFR-FNF-13 | Responsive Safety | Public review, contact panel, invite detail, and campaign dashboard shall not overlap or overflow at 390px, 768px, 1440px, and wide desktop. | Screenshot verification at breakpoints. |
| NFR-FNF-14 | Visual Quality | Recipient experience shall feel like a polished private walkthrough and avoid plain long-form survey layout. | Design review screenshots pass. |
| NFR-FNF-15 | Dynamic Integrity | Progress, responses, and completion states shall not visually reset when moving between sections or refreshing an active invite. | E2E review flow covers resume and refresh. |
| NFR-FNF-16 | AI Safety | AI output shall be labeled, editable, versioned where regenerated, and never sent externally without human action. | AI workflow tests and UI review. |
| NFR-FNF-17 | AI Grounding | Invite-level AI summaries shall cite source sections or response references for objections and confusion points. | AI fixture test verifies structured cited output. |
| NFR-FNF-18 | Cost Control | AI jobs shall respect existing workspace AI budget/kill-switch patterns. | Test verifies disabled/budget-exceeded mode returns graceful state. |
| NFR-FNF-19 | Observability | Invite access errors, event record failures, response save failures, AI failures, and export events shall emit structured logs. | Log inspection or test logger assertions. |
| NFR-FNF-20 | Data Integrity | Campaign content snapshots shall preserve what the recipient actually saw at invite time. | Versioning test proves old invite renders old snapshot after campaign edit. |
| NFR-FNF-21 | Exportability | Campaign export shall exclude raw invite tokens and respect redaction state. | Export test validates columns and redaction. |
| NFR-FNF-22 | Testability | V1 shall include deterministic seed data for at least one campaign, three contacts, three invite states, and one completed feedback response. | Tests and local QA can run without external email/WhatsApp/AI credentials. |

---

## 7. Entity and State Contract

These are product entities, not a mandate for exact table names. They define the records the implementation must be able to represent.

| Entity | Purpose | Required Relationships | Required State |
|---|---|---|---|
| Pitch Feedback Campaign | A feedback round and pitch package | Workspace, optional Project, creator, sections, prompts | draft, active, closed, archived |
| Campaign Version/Snapshot | The exact content sent to a recipient | Campaign, invite(s), section snapshots | immutable after invite send |
| Pitch Feedback Invite | One private link for one contact and campaign snapshot | Workspace, campaign/version, contact, creator | draft, link_generated, sent, opened, in_progress, completed, expired, revoked |
| Pitch Feedback Session | One browser/device visit to an invite | Invite, contact, workspace | started, active, completed, abandoned |
| Pitch Feedback Event | Granular engagement or lifecycle event | Invite, optional session, contact, workspace | event type, section key, metadata, timestamp |
| Pitch Feedback Response | Recipient's answer to a prompt | Invite, session, contact, campaign section/prompt | response type, value, timestamp |
| Pitch Feedback AI Insight | AI interpretation of feedback | Invite/contact/campaign, model, source references | active insight, prior versions retained or auditable |
| Pitch Feedback Delivery Attempt | Attempt to deliver/copy/send an invite | Invite, contact, channel, optional provider result | pending, sent, failed, copied, manual |
| Pitch Feedback Redaction | Human decision to suppress response content | Response or invite, actor, reason | active, lifted |

---

## 8. Event Taxonomy

| Event | Trigger | Creates Contact Touch? | Notes |
|---|---|---:|---|
| invite_created | Founder creates invite | No | Internal setup only |
| link_generated | Private link created | No | Raw token not stored |
| invite_sent | Invite delivered or manually marked sent | Yes | Meaningful relationship event |
| invite_copied | Founder copies link | Optional | Usually no touch unless marked delivered |
| link_opened | Recipient first opens link | Optional | Create touch only if desired by policy; always update invite |
| session_started | Browser session begins | No | Analytics only |
| section_entered | Recipient views section | No | Analytics only |
| section_completed | Recipient advances past section | No | Analytics only |
| reaction_submitted | Recipient submits reaction/score | No | Response record carries detail |
| question_answered | Recipient submits text/choice response | No | Response record carries detail |
| final_feedback_submitted | Recipient submits final feedback | Yes | Meaningful relationship event |
| invite_completed | Completion rollup applied | Yes | May share touch with final submission |
| ai_summary_generated | AI insight generated | Yes | Contact timeline summary |
| followup_draft_created | AI/founder creates follow-up draft | No | Action state, not outbound contact |
| followup_task_created | Founder creates follow-up task | No | Action item holds task |
| followup_sent | Founder sends follow-up | Yes | Relationship event |
| invite_expired | Invite expires | No | Status/audit |
| invite_revoked | Founder revokes invite | No | Audit/control |
| feedback_redacted | Founder redacts response | No | Audit/privacy |

---

## 9. AI Output Contracts

| AI Job | Input | Required Output | Human Control |
|---|---|---|---|
| Pre-send personalization | Contact context, campaign snapshot, relationship type, recent touches, optional Founder note | Welcome note, outbound message draft, contact-specific prompts, rationale | Founder can edit or discard before link delivery. |
| Invite summary | Responses, progress, final feedback, section metadata | Summary, positive signals, objections, confusion points, sentiment, support level, recommended next action, cited response references | Founder can regenerate and override disposition. |
| Campaign clustering | Completed invite insights and responses | Top objections, confusing sections, strongest sections, champion candidates, pitch edit priorities | Founder decides pitch edits and follow-ups. |
| Follow-up draft | Contact context, AI insight, selected next ask | WhatsApp/email draft, task suggestion, recommended timing | Founder must send manually. |
| Pitch edit suggestion | Campaign sections and clustered feedback | Section-level edit recommendations and source evidence | Suggestions never modify campaign content automatically. |

---

## 10. Launch Gates

| ID | Gate | Required Evidence |
|---|---|---|
| LG-FNF-1 | Contact source-of-truth gate | Every invite in seeded and test data links to a contact; contact panel shows latest state. |
| LG-FNF-2 | Token privacy gate | Tests prove raw tokens are not stored and expired/revoked tokens fail closed. |
| LG-FNF-3 | Public payload gate | Public review route exposes only campaign snapshot and approved personalization. |
| LG-FNF-4 | Recipient completion gate | E2E test opens link, progresses through sections, submits feedback, and reaches thank-you state. |
| LG-FNF-5 | Resume/retry gate | E2E test refreshes mid-review and preserves progress/feedback. |
| LG-FNF-6 | Contact timeline gate | Granular section events do not spam touches; sent/completed/AI summary rollups appear as intended. |
| LG-FNF-7 | Campaign analytics gate | Dashboard shows correct funnel counts for seeded not-sent, sent, opened, in-progress, completed, expired, revoked states. |
| LG-FNF-8 | AI summary gate | Completed feedback creates a structured AI insight or graceful non-AI fallback when AI is disabled. |
| LG-FNF-9 | Follow-up gate | Founder can create a task or draft from feedback/AI insight without autonomous external sending. |
| LG-FNF-10 | Redaction/export gate | Export excludes raw tokens and respects redacted responses. |
| LG-FNF-11 | Mobile/desktop visual gate | Screenshots at 390px, 768px, 1440px, and wide desktop show no overlap or unreachable controls. |
| LG-FNF-12 | Workspace isolation gate | Cross-workspace invite, response, event, insight, and export access is denied. |

---

## 11. Traceability Matrix

| User Need | Requirement Coverage |
|---|---|
| "It should link to contacts in AGB CRM" | FR-FNF-7, FR-FNF-9, FR-FNF-10, FR-FNF-37, LG-FNF-1 |
| "That is where I should do all tracking" | FR-FNF-31 through FR-FNF-38, FR-FNF-39 through FR-FNF-45 |
| "Dynamic no-voice presentation" | FR-FNF-21 through FR-FNF-30, NFR-FNF-11 through NFR-FNF-15 |
| "Feedback through all of it" | FR-FNF-24, FR-FNF-25, FR-FNF-26, FR-FNF-39, FR-FNF-40 |
| "Track who I sent the link to and who viewed it" | FR-FNF-15 through FR-FNF-20, FR-FNF-31, FR-FNF-34, FR-FNF-35 |
| "Leverage AI as much as I can" | FR-FNF-46 through FR-FNF-53, NFR-FNF-16 through NFR-FNF-18 |
| "Seamless platform/module" | Product Boundary, UX Contract, FR-FNF-1 through FR-FNF-58, Launch Gates |

---

## 12. MVP Build Slice

| Slice | Included Requirements | Notes |
|---|---|---|
| V1A - Tracking substrate | FR-FNF-1 through FR-FNF-12, FR-FNF-31 through FR-FNF-33, FR-FNF-54, FR-FNF-57 | Data/entities, token/link, contact panel, event capture. |
| V1B - Recipient walkthrough | FR-FNF-21 through FR-FNF-28, NFR-FNF-9 through NFR-FNF-15 | Public review page and embedded feedback. |
| V1C - CRM review loop | FR-FNF-35, FR-FNF-36, FR-FNF-39 through FR-FNF-44 | Invite detail, campaign dashboard, follow-up actions. |
| V1D - AI insight | FR-FNF-46 through FR-FNF-53, NFR-FNF-16 through NFR-FNF-18 | Personalization, summaries, classifications, follow-up draft. |
| V1E - Hardening | FR-FNF-38, FR-FNF-56 through FR-FNF-58, all launch gates | Export, audit, redaction, isolation, visual QA. |

---

## 13. Explicitly Deferred

| Deferred Capability | Reason |
|---|---|
| Full pitch slide builder | MVP can use structured campaign sections; builder adds complexity before feedback loop is proven. |
| Bulk sends as first dependency | Contact-by-contact flow proves tracking and UX first; bulk comes after. |
| Account-based recipient login | Tokenized private link is lower-friction for F&F review. |
| Live AI chat during review | Higher privacy and complexity; embedded prompts are enough for V1. |
| Autonomous AI follow-up sending | Human-in-loop is required for relationship quality and safety. |
| Public comments/threads | Could turn lightweight feedback into a portal product too early. |
| Heatmap/session replay analytics | Too invasive for F&F trust and not needed for first learning loop. |

---

## 14. Open Decisions

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| D-FNF-1 | Public route name | Use `/f/[token]` for short private F&F links; reserve `/access` for Partner Access. | Final route naming |
| D-FNF-2 | Initial campaign content source | Use structured campaign JSON first; later convert project docs/decks into sections. | Campaign authoring UX |
| D-FNF-3 | First delivery method | Start with copy-link/manual channel; add email/WhatsApp send after base tracking works. | Delivery scope |
| D-FNF-4 | F&F contact identification | Use campaign audience plus existing contact relationship/tags; do not hard-code `relationship_type=friend`. | Contact filters |
| D-FNF-5 | AI execution timing | Generate invite-level AI summary immediately after completion with graceful fallback; campaign clustering on demand. | AI job design |
| D-FNF-6 | Tracking disclosure wording | Use concise relationship-safe language: "Your progress and feedback are saved so Tomas can review your comments." | Recipient trust |
| D-FNF-7 | Contact timeline policy | Create touches for sent, completed, AI summary, and follow-up sent; do not create touches for every section view. | Timeline implementation |

---

## 15. GigaRico Quality Notes

| Dimension | Score | Evidence |
|---|---:|---|
| Specificity | 9 | 58 actor-defined FRs with concrete acceptance criteria. |
| Measurability | 9 | Every FR has acceptance criteria; NFRs include verification targets. |
| Implementation agnostic | 8 | FRs avoid table/component mandates; implementation references are isolated to entity/launch planning. |
| Traceability | 9 | Traceability matrix maps founder statements to FR coverage. |
| Completeness | 9 | Covers campaign, invite, delivery, recipient UX, tracking, CRM workflow, AI, privacy, export, redaction, launch gates. |
| Actor coverage | 9 | Founder, Recipient, Contact, Active Brain, Workspace Admin, System Worker all represented. |
| Testability | 9 | Launch gates and NFRs define automation/manual verification targets. |

Composite quality score: **9.0/10 - EXCELLENT module contract, pending route/content/delivery decisions.**
