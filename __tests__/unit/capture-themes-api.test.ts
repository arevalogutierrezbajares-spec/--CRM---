import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse, NextRequest } from "next/server";
import type {
  ThemeTimeline,
  WorkspaceThemeItem,
} from "@/db/queries/capture-themes";

// Mock the auth gate + query layer; serializers stay REAL so the wire shapes
// (ISO dates, rollup/coverage passthrough) are exercised for real. Mirrors
// capture-recordings-api.test.ts.
const requireCaptureIdentityMock = vi.fn();
const listWorkspaceThemesMock = vi.fn();
const getThemeTimelineMock = vi.fn();

vi.mock("@/lib/capture/api", () => ({
  requireCaptureIdentity: (...args: unknown[]) => requireCaptureIdentityMock(...args),
}));
vi.mock("@/db/queries/capture-themes", () => ({
  listWorkspaceThemes: (...args: unknown[]) => listWorkspaceThemesMock(...args),
  getThemeTimeline: (...args: unknown[]) => getThemeTimelineMock(...args),
}));

import { GET as themesGET } from "@/app/api/capture/themes/route";
import { GET as timelineGET } from "@/app/api/capture/themes/[key]/timeline/route";

const IDENTITY = {
  workspaceId: "00000000-0000-4000-8000-00000000aaaa",
  userId: "00000000-0000-4000-8000-00000000bbbb",
};
const CALL_A = "00000000-0000-4000-8000-00000000cc01";
const CALL_B = "00000000-0000-4000-8000-00000000cc02";
const NEWER = new Date("2026-07-22T09:00:00.000Z");
const OLDER = new Date("2026-07-19T09:00:00.000Z");

beforeEach(() => {
  requireCaptureIdentityMock.mockReset().mockResolvedValue(IDENTITY);
  listWorkspaceThemesMock.mockReset();
  getThemeTimelineMock.mockReset();
});

describe("[unit] GET /api/capture/themes", () => {
  it("passes through the auth failure response untouched", async () => {
    const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireCaptureIdentityMock.mockResolvedValue(denied);

    const res = await themesGET(new NextRequest("http://x/api/capture/themes"));
    expect(res).toBe(denied);
    expect(listWorkspaceThemesMock).not.toHaveBeenCalled();
  });

  it("serializes the themes index newest-activity-first with ISO dates", async () => {
    const items: WorkspaceThemeItem[] = [
      { key: "pricing", label: "Pricing", callCount: 3, lastSeen: NEWER },
      { key: "hiring", label: "Hiring", callCount: 1, lastSeen: OLDER },
    ];
    listWorkspaceThemesMock.mockResolvedValue(items);

    const res = await themesGET(new NextRequest("http://x/api/capture/themes"));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Fenced to the token's workspace; default limit.
    expect(listWorkspaceThemesMock).toHaveBeenCalledWith({
      workspaceId: IDENTITY.workspaceId,
      limit: 50,
    });
    expect(body).toEqual({
      themes: [
        { key: "pricing", label: "Pricing", callCount: 3, lastSeen: NEWER.toISOString() },
        { key: "hiring", label: "Hiring", callCount: 1, lastSeen: OLDER.toISOString() },
      ],
    });
  });

  it("clamps limit to 200", async () => {
    listWorkspaceThemesMock.mockResolvedValue([]);
    const res = await themesGET(new NextRequest("http://x/api/capture/themes?limit=999"));
    expect(res.status).toBe(200);
    expect(listWorkspaceThemesMock).toHaveBeenCalledWith({
      workspaceId: IDENTITY.workspaceId,
      limit: 200,
    });
  });
});

describe("[unit] GET /api/capture/themes/[key]/timeline", () => {
  const props = { params: Promise.resolve({ key: "pricing" }) };

  it("passes through the auth failure response untouched", async () => {
    const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireCaptureIdentityMock.mockResolvedValue(denied);

    const res = await timelineGET(
      new NextRequest("http://x/api/capture/themes/pricing/timeline"),
      props,
    );
    expect(res).toBe(denied);
    expect(getThemeTimelineMock).not.toHaveBeenCalled();
  });

  it("serializes the timeline: ordering, rollup counts, coverage distribution", async () => {
    const timeline: ThemeTimeline = {
      key: "pricing",
      label: "Pricing",
      rollup: {
        callCount: 2,
        firstSeen: OLDER,
        lastSeen: NEWER,
        coverage: { done: 0, covered: 1, gap: 1 },
      },
      calls: [
        {
          callId: CALL_A,
          callTitle: "Call with Carlos",
          callDate: NEWER,
          noteCount: 4,
          quoteCount: 2,
          flagCount: 1,
          coverage: "covered",
        },
        {
          callId: CALL_B,
          callTitle: "Call with Ana",
          callDate: OLDER,
          noteCount: 0,
          quoteCount: 0,
          flagCount: 0,
          coverage: "gap",
        },
      ],
    };
    getThemeTimelineMock.mockResolvedValue(timeline);

    const res = await timelineGET(
      new NextRequest("http://x/api/capture/themes/pricing/timeline"),
      props,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // Fenced to the token's workspace; key from the path; default limit.
    expect(getThemeTimelineMock).toHaveBeenCalledWith({
      workspaceId: IDENTITY.workspaceId,
      key: "pricing",
      limit: 10,
    });
    expect(body).toEqual({
      key: "pricing",
      label: "Pricing",
      rollup: {
        callCount: 2,
        firstSeen: OLDER.toISOString(),
        lastSeen: NEWER.toISOString(),
        coverage: { done: 0, covered: 1, gap: 1 },
      },
      calls: [
        {
          callId: CALL_A,
          callTitle: "Call with Carlos",
          callDate: NEWER.toISOString(),
          noteCount: 4,
          quoteCount: 2,
          flagCount: 1,
          coverage: "covered",
        },
        {
          callId: CALL_B,
          callTitle: "Call with Ana",
          callDate: OLDER.toISOString(),
          noteCount: 0,
          quoteCount: 0,
          flagCount: 0,
          coverage: "gap",
        },
      ],
    });
    // Newest call first.
    expect(body.calls[0].callDate > body.calls[1].callDate).toBe(true);
  });

  it("returns a valid empty timeline for a non-existent theme (not 404)", async () => {
    getThemeTimelineMock.mockResolvedValue({
      key: "does-not-exist",
      label: null,
      rollup: {
        callCount: 0,
        firstSeen: null,
        lastSeen: null,
        coverage: { done: 0, covered: 0, gap: 0 },
      },
      calls: [],
    } satisfies ThemeTimeline);

    const res = await timelineGET(
      new NextRequest("http://x/api/capture/themes/does-not-exist/timeline"),
      { params: Promise.resolve({ key: "does-not-exist" }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      key: "does-not-exist",
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

  it("clamps the timeline limit to 100 and passes the token workspace only", async () => {
    getThemeTimelineMock.mockResolvedValue({
      key: "pricing",
      label: "Pricing",
      rollup: { callCount: 0, firstSeen: null, lastSeen: null, coverage: { done: 0, covered: 0, gap: 0 } },
      calls: [],
    } satisfies ThemeTimeline);

    await timelineGET(
      new NextRequest("http://x/api/capture/themes/pricing/timeline?limit=500"),
      props,
    );
    // Workspace fencing at the route boundary: the query is only ever asked for
    // the identity's workspace — a foreign workspace can never be requested.
    expect(getThemeTimelineMock).toHaveBeenCalledWith({
      workspaceId: IDENTITY.workspaceId,
      key: "pricing",
      limit: 100,
    });
  });
});
