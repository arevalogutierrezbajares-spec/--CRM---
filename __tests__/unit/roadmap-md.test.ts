import { describe, expect, it } from "vitest";
import {
  buildCopyForAiPayload,
  diffRoadmap,
  generateRoadmapMd,
  parseRoadmapMd,
  tokenFor,
  type RoadmapSnapshot,
  type RoadmapTaskNode,
} from "@/lib/roadmap-md";

/* ─── Fixtures ────────────────────────────────────────────────────────── */

const ID_INIT = "8f3a2b4c-1d5e-4f6a-8b9c-0d1e2f3a4b5c";
const ID_TASK1 = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d";
const ID_TASK2 = "c3d4e5f6-a1b2-4c5d-8e9f-0a1b2c3d4e5f";
const ID_CHILD = "e5f6a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b";

function task(id: string, title: string, extra: Partial<RoadmapTaskNode> = {}): RoadmapTaskNode {
  return {
    id,
    token: null,
    title,
    done: false,
    ownerHandle: null,
    dueDate: null,
    children: [],
    ...extra,
  };
}

function snapshot(): RoadmapSnapshot {
  return {
    initiatives: [
      {
        id: ID_INIT,
        token: null,
        title: "Launch booking flow",
        ownerHandle: "tomas",
        status: "active",
        health: "green",
        startDate: "2026-06-01",
        targetEndDate: "2026-08-31",
        successCriteria: "3 paying posadas live",
        goal: "Revenue from day one",
        tasks: [
          task(ID_TASK1, "Build checkout", {
            ownerHandle: "tomas",
            dueDate: "2026-07-01",
            children: [task(ID_CHILD, "Stripe wiring", { done: true })],
          }),
          task(ID_TASK2, "QA pass"),
        ],
      },
    ],
  };
}

const KNOWN = new Set(["tomas", "jeav"]);

/* ─── Round-trip identity (NFR-R6, FR-RMD-1) ──────────────────────────── */

describe("round-trip identity", () => {
  it("export → unmodified re-import proposes zero changes", () => {
    const current = snapshot();
    const md = generateRoadmapMd(current, { planVersion: 7 });
    const parsed = parseRoadmapMd(md);
    expect(parsed.basePlanVersion).toBe(7);
    expect(parsed.issues).toHaveLength(0);
    const diff = diffRoadmap(parsed, current, current, KNOWN);
    expect(diff.changes).toHaveLength(0);
    expect(diff.unknownOwners).toHaveLength(0);
    expect(diff.unmatchedTokens).toHaveLength(0);
  });

  it("tokens are short opaque prefixes, never full UUIDs (NFR-R3)", () => {
    const md = generateRoadmapMd(snapshot(), { planVersion: 1 });
    expect(md).not.toContain(ID_INIT);
    expect(md).toContain(`agb:in_${tokenFor(ID_INIT)}`);
    expect(tokenFor(ID_INIT)).toHaveLength(12);
  });

  it("status-report flavor omits ID markers (FR-SHR-2 groundwork)", () => {
    const md = generateRoadmapMd(snapshot(), { planVersion: 1, includeIds: false });
    expect(md).not.toContain("agb:");
  });
});

/* ─── Parser (FR-RMD-11) ──────────────────────────────────────────────── */

describe("forgiving parser", () => {
  it("parses a minimal hand-written doc — only titles required", () => {
    const parsed = parseRoadmapMd(
      ["## My initiative", "- [ ] First task", "- [x] Second task"].join("\n"),
    );
    expect(parsed.initiatives).toHaveLength(1);
    expect(parsed.initiatives[0].title).toBe("My initiative");
    expect(parsed.initiatives[0].tasks).toHaveLength(2);
    expect(parsed.initiatives[0].tasks[1].done).toBe(true);
  });

  it("never throws on arbitrary text (NFR-R7)", () => {
    const parsed = parseRoadmapMd("just some prose\n\nnothing roadmap about it\n# title");
    expect(parsed.initiatives).toHaveLength(0);
  });

  it("reports unparseable lines with line numbers without aborting", () => {
    const parsed = parseRoadmapMd(
      [
        "## Init A",
        "- Owner: @tomas",
        "- Wattage: 9000", // unknown metadata
        "- [ ] Good task",
        "- [broken checkbox",
      ].join("\n"),
    );
    expect(parsed.initiatives[0].tasks).toHaveLength(1);
    expect(parsed.issues.some((i) => i.line === 3)).toBe(true);
    expect(parsed.issues.some((i) => i.line === 5)).toBe(true);
  });

  it("parses inline owner + due and initiative metadata", () => {
    const parsed = parseRoadmapMd(
      [
        "## Init A",
        "- Owner: @jeav",
        "- Status: paused",
        "- Health: amber",
        "- Dates: 2026-07-01 → 2026-09-30",
        "- Success: it works",
        "",
        "- [ ] Task one @tomas due:2026-07-15",
      ].join("\n"),
    );
    const init = parsed.initiatives[0];
    expect(init.ownerHandle).toBe("jeav");
    expect(init.status).toBe("paused");
    expect(init.health).toBe("amber");
    expect(init.startDate).toBe("2026-07-01");
    expect(init.targetEndDate).toBe("2026-09-30");
    expect(init.successCriteria).toBe("it works");
    expect(init.tasks[0].ownerHandle).toBe("tomas");
    expect(init.tasks[0].dueDate).toBe("2026-07-15");
    expect(init.tasks[0].title).toBe("Task one");
  });

  it("nests children by indentation, clamping depth > 2", () => {
    const parsed = parseRoadmapMd(
      [
        "## Init A",
        "- [ ] Parent",
        "  - [ ] Child",
        "    - [ ] Grandchild",
        "      - [ ] Too deep",
      ].join("\n"),
    );
    const parent = parsed.initiatives[0].tasks[0];
    expect(parent.children).toHaveLength(1);
    // Grandchild keeps its place; Too-deep is clamped to depth 2 → becomes
    // Grandchild's sibling under Child.
    const child = parent.children[0];
    expect(child.children.map((c) => c.title)).toEqual(["Grandchild", "Too deep"]);
    expect(parsed.issues.some((i) => i.message.includes("deeper than 2"))).toBe(true);
  });
});

/* ─── Differ (FR-RMD-4..10) ───────────────────────────────────────────── */

describe("differ", () => {
  it("ID-matched rename is an update, not create+archive (FR-RMD-5)", () => {
    const current = snapshot();
    const md = generateRoadmapMd(current, { planVersion: 7 });
    const edited = md.replace("Build checkout", "Build checkout v2");
    const diff = diffRoadmap(parseRoadmapMd(edited), current, current, KNOWN);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].changeType).toBe("update");
    expect(diff.changes[0].fields?.[0]).toMatchObject({
      field: "title",
      to: "Build checkout v2",
    });
  });

  it("new heading without ID is a create; missing entity is an unchecked archive proposal (FR-RMD-10)", () => {
    const current = snapshot();
    const md = generateRoadmapMd(current, { planVersion: 7 });
    const edited =
      md.replace(/- \[ \] QA pass.*\n/, "") + "\n## Brand refresh\n- [ ] New logo\n";
    const diff = diffRoadmap(parseRoadmapMd(edited), current, current, KNOWN);
    const create = diff.changes.find((c) => c.changeType === "create");
    const archive = diff.changes.find((c) => c.changeType === "archive");
    expect(create?.kind).toBe("initiative");
    expect(create?.defaultAccepted).toBe(true);
    expect(archive?.title).toBe("QA pass");
    expect(archive?.defaultAccepted).toBe(false);
  });

  it("AI-stripped IDs fall back to probable-update requiring confirmation (FR-RMD-6)", () => {
    const current = snapshot();
    const md = generateRoadmapMd(current, { planVersion: 7 });
    const stripped = md.replace(/\s*<!--\s*agb:[^>]*-->/g, "");
    const edited = stripped.replace("- Health: green", "- Health: red");
    const diff = diffRoadmap(parseRoadmapMd(edited), current, current, KNOWN);
    const probable = diff.changes.find((c) => c.changeType === "probable-update");
    expect(probable).toBeDefined();
    expect(probable?.defaultAccepted).toBe(false);
    // No creates/archives — everything matched by title
    expect(diff.changes.some((c) => c.changeType === "create")).toBe(false);
    expect(diff.changes.some((c) => c.changeType === "archive")).toBe(false);
  });

  it("unknown agb: token is flagged and skipped, never created (FR-RMD-5)", () => {
    const current = snapshot();
    const doc = ["## Ghost initiative <!-- agb:in_deadbeef0000 -->", "- [ ] task"].join("\n");
    const diff = diffRoadmap(parseRoadmapMd(doc), current, null, KNOWN);
    expect(diff.unmatchedTokens).toContain("in_deadbeef0000");
    expect(diff.changes.filter((c) => c.changeType === "create")).toHaveLength(0);
  });

  it("3-way merge: CRM-changed + file-changed field is a conflict; CRM-only change is skipped (FR-RMD-7/8)", () => {
    const base = snapshot();
    const md = generateRoadmapMd(base, { planVersion: 7 });

    // CRM moved on since the export…
    const current = snapshot();
    current.initiatives[0].targetEndDate = "2026-09-15"; // CRM changed
    current.initiatives[0].health = "amber"; // CRM changed

    // …and the file changed one of the same fields differently,
    // while still saying what base said for the other.
    const edited = md.replace("2026-06-01 → 2026-08-31", "2026-06-01 → 2026-10-31");

    const diff = diffRoadmap(parseRoadmapMd(edited), current, base, KNOWN);
    const initChange = diff.changes.find((c) => c.kind === "initiative");
    const dateField = initChange?.fields?.find((f) => f.field === "targetEndDate");
    expect(dateField?.conflict).toBeDefined();
    expect(dateField?.from).toBe("2026-09-15"); // CRM value (preselected by UI)
    expect(dateField?.to).toBe("2026-10-31"); // file value (opt-in)
    // health: file still says base's "green"; CRM changed to amber → no change row
    expect(initChange?.fields?.some((f) => f.field === "health")).toBe(false);
  });

  it("checkbox flip maps to the done field (FR-UNI-1 semantics)", () => {
    const current = snapshot();
    const md = generateRoadmapMd(current, { planVersion: 7 });
    const edited = md.replace("- [ ] QA pass", "- [x] QA pass");
    const diff = diffRoadmap(parseRoadmapMd(edited), current, current, KNOWN);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].fields?.[0]).toMatchObject({ field: "done", to: true });
  });

  it("unknown owners are surfaced (FR-RMD-12)", () => {
    const current = snapshot();
    const doc = ["## New thing", "- Owner: @stranger", "- [ ] task @nobody"].join("\n");
    const diff = diffRoadmap(parseRoadmapMd(doc), current, null, KNOWN);
    expect(diff.unknownOwners.sort()).toEqual(["nobody", "stranger"]);
  });

  it("file absence of optional metadata is not a change (stale-safe)", () => {
    const current = snapshot();
    // Hand-written doc that matches by token but omits all metadata lines
    const doc = [
      `## Launch booking flow <!-- agb:in_${tokenFor(ID_INIT)} -->`,
      `- [ ] Build checkout @tomas due:2026-07-01 <!-- agb:ms_${tokenFor(ID_TASK1)} -->`,
      `  - [x] Stripe wiring <!-- agb:ms_${tokenFor(ID_CHILD)} -->`,
      `- [ ] QA pass <!-- agb:ms_${tokenFor(ID_TASK2)} -->`,
    ].join("\n");
    const diff = diffRoadmap(parseRoadmapMd(doc), current, null, KNOWN);
    expect(diff.changes).toHaveLength(0);
  });
});

/* ─── Copy for AI (FR-RMD-2) ──────────────────────────────────────────── */

describe("copy for AI", () => {
  it("payload bundles instructions + spec + export in one paste", () => {
    const md = generateRoadmapMd(snapshot(), { planVersion: 3 });
    const payload = buildCopyForAiPayload(md);
    expect(payload).toContain("FORMAT SPEC");
    expect(payload).toContain("PRESERVE");
    expect(payload).toContain("plan:v3");
    expect(payload).toContain("Launch booking flow");
  });
});
