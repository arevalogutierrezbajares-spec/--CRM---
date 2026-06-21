# THE BRAIN v0 — Locked Decisions (2026-06-21)

Authoritative answers to the goal's DO-NOT-GUESS questions + scope reconciliation.
Build agents: treat this file as ground truth; it overrides the conservative
defaults in `00-BUILD-PLAN.md`.

## Scope — render ALL 5 systems (goal overrides HLR §9 phasing)

The HLR §9 phases v0 to 3 live systems. The **operator's goal for this task
explicitly requires all 5 systems rendered** ("portfolio: 5 systems + 9
interchange stations", "Handle host-mounted (Restaurants) + planned-from-manifest
(Academy)", acceptance: "renders all 5 systems from a generated brain-graph.json").

**Therefore v0 ships:**
- **VAV, CaneyCloud, AGB-CRM** — first-class live territories (derived from OpenAPI + migrations + routes).
- **Caney Restaurants** — host-mounted territory inside CaneyCloud. `host-mount.mjs` MUST emit real nodes (`system:"restaurants"`, `hosted_by:"caney"`, `source:"host_mount"`) + the `host_mount` interchange edge restaurants→caney. NOT stubbed empty.
- **Caney Academy** — planned/fog-of-war territory. `manifest-source.mjs` MUST emit real nodes (`source:"manifest"`, `state:"needed"`) from the curriculum manifest + the planned interchange edges (`contract_status:"planned"`, `contract_hash:null`). NOT stubbed empty.
- L0 (portfolio) + L1 (system→domains) with focus+context cross-system threads.
- Both axes: **By System** AND **By Function** (the 7-function capability map) + the **Function-overlay lens**.
- Lenses: **Navigation + State** active; Topology/Liveness scaffolded.
- Node detail panel, audience presets, ⌘K palette stub.

## OQ-9 — Academy maps to a **7th `education` function** (NOT folded)

Operator chose to add a dedicated `education` function. Already encoded in
`lib/brain/types.ts` (`Fn` union) and `lib/brain/functions.ts` (`FUNCS`,
`FN_COLOR`, `FN_MAP`). The By-Function capability map shows **7** functions.

## OQ-2 — contract-diff default policy = **`typed-field-red`**

`CONTRACT_DIFF_POLICY` flag defaults to `"typed-field-red"` (warn on contract
hash change; escalate to red only when a typed field referenced by a known
consumer call-site is removed). v0 implements the **interface** and leaves
hashing OFF (`contract_hash: null` everywhere). The typed-field differ is the
v1 implementation behind the same interface. `config.mjs` sets the default flag.

## OQ-4 — cross-repo creds store (v1) = **GitHub Actions secrets**

v0 reads only local clones (no creds). For the v1 CI-wired regen, read-only
tokens for the 3 source repos + VAV Supabase service-role live in **GitHub
Actions repo/org secrets**, injected at regen time, **never serialized into
brain-graph.json** (NFR-SEC-4). `scripts/brain/config.mjs` documents this with a
`// TODO OQ-4` flag and a `CREDS` placeholder read from env.
