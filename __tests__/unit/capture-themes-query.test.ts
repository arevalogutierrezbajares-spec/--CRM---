import { describe, expect, it, vi, beforeEach } from "vitest";

// Query-logic tests: mock the drizzle db + operators so we exercise the REAL
// slug-grouping / per-call merge / rollup / ordering logic against canned rows.
// slugifyThemeLabel stays REAL (it is a pure helper with no db imports), so the
// key↔label join is tested exactly as it runs in production.

// Each db.select() returns a chainable thenable that resolves to `nextRows`.
let nextRows: unknown[] = [];
// Records the (arg1, arg2) pairs passed to eq() so we can assert workspace fencing.
const eqCalls: [unknown, unknown][] = [];

function builder(): unknown {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  // Thenable — `await chain` resolves the canned rows, just like a drizzle query.
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(nextRows).then(resolve);
  return chain;
}

vi.mock("@/db", () => ({
  db: { select: () => builder() },
  schema: {
    callThemeFacets: {
      callId: "ctf.callId",
      workspaceId: "ctf.workspaceId",
      callDate: "ctf.callDate",
      noteCount: "ctf.noteCount",
      quoteCount: "ctf.quoteCount",
      flagCount: "ctf.flagCount",
      coverage: "ctf.coverage",
      label: "ctf.label",
    },
    callRecordings: {
      id: "cr.id",
      workspaceId: "cr.workspaceId",
      title: "cr.title",
      themedDoc: "cr.themedDoc",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => {
    eqCalls.push([a, b]);
    return { __eq: [a, b] };
  },
  and: (...conds: unknown[]) => ({ __and: conds }),
  desc: (c: unknown) => ({ __desc: c }),
}));

import {
  getThemeTimeline,
  listWorkspaceThemes,
  getThemeDetail,
} from "@/db/queries/capture-themes";

const WS = "00000000-0000-4000-8000-00000000aaaa";
const CALL_A = "00000000-0000-4000-8000-00000000cc01";
const CALL_B = "00000000-0000-4000-8000-00000000cc02";
const CALL_C = "00000000-0000-4000-8000-00000000cc03";
const d = (s: string) => new Date(s);

beforeEach(() => {
  nextRows = [];
  eqCalls.length = 0;
});

describe("[unit] getThemeTimeline", () => {
  it("orders newest-first, rolls up counts, and computes the coverage distribution", async () => {
    // Rows arrive newest-first (as the SQL orderBy delivers them).
    nextRows = [
      {
        callId: CALL_A,
        callTitle: "Call with Carlos",
        callDate: d("2026-07-22T09:00:00Z"),
        noteCount: 4,
        quoteCount: 2,
        flagCount: 1,
        coverage: "covered",
        label: "Pricing",
      },
      {
        callId: CALL_B,
        callTitle: "Call with Ana",
        callDate: d("2026-07-20T09:00:00Z"),
        noteCount: 1,
        quoteCount: 0,
        flagCount: 0,
        coverage: "gap",
        label: "pricing", // case variant → same slug
      },
      {
        callId: CALL_C,
        callTitle: "Call with Luis",
        callDate: d("2026-07-18T09:00:00Z"),
        noteCount: 2,
        quoteCount: 1,
        flagCount: 0,
        coverage: "covered",
        label: "Pricing!", // punctuation variant → same slug
      },
    ];

    const res = await getThemeTimeline({ workspaceId: WS, key: "pricing" });

    expect(res.key).toBe("pricing");
    expect(res.label).toBe("Pricing"); // most-recent facet's spelling
    expect(res.calls.map((c) => c.callId)).toEqual([CALL_A, CALL_B, CALL_C]);
    expect(res.rollup).toEqual({
      callCount: 3,
      firstSeen: d("2026-07-18T09:00:00Z"),
      lastSeen: d("2026-07-22T09:00:00Z"),
      coverage: { done: 0, covered: 2, gap: 1 },
    });
  });

  it("excludes facets whose label slugs to a different key (only the theme is returned)", async () => {
    nextRows = [
      {
        callId: CALL_A,
        callTitle: "A",
        callDate: d("2026-07-22T09:00:00Z"),
        noteCount: 1,
        quoteCount: 0,
        flagCount: 0,
        coverage: "covered",
        label: "Pricing",
      },
      {
        callId: CALL_B,
        callTitle: "B",
        callDate: d("2026-07-21T09:00:00Z"),
        noteCount: 9,
        quoteCount: 9,
        flagCount: 9,
        coverage: "covered",
        label: "Hiring", // different theme → must not appear under `pricing`
      },
    ];

    const res = await getThemeTimeline({ workspaceId: WS, key: "pricing" });
    expect(res.calls).toHaveLength(1);
    expect(res.calls[0].callId).toBe(CALL_A);
    expect(res.rollup.callCount).toBe(1);
  });

  it("merges multiple slug-colliding facets within one call into a single entry", async () => {
    nextRows = [
      {
        callId: CALL_A,
        callTitle: "A",
        callDate: d("2026-07-22T09:00:00Z"),
        noteCount: 2,
        quoteCount: 1,
        flagCount: 0,
        coverage: "gap",
        label: "Pricing",
      },
      {
        callId: CALL_A, // same call, colliding label
        callTitle: "A",
        callDate: d("2026-07-22T09:00:00Z"),
        noteCount: 3,
        quoteCount: 1,
        flagCount: 1,
        coverage: "covered",
        label: "pricing",
      },
    ];

    const res = await getThemeTimeline({ workspaceId: WS, key: "pricing" });
    expect(res.calls).toHaveLength(1);
    expect(res.calls[0]).toMatchObject({
      callId: CALL_A,
      noteCount: 5,
      quoteCount: 2,
      flagCount: 1,
      coverage: "covered", // best coverage wins
    });
    expect(res.rollup.callCount).toBe(1);
    expect(res.rollup.coverage).toEqual({ done: 0, covered: 1, gap: 0 });
  });

  it("limits the calls array but the rollup still counts every call", async () => {
    nextRows = [CALL_A, CALL_B, CALL_C].map((id, i) => ({
      callId: id,
      callTitle: id,
      callDate: d(`2026-07-2${5 - i}T09:00:00Z`),
      noteCount: 1,
      quoteCount: 0,
      flagCount: 0,
      coverage: "covered",
      label: "Pricing",
    }));

    const res = await getThemeTimeline({ workspaceId: WS, key: "pricing", limit: 2 });
    expect(res.calls).toHaveLength(2);
    expect(res.rollup.callCount).toBe(3);
  });

  it("returns a valid empty timeline when nothing matches", async () => {
    nextRows = [];
    const res = await getThemeTimeline({ workspaceId: WS, key: "ghost" });
    expect(res).toEqual({
      key: "ghost",
      label: null,
      rollup: {
        callCount: 0,
        firstSeen: null,
        lastSeen: null,
        coverage: { done: 0, covered: 0, gap: 0 },
      },
      calls: [],
    });
  });

  it("fences on workspace_id in both the facet filter and the recording join", async () => {
    nextRows = [];
    await getThemeTimeline({ workspaceId: WS, key: "pricing" });
    // The facet table and the joined recording are both constrained to WS, so a
    // facet from another workspace can never be returned.
    expect(eqCalls).toContainEqual(["ctf.workspaceId", WS]);
    expect(eqCalls).toContainEqual(["cr.workspaceId", WS]);
  });
});

describe("[unit] listWorkspaceThemes", () => {
  it("groups by slug, counts distinct calls, and orders by last-seen desc", async () => {
    nextRows = [
      { callId: CALL_A, callDate: d("2026-07-22T09:00:00Z"), label: "Pricing" },
      { callId: CALL_B, callDate: d("2026-07-21T09:00:00Z"), label: "pricing" }, // same theme, 2nd call
      { callId: CALL_C, callDate: d("2026-07-23T09:00:00Z"), label: "Hiring" }, // newer activity
      { callId: CALL_C, callDate: d("2026-07-23T09:00:00Z"), label: "Pricing" }, // same call, still pricing
    ];

    const res = await listWorkspaceThemes({ workspaceId: WS });
    // Hiring last-seen 07-23; pricing last-seen 07-23 too (via CALL_C). Both at
    // 07-23 — pricing appears first because its newest row leads the input.
    expect(res.map((t) => t.key)).toEqual(["pricing", "hiring"]);
    const pricing = res.find((t) => t.key === "pricing")!;
    expect(pricing.callCount).toBe(3); // CALL_A, CALL_B, CALL_C distinct
    expect(pricing.label).toBe("Pricing");
    expect(pricing.lastSeen).toEqual(d("2026-07-23T09:00:00Z"));
    const hiring = res.find((t) => t.key === "hiring")!;
    expect(hiring.callCount).toBe(1);
  });

  it("fences on workspace_id", async () => {
    nextRows = [];
    await listWorkspaceThemes({ workspaceId: WS });
    expect(eqCalls).toContainEqual(["ctf.workspaceId", WS]);
  });

  it("applies the limit", async () => {
    nextRows = [
      { callId: CALL_A, callDate: d("2026-07-22T09:00:00Z"), label: "Pricing" },
      { callId: CALL_B, callDate: d("2026-07-21T09:00:00Z"), label: "Hiring" },
      { callId: CALL_C, callDate: d("2026-07-20T09:00:00Z"), label: "Roadmap" },
    ];
    const res = await listWorkspaceThemes({ workspaceId: WS, limit: 2 });
    expect(res).toHaveLength(2);
    expect(res.map((t) => t.key)).toEqual(["pricing", "hiring"]);
  });
});

describe("[unit] getThemeDetail", () => {
  it("returns the matching themed_doc theme for the call", async () => {
    const theme = {
      key: "pricing",
      label: "Pricing",
      origin: "agenda",
      agendaItemKey: "pricing",
      evidence: [{ type: "note", tSecs: 12, text: "wants annual", quote: "", speaker: "" }],
      ai: null,
    };
    nextRows = [{ themedDoc: { v: 1, callSentence: null, themes: [theme], unfiled: [], agenda: [] } }];

    const res = await getThemeDetail({ workspaceId: WS, callId: CALL_A, key: "pricing" });
    expect(res).toEqual(theme);
  });

  it("returns null when the call has no themed_doc", async () => {
    nextRows = [{ themedDoc: null }];
    expect(await getThemeDetail({ workspaceId: WS, callId: CALL_A, key: "pricing" })).toBeNull();
  });

  it("returns null when the key is absent from the doc", async () => {
    nextRows = [{ themedDoc: { v: 1, callSentence: null, themes: [{ key: "hiring" }], unfiled: [], agenda: [] } }];
    expect(await getThemeDetail({ workspaceId: WS, callId: CALL_A, key: "pricing" })).toBeNull();
  });

  it("returns null when the call row is missing (foreign/unknown)", async () => {
    nextRows = [];
    expect(await getThemeDetail({ workspaceId: WS, callId: CALL_A, key: "pricing" })).toBeNull();
  });

  it("fences the read on workspace_id", async () => {
    nextRows = [];
    await getThemeDetail({ workspaceId: WS, callId: CALL_A, key: "pricing" });
    expect(eqCalls).toContainEqual(["cr.workspaceId", WS]);
  });
});
