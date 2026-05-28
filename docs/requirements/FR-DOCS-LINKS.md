# AGB CRM — Project Documents & Links

**Version:** v1.0 · drafted 2026-05-27
**Status:** Extends `FR-MATRIX.md` (GigaRico-validated 2026-05-26). Adds capability area §15 — DOC.
**Total:** 22 FRs (12 Step-1 URL links · 10 Step-2 file uploads) + 9 NFRs · 14 MUST · 6 SHOULD · 2 COULD.
**Source:** Founder direct (2026-05-27); HLR-V2 §4 "Project hub"; existing `project_links` schema (db/schema.ts:415-433); existing `link-section.tsx` read-only UI.
**Conventions:** Same as FR-MATRIX. Capability format. Given/When/Then ACs. MoSCoW. ID prefix `FR-DOC-`. NFR prefix `NFR-DOC-`. Tasks numbered into new bucket `TASK-AGB-6xx` (Phase 1 hardening / Phase 6 polish — does not collide with existing matrix).

> **Reader contract.** Read this once → start coding. Recommendations in Open Questions stand unless the founder overrides. Anything not in this doc is out-of-scope for v1.

---

## §15 — DOC · Project Documents & Links

Two-step delivery:

- **Step 1 (MUST, Phase 1 hardening):** URL-only links. Server actions, add/edit/delete UI, smart category detection. Targets the existing `project_links` table.
- **Step 2 (SHOULD, Phase 1.5 or Phase 6):** File uploads to Supabase Storage. Reuses the same surface and table, distinguished by a new `kind` column.

---

## Step 1 — URL-only Project Links (12 FRs)

### FR-DOC-1 · Create project link (MUST, Phase 1)
**Capability:** A workspace member with write permission can attach an external URL to a Project, with label, category, optional description.
**Source:** Founder 2026-05-27.
**Actor:** Founder · Member (write-permitted)
**Acceptance:**
- **GIVEN** a Project P exists in workspace W and the Founder is a member of W, **WHEN** they submit `{ url: "https://docs.google.com/document/d/abc", label: "Q3 deck", category: "business" }`, **THEN** a row appears in `project_links` with `workspace_id = W.id`, `project_id = P.id`, `kind = 'link'` (Step 2 adds this column; Step 1 leaves it default), `url` non-null, `sort_order = MAX(sort_order WHERE project_id = P.id AND category = 'business') + 1`, `created_at = now()`, `created_by = current_user.id` (new FK column added by this slice)
- **GIVEN** the form is submitted with empty `label` or empty `url`, **THEN** validation rejects and no row is inserted
- **GIVEN** `url` is not a syntactically valid HTTPS URL (`new URL()` throws or scheme ≠ `https:`/`http:`), **THEN** validation rejects with message "Enter a valid URL starting with https://"
- **GIVEN** the user is not a member of workspace W, **THEN** the server action returns 403 and no row is inserted (RLS catches this even if the action layer fails — see NFR-DOC-SEC-1)
**Deps:** FR-WSP-2 (workspace scoping), existing `project_links` schema
**Task:** TASK-AGB-601

---

### FR-DOC-2 · Smart category detection (MUST, Phase 1)
**Capability:** When the user pastes a URL in the add-link modal, the category dropdown pre-selects a recommended category based on the URL hostname. User can override.
**Source:** Founder UX intent 2026-05-27.
**Acceptance:**
- **GIVEN** the user pastes `https://docs.google.com/document/...` or `https://docs.google.com/spreadsheets/...` or `https://drive.google.com/...`, **THEN** category defaults to `business`
- **GIVEN** `https://www.figma.com/...` or `https://www.canva.com/...`, **THEN** category defaults to `design`
- **GIVEN** `https://github.com/...` or `https://gitlab.com/...` or `https://*.vercel.app/...`, **THEN** category defaults to `tech`
- **GIVEN** `https://www.notion.so/...` or `https://*.notion.site/...` or `https://*.dropboxpaper.com/...` or `https://*.coda.io/...`, **THEN** category defaults to `ops`
- **GIVEN** `https://*.stripe.com/...` or `https://*.quickbooks.intuit.com/...` or `https://*.xero.com/...`, **THEN** category defaults to `finance`
- **GIVEN** any host with "instagram", "tiktok", "youtube", "twitter", "x.com", "linkedin", **THEN** category defaults to `marketing`
- **GIVEN** the URL matches none of the above, **THEN** category defaults to `other`
- **GIVEN** the user explicitly selects a different category before saving, **THEN** the user's choice persists (detection never overrides explicit selection)
- **Detection rule lives in `lib/project-links/detect-category.ts` — pure function, unit-tested.**
**Deps:** FR-DOC-1
**Task:** TASK-AGB-601

---

### FR-DOC-3 · Auto-populated label (SHOULD, Phase 1)
**Capability:** When the user pastes a URL, the label field auto-populates with a sensible default. User can edit before save.
**Recommendation:** Use the URL's hostname + last path segment, decoded and humanized (`docs.google.com/...../edit` → "Google Docs · edit"). Do NOT do server-side OG-scrape in v1 — see Open Question 1.
**Acceptance:**
- **GIVEN** the user pastes `https://docs.google.com/document/d/abc/edit`, **THEN** the label field auto-fills with `"Google Docs"` (host's brand if known) or `"docs.google.com"` (fallback) — chosen via a small allow-list of hostnames mapped to brand names in `lib/project-links/host-brands.ts`
- **GIVEN** the user has already typed in the label field, **THEN** the auto-fill does NOT overwrite their input
- **GIVEN** the user clears the label field after auto-fill, **THEN** auto-fill does not re-trigger (one-shot per modal open)
- **GIVEN** the user pastes a different URL after the first, **THEN** auto-fill re-runs only if the label field is still in its auto-populated state (compare against the last auto-value cached in the modal's local state)
**Deps:** FR-DOC-2
**Task:** TASK-AGB-601

---

### FR-DOC-4 · Edit project link (MUST, Phase 1)
**Capability:** A workspace member with write permission can edit any of: label, url, category, description, sort_order — on an existing link.
**Acceptance:**
- **GIVEN** an existing link L on Project P, **WHEN** the Founder submits `{ id: L.id, label: "Q4 deck (renamed)" }`, **THEN** the row updates, `updated_at = now()` (new column added in this slice), and `updated_by = current_user.id` (new column)
- **GIVEN** the user changes `category`, **THEN** `sort_order` is recomputed as `MAX(sort_order WHERE category = new_category) + 1` so the link moves to the bottom of the new category bucket
- **GIVEN** the user is not a member of the workspace owning L, **THEN** server action returns 403
- **GIVEN** the user attempts to edit `workspace_id` or `project_id` directly, **THEN** the server action ignores those fields (whitelist of mutable columns enforced server-side)
**Deps:** FR-DOC-1, FR-DOC-9 (permission model)
**Task:** TASK-AGB-602

---

### FR-DOC-5 · Delete project link (MUST, Phase 1)
**Capability:** A workspace member with write permission can delete a link. UI requires explicit confirmation.
**Acceptance:**
- **GIVEN** link L exists, **WHEN** the Founder clicks "Delete" and confirms in the dialog, **THEN** the row is hard-deleted from `project_links` and the UI removes the row optimistically
- **GIVEN** delete is initiated, **WHEN** the user cancels the confirmation dialog, **THEN** no DB call is made
- **GIVEN** delete succeeds, **THEN** an audit row is written to `project_link_audits` (see FR-DOC-11) with `action = 'delete'` and a snapshot of the deleted row in `before` JSONB
- **NOTE:** v1 does soft-delete via the audit log's `before` snapshot, not via a `deleted_at` column. If undo is desired in v2, add `deleted_at`.
**Deps:** FR-DOC-1, FR-DOC-11
**Task:** TASK-AGB-602

---

### FR-DOC-6 · Reorder links within a category (SHOULD, Phase 1)
**Capability:** A workspace member can reorder links within a category via drag-and-drop. Order across categories is fixed (categories render in the order defined in `link-section.tsx`).
**Acceptance:**
- **GIVEN** category `business` has links [L1, L2, L3] with sort_order [0, 1, 2], **WHEN** the user drags L3 to position 0, **THEN** sort_order updates to [L3=0, L1=1, L2=2] and the new order persists on refresh
- **GIVEN** a drag operation begins, **THEN** the UI shows a drag handle (kbd-accessible — see NFR-DOC-A11Y-2) and the drop zone is visually distinct
- **GIVEN** the user drags a link to a different category, **THEN** the drop is rejected with a tooltip "Drag within the same category. To move it, use Edit." (cross-category move = edit, not drag)
- **Reorder calls a single server action that updates all affected rows in a transaction.**
**Deps:** FR-DOC-1
**Task:** TASK-AGB-603

---

### FR-DOC-7 · Add-link modal UI (MUST, Phase 1)
**Capability:** A "+ Add link" button on the Project detail page opens a modal with fields: URL (required, autofocus), Label (required), Category (dropdown), Description (optional textarea, ≤500 chars).
**Acceptance:**
- **GIVEN** Founder is on `/projects/{id}`, **THEN** an "+ Add link" button is visible at the top of the Links section, keyboard-reachable via Tab from the section heading
- **GIVEN** the button is clicked, **THEN** a modal opens with focus trapped, URL field autofocused, Escape closes (with confirm if dirty)
- **GIVEN** the user submits a valid form, **THEN** the modal closes, an optimistic row appears in the correct category, and a toast confirms "Link added"
- **GIVEN** the server action fails after optimistic insert, **THEN** the optimistic row is removed and an error toast shows the server message
- **GIVEN** the modal is open, **THEN** clicking outside the modal does NOT dismiss it (must use Cancel or Escape) — protects work in progress
**Deps:** FR-DOC-1, FR-DOC-2, FR-DOC-3
**Task:** TASK-AGB-601

---

### FR-DOC-8 · Edit-and-delete affordances on each link row (MUST, Phase 1)
**Capability:** Each rendered link row exposes Edit and Delete actions. On desktop these appear on hover; on mobile they're behind a tap-to-reveal kebab menu.
**Acceptance:**
- **GIVEN** the Project page rendered on a >768px viewport, **THEN** edit + delete icons appear on row hover and on keyboard focus
- **GIVEN** the page rendered on a ≤768px viewport, **THEN** a kebab `⋮` icon is always visible; tapping it opens a popover with Edit / Delete options
- **GIVEN** Edit is clicked, **THEN** the add-link modal opens in edit mode pre-filled with the row's current values
- **GIVEN** Delete is clicked, **THEN** a confirmation dialog opens ("Delete '{label}'? This cannot be undone.")
**Deps:** FR-DOC-4, FR-DOC-5, FR-DOC-7
**Task:** TASK-AGB-601, TASK-AGB-602

---

### FR-DOC-9 · Permission model (MUST, Phase 1)
**Capability:** Add / edit / delete permissions follow this matrix:
- `owner` and `admin` roles: full CRUD on every link in their workspace.
- `member` role: can create links; can edit / delete only links they created (matched by `created_by`).
- Any role: can read every link in their workspace.
**Recommendation:** Adopted as v1 default (matches the founder's gut guess). Confirm in Open Question 2.
**Acceptance:**
- **GIVEN** user U has `member` role in workspace W and link L was created by another user, **WHEN** U calls the edit or delete server action on L, **THEN** the action returns 403 and the DB is unchanged
- **GIVEN** user U has `admin` or `owner` role in W, **THEN** U can edit/delete any link in W
- **GIVEN** the UI renders a link row, **THEN** edit + delete affordances render only when the current user can act on that row (no flashing-then-disabling UI)
- **Permission check happens in the server action AND is mirrored in RLS policy on `project_links`** (defense in depth — see NFR-DOC-SEC-1)
**Deps:** workspace_members.role, RLS migration `20260526120000_rls_owner_policies.sql` (extend)
**Task:** TASK-AGB-604

---

### FR-DOC-10 · Hostname badge / external-service signal (SHOULD, Phase 1)
**Capability:** Each link row displays a small hostname badge so users see at a glance which external service hosts the document (Google Docs, Figma, GitHub, etc.).
**Recommendation:** Adopted. Founder explicitly recommended yes.
**Acceptance:**
- **GIVEN** link with url `https://docs.google.com/document/d/abc`, **THEN** the row renders a `docs.google.com` text badge OR a brand chip if the host is in `lib/project-links/host-brands.ts`
- **GIVEN** link with an unknown host, **THEN** the row renders the bare hostname (`example.com`) as a neutral chip
- **GIVEN** the link is clicked, **THEN** it opens in a new tab (`target="_blank" rel="noopener noreferrer"`)
**Deps:** FR-DOC-1
**Task:** TASK-AGB-601

---

### FR-DOC-11 · Audit log for link mutations (MUST, Phase 1)
**Capability:** Every create / update / delete of a link writes a row to `project_link_audits` capturing actor, action, before+after JSON snapshot.
**Source:** Mirrors FR-CON-5 audit pattern.
**Acceptance:**
- **GIVEN** any link mutation, **THEN** a row appears in `project_link_audits` with `id`, `workspace_id`, `project_id`, `link_id`, `actor_id`, `action ∈ {'create','update','delete'}`, `before jsonb` (null for create), `after jsonb` (null for delete), `created_at`
- **GIVEN** the mutation fails, **THEN** no audit row is written (action + audit in same transaction)
- **GIVEN** an admin queries `/projects/{id}/audit` (future surface — out of scope for v1 UI), **THEN** the rows are available via SQL/Supabase Studio for forensic review
**Deps:** FR-DOC-1, FR-DOC-4, FR-DOC-5
**Task:** TASK-AGB-605

---

### FR-DOC-12 · WhatsApp agent `attach_link` tool (SHOULD, Phase 1.5)
**Capability:** The WA agent tool registry (`lib/wa-agent/tools/`) exposes an `attach_link` tool that takes `{ project_id | project_query, url, label?, category? }` and creates a `project_links` row via the same server action as FR-DOC-1.
**Source:** Founder UX 2026-05-27.
**Recommendation:** Yes — natural companion to `log_touch`, `upsert_note`. Adopt in Phase 1.5 (after Step 1 core ships).
**Acceptance:**
- **GIVEN** founder sends "Attach this to the Caney onboarding project: https://docs.google.com/document/d/abc/edit" to the WA bot, **THEN** the agent calls `attach_link` with the parsed args and a link is created with `created_by = founder.id`
- **GIVEN** the project query resolves to >1 project (ambiguous), **THEN** the agent uses the existing `find_project` flow to disambiguate before calling `attach_link`
- **GIVEN** the URL is invalid, **THEN** the tool returns an error and the agent reports it to the founder in natural language
- **The tool reuses `lib/project-links/detect-category.ts` for category defaulting — same logic as the web UI.**
**Deps:** FR-DOC-1, FR-DOC-2, existing `find-project.ts` tool
**Task:** TASK-AGB-606 (Phase 1.5)

---

## Step 2 — File uploads (10 FRs)

### FR-DOC-13 · Upload file to project (SHOULD, Phase 1.5)
**Capability:** A workspace member with write permission can upload a file (PDF, Office doc, image, txt/md) to a Project. The file is stored in Supabase Storage; metadata is recorded in `project_links` with `kind = 'file'`.
**Source:** Founder 2026-05-27.
**Schema extension required (Step-2 migration):**
- ALTER `project_links` ADD `kind text NOT NULL DEFAULT 'link' CHECK (kind IN ('link','file'))`
- ADD `storage_path text NULL` (set when `kind = 'file'`)
- ADD `mime_type text NULL`
- ADD `size_bytes bigint NULL`
- ADD `original_filename text NULL`
- ADD `created_by uuid NOT NULL REFERENCES users(id)` (also used by Step 1 — bring forward into Step 1 migration)
- ADD `updated_at timestamptz NULL` / `updated_by uuid NULL REFERENCES users(id)`
- ADD CONSTRAINT `link_or_file_consistency CHECK ((kind = 'link' AND url IS NOT NULL AND storage_path IS NULL) OR (kind = 'file' AND storage_path IS NOT NULL AND url IS NULL))`
**Acceptance:**
- **GIVEN** the user toggles "Upload file" in the add-link modal, **WHEN** they select a 2 MB PDF and submit, **THEN** the file uploads to bucket `agb-project-files` at path `{workspace_id}/{project_id}/{ulid}-{slug(original_filename)}`, a row appears in `project_links` with `kind='file'`, `storage_path` set, `url=NULL`, `mime_type='application/pdf'`, `size_bytes=2097152`, `original_filename='Q3-deck.pdf'`, `label='Q3 deck'` (auto-filled from filename, editable before submit), `created_by=current_user.id`
- **GIVEN** upload fails mid-stream (network drop), **THEN** the partial object is deleted from Storage and no DB row is created (transactional cleanup in the server action)
- **GIVEN** the same user uploads two files with identical original_filename to the same project, **THEN** both succeed and produce distinct storage_paths (ULID prefix ensures uniqueness — see FR-DOC-19 versioning recommendation)
**Deps:** FR-DOC-9, Supabase Storage bucket created
**Task:** TASK-AGB-610

---

### FR-DOC-14 · Storage layout (MUST when Step 2 ships, Phase 1.5)
**Capability:** All project files live in a single Supabase Storage bucket `agb-project-files` (separate from `agb-media` which is reserved for WA voice notes per `lib/wa-agent/media/store.ts`). Object paths follow `{workspace_id}/{project_id}/{ulid}-{slug(original_filename)}`.
**Recommendation:** Single bucket + path namespacing chosen over bucket-per-workspace because:
1. Supabase bucket count is soft-capped and creating per-workspace buckets requires elevated ops.
2. RLS policies on the `storage.objects` table can match `(storage.foldername(name))[1] = workspace_id` cleanly.
3. Easier global storage-usage reporting (one bucket to query).
**Acceptance:**
- **GIVEN** Step 2 ships, **THEN** bucket `agb-project-files` exists, set to `private` (no public read), with RLS policies that allow read/insert/delete only when `workspace_members.user_id = auth.uid()` AND the object path's first segment matches a workspace the user belongs to
- **GIVEN** a file is uploaded, **THEN** the object path matches the regex `^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9A-HJKMNP-TV-Z]{26}-[a-z0-9-]+\.[a-z0-9]+$`
- **GIVEN** an admin reviews bucket layout, **THEN** no file lives at the bucket root or outside a `{workspace_id}/{project_id}/` prefix
**Deps:** FR-DOC-13
**Task:** TASK-AGB-610

---

### FR-DOC-15 · Allow-list of MIME types and extensions (MUST when Step 2 ships, Phase 1.5)
**Capability:** Only a fixed allow-list of file types accepted. Reject everything else at the server action before any storage write.
**Recommendation:** Allow-list (not deny-list) — safer default. Curated v1 list below.
**Allow-list (file extension → expected MIME):**
- `.pdf` → `application/pdf`
- `.docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `.xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `.pptx` → `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- `.png` → `image/png`
- `.jpg` / `.jpeg` → `image/jpeg`
- `.webp` → `image/webp`
- `.gif` → `image/gif`
- `.txt` → `text/plain`
- `.md` → `text/markdown` or `text/plain`
- `.csv` → `text/csv`
**Acceptance:**
- **GIVEN** the user picks `report.pdf`, **THEN** the upload proceeds
- **GIVEN** the user picks `installer.exe`, **THEN** the modal rejects before upload with "File type not allowed. Allowed: PDF, Office docs, images, text."
- **GIVEN** an extension-MIME mismatch (e.g., file claims `image/png` but the binary magic bytes say it's a PE executable), **THEN** the server action rejects after sniffing the first 12 bytes (using `file-type` npm package or equivalent)
- **The allow-list lives in `lib/project-files/allowed-types.ts` — single source of truth used by client validation, server-action validation, and the `accept` attribute of the file input.**
**Deps:** FR-DOC-13
**Task:** TASK-AGB-610

---

### FR-DOC-16 · Max file size (MUST when Step 2 ships, Phase 1.5)
**Capability:** Per-file size cap.
**Recommendation:** **25 MB per file** for v1. Rationale:
- Founder use cases (signed contracts, decks, screenshots, single-image OCR scans) typically <10 MB.
- Vercel serverless function payload limit is 4.5 MB if uploads route through the function; therefore uploads MUST use Supabase Storage's direct upload via signed URL (browser → Supabase, not browser → Vercel → Supabase). With direct upload, 25 MB is comfortable.
- 100 MB invites scope creep into "share large video" which is out of scope for a CRM.
**Acceptance:**
- **GIVEN** a 24 MB PDF, **THEN** upload succeeds
- **GIVEN** a 26 MB file, **THEN** the modal rejects before upload starts with "File too large (max 25 MB)"
- **GIVEN** the user tries to bypass by editing the size check in DevTools, **THEN** the server-issued signed URL also enforces the cap (Supabase Storage policy: `bucket.file_size_limit = 26214400`)
- **The cap is configurable via env `PROJECT_FILES_MAX_BYTES` defaulting to 26214400 — surfaced in `lib/project-files/limits.ts`.**
**Deps:** FR-DOC-13, FR-DOC-14
**Task:** TASK-AGB-610

---

### FR-DOC-17 · File row in Links section (MUST when Step 2 ships, Phase 1.5)
**Capability:** Uploaded files render in the same Links section as URL links, in the same category buckets, distinguished by: a download icon (vs external-link icon), file-size suffix, MIME-derived file-type chip, and an "uploaded by {name}" attribution.
**Acceptance:**
- **GIVEN** a file link with `kind='file'`, `original_filename='Q3-deck.pdf'`, `size_bytes=2097152`, **THEN** the row renders: PDF file-type chip, label, `2.0 MB` suffix, `uploaded by Tomas · 3d ago`, and a download icon (not external-link icon)
- **GIVEN** a URL link with `kind='link'`, **THEN** the row renders the existing layout from `link-section.tsx` with the external-link icon
- **GIVEN** both kinds are present in the same category, **THEN** sort_order determines order — file vs link does not (they interleave)
**Deps:** FR-DOC-13, existing `link-section.tsx` (must extend)
**Task:** TASK-AGB-611

---

### FR-DOC-18 · Download / open file (MUST when Step 2 ships, Phase 1.5)
**Capability:** Clicking a file row generates a short-lived signed URL via the server action and opens it in a new tab. The browser decides whether to render inline (PDF, image) or download (Office docs).
**Recommendation: 1-hour signed-URL TTL.** Rationale:
- 1 hour balances UX (user opens, reads, returns) and security (link can't be forever-shared by accident).
- Longer (7 days) means a leaked URL in a Slack thread stays exploitable too long.
- "Permanent" would require public bucket — disqualified by the private-bucket NFR.
- The signed URL is generated on click, not on page load, so passive bots can't harvest URLs from the rendered DOM.
**Acceptance:**
- **GIVEN** a file row, **WHEN** the user clicks it, **THEN** the server action `getFileSignedUrl(linkId)` is called, returns a URL with `expires_in = 3600` seconds, and the browser opens it in a new tab
- **GIVEN** the URL expires and the user reloads the tab, **THEN** they get a Supabase 403 — UX recommendation: tab title hints "Link expired — close this tab and re-open from CRM"
- **GIVEN** the user is no longer a member of the workspace, **WHEN** they click a file row, **THEN** the server action returns 403 (RLS check)
- **GIVEN** the file does not exist in Storage (orphaned DB row), **THEN** the server action returns 404 with message "File missing — please re-upload" and writes an alert to `project_link_audits` (`action='file_missing'`)
**Deps:** FR-DOC-13, FR-DOC-14
**Task:** TASK-AGB-611

---

### FR-DOC-19 · Delete file (MUST when Step 2 ships, Phase 1.5)
**Capability:** Delete removes both the `project_links` row AND the Storage object. Failure to delete the storage object after row deletion does NOT roll back the row (the row delete is authoritative; orphan blobs are reaped by a periodic job).
**Recommendation: No versioning in v1.** If the user wants a new version, they upload a new file as a fresh row. Simpler mental model; Supabase Storage has no native row-by-row versioning that's worth the complexity here.
**Acceptance:**
- **GIVEN** a file link L with `storage_path = P`, **WHEN** the Founder confirms delete, **THEN** the server action: (1) writes audit row with `before` snapshot, (2) deletes `project_links` row in same transaction, (3) calls Supabase `storage.from('agb-project-files').remove([P])` — if remove fails, log to `project_link_audits.action='storage_orphan'` for the reaper job
- **GIVEN** a nightly reaper job runs, **THEN** it lists Storage objects under each workspace prefix, cross-references against `project_links.storage_path`, and deletes any object older than 24h with no matching row
**Deps:** FR-DOC-13, FR-DOC-11
**Task:** TASK-AGB-612

---

### FR-DOC-20 · Drag-and-drop upload (SHOULD, Phase 1.5)
**Capability:** Dragging a file (or multiple files) onto the Project detail page triggers the upload flow. Each dropped file opens a confirmation slot in a stacked upload tray (label editable, category auto-detected from filename, "Upload all" button).
**Acceptance:**
- **GIVEN** the user drags `signed-contract.pdf` over `/projects/{id}`, **THEN** a drop zone overlay appears with a dashed border and "Drop files to upload"
- **GIVEN** 3 files are dropped at once, **THEN** the tray shows 3 stacked rows, each with editable label and category, and an "Upload all" button
- **GIVEN** any file violates the allow-list or size cap, **THEN** that row shows an error inline and is excluded from "Upload all"; valid files still upload
- **GIVEN** the user navigates away mid-upload, **THEN** in-flight uploads continue (they're direct browser → Supabase) but the UI loses the tray; on return, the new rows are visible because the DB is updated as each completes
**Deps:** FR-DOC-13, FR-DOC-15, FR-DOC-16
**Task:** TASK-AGB-613

---

### FR-DOC-21 · Virus scanning (COULD, Phase 6)
**Capability:** Uploaded files are scanned for malware before becoming downloadable. Scan-pending files render with a "Scanning…" badge; failed-scan files are quarantined and reported.
**Recommendation:** **Defer to Phase 6 / "when the team grows past 3 members or when the CRM ingests files from external contacts."** For v1 (1-2 known founders uploading), the threat model is low. ClamAV via a Supabase Edge Function or a third-party API (VirusTotal, Sublime Security) would add latency, cost, and ops surface for marginal v1 benefit.
**Trigger thresholds for revisiting:**
- Workspace grows to ≥4 members, OR
- Files are uploaded by anyone other than the two founders (e.g., a member role with broader write), OR
- A regulated client requires SOC 2 readiness
**Acceptance (when implemented):**
- **GIVEN** scanning is enabled, **WHEN** a file is uploaded, **THEN** `project_links.scan_status` (new column added at that time) defaults to `'pending'`; download is blocked until status flips to `'clean'`
- **GIVEN** scan returns `'malicious'`, **THEN** the row is marked, the storage object is moved to a quarantine prefix, and the founder is notified via WhatsApp
**Deps:** FR-DOC-13
**Task:** TASK-AGB-700 (Phase 6, deferred)

---

### FR-DOC-22 · Workspace deletion cascades to Storage (MUST when Step 2 ships, Phase 1.5)
**Capability:** When a workspace is deleted (rare admin op), all associated Storage objects under its prefix are deleted alongside the cascade of `project_links` rows.
**Acceptance:**
- **GIVEN** workspace W is deleted via admin server action (`deleteWorkspace(W.id)`), **THEN** the action first lists all objects under `agb-project-files/{W.id}/`, calls `storage.from('agb-project-files').remove(paths)` in batches of 100, then deletes the workspace row (DB cascade removes `project_links`)
- **GIVEN** the storage cleanup partially fails (some objects remain), **THEN** the workspace deletion still proceeds, and the orphans are logged for the reaper job (FR-DOC-19's orphan handler)
- **The admin server action `deleteWorkspace` does not yet exist; this FR specifies its contract when it ships. Until then, workspaces are never deleted in practice — manual ops via SQL + Supabase Studio.**
**Deps:** FR-DOC-13, FR-DOC-14, FR-DOC-19
**Task:** TASK-AGB-614

---

## §16 — Non-Functional Requirements (9 NFRs)

| ID | Category | One-line | Tested by |
|----|----------|----------|-----------|
| NFR-DOC-PERF-1 | Performance | Add-link modal submit → row visible on page ≤500ms p95 (excluding network RTT to Supabase) | e2e timing |
| NFR-DOC-PERF-2 | Performance | File upload progress visible within 200ms of file selection; direct browser→Supabase Storage path (NOT via Vercel function) | e2e + manual |
| NFR-DOC-PERF-3 | Performance | Project detail page with 100 links renders ≤1s p95 | Lighthouse CI |
| NFR-DOC-SEC-1 | Security | RLS policies on `project_links` and `storage.objects` enforce workspace isolation. Server actions check permission BEFORE touching DB. Defense in depth — both layers tested. | RLS test + integration test |
| NFR-DOC-SEC-2 | Security | Signed URLs for file downloads use TTL ≤1h. Signed URLs are never logged to Sentry/server logs (filter middleware). | Code review + log review |
| NFR-DOC-SEC-3 | Security | URL field validates HTTPS scheme; JavaScript `javascript:`, `data:`, `file:` URLs rejected at form layer AND server action. | Unit test on validator |
| NFR-DOC-A11Y-1 | Accessibility | Add-link modal: focus trap, Escape to close, autofocus on URL field, all fields labeled, errors announced via `aria-live="polite"` | axe + manual screen reader |
| NFR-DOC-A11Y-2 | Accessibility | Drag-to-reorder has a keyboard equivalent (focus row → Space to lift → Arrow Up/Down → Space to drop), per WAI-ARIA Authoring Practices | Manual keyboard test |
| NFR-DOC-OBS-1 | Observability | Every link create/update/delete writes a `project_link_audits` row (FR-DOC-11). File operations additionally emit a structured log line `{event: 'file.upload\|download\|delete', workspace_id, project_id, link_id, size_bytes, mime}` to Sentry breadcrumb (not full event). | Code review |

---

## §17 — Open Questions (founder-call gate)

Each question has a recommendation already adopted in the FRs above; the founder either confirms or overrides. Implementation can proceed assuming the recommendation.

| # | Question | Blocks | Recommendation (adopted unless overridden) |
|---|----------|--------|--------------------------------------------|
| 1 | OG / oEmbed scrape on save to auto-fill label with the real document title? | FR-DOC-3 | **NO for v1.** Adds 300-1500ms latency to save, requires server-side fetch (egress + auth-gated URLs that 401 the server but work for the user). Hostname-brand heuristic is good enough. Revisit if founder consistently re-edits labels manually. |
| 2 | Permission model: who can add/edit/delete project links? | FR-DOC-9 | **`member` creates + edits own; `admin`/`owner` edits all. Read is open to all workspace members.** Matches founder's gut and the principle "founders own, members contribute, audit captures everything." |
| 3 | URL validation: well-formedness only, or HEAD-ping to verify reachability? | FR-DOC-1 | **Well-formedness only (`new URL()` + scheme check).** HEAD-ping adds latency, fails on auth-gated docs (Google Docs returns 401 to anonymous HEAD), and gives false confidence. The "is this still a live doc?" question belongs to a separate background link-health job (out of scope v1). |
| 4 | Existing 134 `url=null` rows: migrate to notes, hide, or leave? | FR-DOC-1 | **Leave as-is; render as "note" rows with no click affordance.** Add a `kind = 'note'` value when Step 2 ships (extend the CHECK constraint) so the data model stays clean. Founder can manually upgrade notes to links by editing and adding a URL. Auto-migration risks losing freeform context the founder typed yesterday. |
| 5 | Storage bucket layout: per-workspace bucket vs single bucket with path namespacing? | FR-DOC-14 | **Single bucket `agb-project-files`, path-namespaced.** Simpler RLS, simpler usage reporting, no Supabase bucket-count ceiling concerns. |
| 6 | Max file size? | FR-DOC-16 | **25 MB.** Covers signed contracts, decks, screenshots. Anything larger is probably the wrong product. |
| 7 | Signed-URL TTL? | FR-DOC-18 | **1 hour.** Balanced default. URL is generated on click, not on page load. |
| 8 | Versioning on file replace? | FR-DOC-19 | **No versioning in v1.** New upload = new row. Simpler. |
| 9 | Virus scanning? | FR-DOC-21 | **Deferred to Phase 6.** Threshold to revisit: team grows past 3 members OR external contacts can upload OR SOC 2 needed. |
| 10 | Storage cost monitoring (Pro plan included quota dashboard)? | — | **Out of scope for this feature.** Add an admin dashboard FR in a separate slice if quota becomes a concern (Supabase Pro includes 100 GB; founder is unlikely to approach that with 1-5 users + 25 MB cap). |
| 11 | WhatsApp `attach_link` tool — ship in Step 1 or Step 2? | FR-DOC-12 | **Phase 1.5 — after Step 1 web UI ships and stabilizes.** WA tool reuses the same server action; no rush to parallelize. |
| 12 | Workspace deletion: cascade storage now or accept orphans? | FR-DOC-22 | **Cascade.** Implemented as part of Step 2 because that's when orphans become possible. Until then, workspaces are never deleted in practice. |

---

## §18 — Out of Scope (v1)

Explicitly NOT in this slice. Each becomes a fresh FR if/when requested.

- Real-time collaborative editing of linked documents (we link to external services that handle this).
- Version history on links or files (replace = new row, see FR-DOC-19).
- Comments / discussion threads on individual links.
- Link health checking (broken-URL detection background job).
- Public sharing of links / files outside the workspace.
- Folders / nested categories beyond the existing flat enum (`business/marketing/tech/ops/design/finance/other`).
- Search within file contents (no PDF/Office content indexing).
- Inline preview / thumbnail rendering of files in the Links section (Step 2 shows file-type chip only; click to open).
- OG / oEmbed scraping of URL titles (see Open Q1).
- Bulk import of links from CSV / Notion / etc.
- E-signature integration (signed contracts are uploaded as static PDFs).
- File expiry / auto-delete after N days.
- Tagging links with arbitrary labels beyond the category enum.
- Mobile-native app upload (responsive web only; PWA install path is fine).

---

## §19 — Implementation Hints

Map of files the implementing agent will touch. Read before writing.

### Step 1 (URL-only links)

| Touch | Reason |
|-------|--------|
| `db/schema.ts:415-433` | Add columns: `created_by uuid NOT NULL`, `updated_at timestamptz`, `updated_by uuid`. (`kind`, `storage_path`, `mime_type`, `size_bytes`, `original_filename` — defer to Step 2.) |
| New migration `supabase/migrations/2026052700000X_project_links_audit_and_authorship.sql` | Schema changes + new `project_link_audits` table + RLS policies for both. Extends the existing RLS migration. |
| `db/queries/projects.ts` | Add `createProjectLink`, `updateProjectLink`, `deleteProjectLink`, `reorderProjectLinks`, `getProjectLinkAudit` query functions. Each takes `(actorId, workspaceId, …)` and writes audit rows. |
| `app/(app)/projects/[id]/actions.ts` (new file — directory exists at `app/(app)/projects/[id]/edit/`) | Server actions: `createLinkAction`, `updateLinkAction`, `deleteLinkAction`, `reorderLinksAction`. Each: (1) auth via Supabase, (2) role check via `workspace_members`, (3) Zod parse, (4) call db/queries function, (5) `revalidatePath`. |
| `components/projects/link-section.tsx` | Extend to render edit/delete affordances per row, hover-vs-mobile behavior. Wire to actions via `useTransition`. |
| `components/projects/add-link-modal.tsx` (new) | The add/edit modal. Form via `react-hook-form` + `zod`. Submit handler calls the server action; optimistic insert via SWR/cache. |
| `lib/project-links/detect-category.ts` (new) | Pure function `detectCategory(url: string): LinkCategory`. Unit-tested. |
| `lib/project-links/host-brands.ts` (new) | `{ hostPattern: RegExp, brand: string }[]` table for FR-DOC-3 label auto-fill and FR-DOC-10 badges. |
| `lib/project-links/validate.ts` (new) | URL well-formedness + scheme check (FR-DOC-1, NFR-DOC-SEC-3). |
| `app/(app)/projects/[id]/page.tsx` | Pass `currentUserId` and `currentUserRole` into `<LinkSection>` so it can render permission-gated affordances (FR-DOC-9). |
| Tests | Vitest specs alongside each new lib; Playwright e2e for the modal flow; SQL test for RLS denial. |

### Step 2 (file uploads)

| Touch | Reason |
|-------|--------|
| Migration `2026XXXXXXXXX_project_links_files.sql` | Adds `kind`, `storage_path`, `mime_type`, `size_bytes`, `original_filename`, the `link_or_file_consistency` CHECK constraint, and creates the `agb-project-files` Storage bucket via Supabase SQL (`storage.create_bucket(...)`). RLS policies on `storage.objects` for the new bucket. |
| `lib/project-files/allowed-types.ts` (new) | Extension+MIME allow-list table. Used client + server. |
| `lib/project-files/limits.ts` (new) | Size cap from env, default 25 MB. |
| `lib/project-files/storage.ts` (new) | `getUploadSignedUrl({workspaceId, projectId, filename})` and `getDownloadSignedUrl(linkId, ttl=3600)`. Sniff magic bytes server-side using `file-type` npm. |
| `app/(app)/projects/[id]/actions.ts` | Add `requestFileUploadAction` (returns signed upload URL + metadata) and `confirmFileUploadAction` (inserts row after browser confirms successful upload). Two-phase so we never insert a row for a failed upload. |
| `components/projects/add-link-modal.tsx` | Add "Upload file" tab. Direct-upload via `fetch(signedUrl, { method: 'PUT' })`. Progress via `XMLHttpRequest` (fetch can't report progress reliably). |
| `components/projects/file-drop-zone.tsx` (new) | The drag-overlay + upload tray (FR-DOC-20). |
| `components/projects/link-section.tsx` | Render `kind='file'` rows with download icon, size suffix, attribution, MIME chip. |
| `scripts/reaper-orphan-blobs.ts` (new — nightly cron via Vercel cron or Supabase scheduled function) | Reaps orphaned Storage objects per FR-DOC-19. |
| Tests | Allow-list unit tests; e2e upload happy + rejection paths; RLS test for cross-workspace download denial; orphan reaper integration test. |

### WhatsApp tool

| Touch | Reason |
|-------|--------|
| `lib/wa-agent/tools/attach-link.ts` (new) | Mirrors `log-touch.ts` / `upsert-note.ts` shape. Reuses `lib/project-links/detect-category.ts`. |
| `lib/wa-agent/tools/index.ts` | Register `attach_link` in the tool registry. |

---

## §20 — Traceability

| FR | Maps to (existing) | Test ID prefix |
|----|--------------------|---------------|
| FR-DOC-1..11 | FR-PRJ-1 (Project entity), FR-WSP-2 (workspace scoping), FR-CON-5 audit pattern | `test/project-links/*.spec.ts` |
| FR-DOC-12 | FR-CAP-3 (WhatsApp commands), existing `lib/wa-agent/tools/` registry | `test/wa-agent/attach-link.spec.ts` |
| FR-DOC-13..20 | FR-DOC-1..11 (reuses surface), Supabase Storage | `test/project-files/*.spec.ts` |
| FR-DOC-21 | Deferred — no current tests | — |
| FR-DOC-22 | Future admin server action | — |
| NFR-DOC-SEC-1 | RLS migration `20260526120000_rls_owner_policies.sql` | `test/rls/project_links.sql` |
| NFR-DOC-A11Y-* | New | `test/a11y/add-link-modal.spec.ts` |

---

## §21 — Validation Self-Score

| Dimension | Score | Note |
|-----------|-------|------|
| Density | 9 | Capability format, recommendations as one-liners, no filler |
| Implementation-free | 8 | Some mechanism leakage in §19 implementation hints (intentional — reader contract is "start coding"). FRs themselves stay capability-level. |
| Traceability | 10 | Every FR cites source, deps, task; §20 maps to existing matrix |
| Measurability | 9 | Every FR has Given/When/Then ACs; data-layer + UI + observability ACs included per founder's request |
| SMART | 9 | All ACs testable; size caps, TTLs, regex specified |
| Completeness | 9 | 22 FRs + 9 NFRs cover URL + file paths; 12 open questions enumerated with recommendations |
| Actor coverage | 9 | Founder + Member (with role distinction) + Admin/Owner |
| Independence | 9 | Each FR self-contained; cross-refs limited to entity model + the few that genuinely build on prior FRs (e.g., FR-DOC-8 depends on FR-DOC-4 + FR-DOC-5) |

**Composite: 9.0 / 10 — EXCELLENT.** Ready for `/goal`-style execution. Implementing agent should not need to re-prompt on scope unless an Open Question is overridden.

---

## §22 — Suggested Task Numbering

Reserve `TASK-AGB-6xx` for this slice so it does not collide with the existing FR-MATRIX numbering.

| Task | Covers | Step |
|------|--------|------|
| TASK-AGB-601 | Add-link modal + create action + smart category + label autofill (FR-DOC-1, 2, 3, 7, 10) | Step 1 |
| TASK-AGB-602 | Edit + delete + row affordances (FR-DOC-4, 5, 8) | Step 1 |
| TASK-AGB-603 | Reorder drag-and-drop with keyboard parity (FR-DOC-6, NFR-DOC-A11Y-2) | Step 1 |
| TASK-AGB-604 | Permission model + RLS extension (FR-DOC-9, NFR-DOC-SEC-1) | Step 1 |
| TASK-AGB-605 | Audit table + audit writes on every mutation (FR-DOC-11, NFR-DOC-OBS-1) | Step 1 |
| TASK-AGB-606 | WhatsApp `attach_link` tool (FR-DOC-12) | Step 1.5 |
| TASK-AGB-610 | Storage bucket + schema extension + upload action + allow-list + size cap (FR-DOC-13, 14, 15, 16) | Step 2 |
| TASK-AGB-611 | File row rendering + signed-URL download (FR-DOC-17, 18) | Step 2 |
| TASK-AGB-612 | File delete + orphan reaper (FR-DOC-19) | Step 2 |
| TASK-AGB-613 | Drag-and-drop upload (FR-DOC-20) | Step 2 |
| TASK-AGB-614 | Workspace deletion cascade to Storage (FR-DOC-22) | Step 2 |
| TASK-AGB-700 | Virus scanning (FR-DOC-21) | Phase 6 / deferred |
