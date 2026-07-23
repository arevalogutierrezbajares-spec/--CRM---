import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse, NextRequest } from "next/server";
import type {
  CallRecordingListItem,
  CallRecordingRow,
} from "@/db/queries/call-recordings";

// Mock the auth gate + query layer; the serializers stay REAL so the wire
// shapes (participants derivation, hasBrief, ISO dates) are exercised for real.
const requireCaptureIdentityMock = vi.fn();
const listCallRecordingsMock = vi.fn();
const getCallRecordingMock = vi.fn();
const getContactNameMock = vi.fn();

vi.mock("@/lib/capture/api", () => ({
  requireCaptureIdentity: (...args: unknown[]) => requireCaptureIdentityMock(...args),
}));
vi.mock("@/db/queries/call-recordings", () => ({
  listCallRecordings: (...args: unknown[]) => listCallRecordingsMock(...args),
  getCallRecording: (...args: unknown[]) => getCallRecordingMock(...args),
  getContactName: (...args: unknown[]) => getContactNameMock(...args),
}));

import { GET as listGET } from "@/app/api/capture/recordings/route";
import { GET as detailGET } from "@/app/api/capture/recordings/[id]/route";
import { deriveParticipants } from "@/lib/capture/serialize";

const IDENTITY = {
  workspaceId: "00000000-0000-4000-8000-00000000aaaa",
  userId: "00000000-0000-4000-8000-00000000bbbb",
};
const REC_ID = "00000000-0000-4000-8000-00000000cccc";
const CONTACT_ID = "00000000-0000-4000-8000-00000000dddd";
const CREATED = new Date("2026-07-20T10:00:00.000Z");

function listItem(overrides: Partial<CallRecordingListItem> = {}): CallRecordingListItem {
  return {
    id: REC_ID,
    title: "Call with Carlos",
    brief: "## Brief",
    language: "es",
    durationSecs: 300,
    actionItemCount: 2,
    contactId: CONTACT_ID,
    contactName: "Carlos Perez",
    createdAt: CREATED,
    transcriptChars: 1200,
    hasAudio: true,
    audioPurgeAt: null,
    audioPurgedAt: null,
    channels: 2,
    sourceApp: "WhatsApp",
    partial: false,
    suspectFlags: [],
    speakerMap: { SPEAKER_00: "Carlos", SPEAKER_01: "You" },
    utteranceSpeakers: ["SPEAKER_00", "SPEAKER_02", "founder"],
    ...overrides,
  };
}

function fullRow(overrides: Partial<CallRecordingRow> = {}): CallRecordingRow {
  return {
    id: REC_ID,
    workspaceId: IDENTITY.workspaceId,
    title: "Call with Carlos",
    transcript: "[00:00] Carlos: hola",
    brief: "## Brief",
    language: "es",
    durationSecs: 300,
    contactId: CONTACT_ID,
    meetingId: "00000000-0000-4000-8000-00000000eeee",
    actionItemCount: 2,
    audioPath: null,
    audioBytes: null,
    audioPurgeAt: null,
    audioPurgedAt: null,
    channels: 2,
    sourceApp: "WhatsApp",
    utterances: [
      { speaker: "SPEAKER_00", channel: 1, start: 0, end: 2, text: "hola", diarizationId: "SPEAKER_00" },
    ],
    speakerMap: { SPEAKER_00: "Carlos" },
    transcriptEngine: "deepgram+diarize",
    suspectFlags: null,
    consentNote: null,
    contactAmbiguous: false,
    partial: false,
    createdBy: IDENTITY.userId,
    createdAt: CREATED,
    ...overrides,
  } as CallRecordingRow;
}

beforeEach(() => {
  requireCaptureIdentityMock.mockReset().mockResolvedValue(IDENTITY);
  listCallRecordingsMock.mockReset();
  getCallRecordingMock.mockReset();
  getContactNameMock.mockReset();
});

describe("[unit] GET /api/capture/recordings", () => {
  it("passes through the auth failure response untouched", async () => {
    const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireCaptureIdentityMock.mockResolvedValue(denied);

    const res = await listGET(new NextRequest("http://x/api/capture/recordings"));
    expect(res).toBe(denied);
    expect(listCallRecordingsMock).not.toHaveBeenCalled();
  });

  it("lists recordings with derived participants + hasBrief", async () => {
    listCallRecordingsMock.mockResolvedValue([
      listItem(),
      listItem({
        id: "00000000-0000-4000-8000-00000000ffff",
        brief: null,
        contactId: null,
        contactName: null,
        speakerMap: null,
        utteranceSpeakers: ["founder", "participant"],
        partial: true,
        suspectFlags: ["participant_channel_silent"],
      }),
    ]);

    const res = await listGET(new NextRequest("http://x/api/capture/recordings"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(listCallRecordingsMock).toHaveBeenCalledWith({
      workspaceId: IDENTITY.workspaceId,
      limit: 30, // default
    });
    expect(body.recordings).toHaveLength(2);
    expect(body.recordings[0]).toEqual({
      id: REC_ID,
      title: "Call with Carlos",
      createdAt: "2026-07-20T10:00:00.000Z",
      durationSecs: 300,
      sourceApp: "WhatsApp",
      contactId: CONTACT_ID,
      contactName: "Carlos Perez",
      actionItemCount: 2,
      hasBrief: true,
      // "You" (generic) + unmapped SPEAKER_02/founder excluded → only Carlos.
      participants: ["Carlos"],
      partial: false,
      suspectFlags: [],
    });
    expect(body.recordings[1]).toMatchObject({
      hasBrief: false,
      participants: [],
      contactName: null,
      partial: true,
      suspectFlags: ["participant_channel_silent"],
    });
  });

  it("clamps limit to 100", async () => {
    listCallRecordingsMock.mockResolvedValue([]);
    const res = await listGET(
      new NextRequest("http://x/api/capture/recordings?limit=500"),
    );
    expect(res.status).toBe(200);
    expect(listCallRecordingsMock).toHaveBeenCalledWith({
      workspaceId: IDENTITY.workspaceId,
      limit: 100,
    });
  });
});

describe("[unit] GET /api/capture/recordings/[id]", () => {
  const props = { params: Promise.resolve({ id: REC_ID }) };

  it("passes through the auth failure response untouched", async () => {
    const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireCaptureIdentityMock.mockResolvedValue(denied);

    const res = await detailGET(
      new NextRequest(`http://x/api/capture/recordings/${REC_ID}`),
      props,
    );
    expect(res).toBe(denied);
    expect(getCallRecordingMock).not.toHaveBeenCalled();
  });

  it("returns the full detail shape with utterances as stored", async () => {
    getCallRecordingMock.mockResolvedValue(fullRow());
    getContactNameMock.mockResolvedValue({ id: CONTACT_ID, name: "Carlos Perez" });

    const res = await detailGET(
      new NextRequest(`http://x/api/capture/recordings/${REC_ID}`),
      props,
    );
    expect(res.status).toBe(200);
    const { recording } = await res.json();

    expect(getCallRecordingMock).toHaveBeenCalledWith({
      id: REC_ID,
      workspaceId: IDENTITY.workspaceId,
    });
    expect(getContactNameMock).toHaveBeenCalledWith({
      id: CONTACT_ID,
      workspaceId: IDENTITY.workspaceId,
    });
    expect(recording).toEqual({
      id: REC_ID,
      title: "Call with Carlos",
      createdAt: "2026-07-20T10:00:00.000Z",
      durationSecs: 300,
      sourceApp: "WhatsApp",
      contactId: CONTACT_ID,
      contactName: "Carlos Perez",
      brief: "## Brief",
      transcript: "[00:00] Carlos: hola",
      utterances: [
        { speaker: "SPEAKER_00", channel: 1, start: 0, end: 2, text: "hola", diarizationId: "SPEAKER_00" },
      ],
      speakerMap: { SPEAKER_00: "Carlos" },
      transcriptEngine: "deepgram+diarize",
      suspectFlags: [],
      partial: false,
      language: "es",
      actionItemCount: 2,
      meetingId: "00000000-0000-4000-8000-00000000eeee",
      // El Cuaderno: null for legacy recordings without a themed doc.
      themedDoc: null,
      agenda: null,
    });
  });

  it("does not look up a contact when the row has none", async () => {
    getCallRecordingMock.mockResolvedValue(fullRow({ contactId: null }));

    const res = await detailGET(
      new NextRequest(`http://x/api/capture/recordings/${REC_ID}`),
      props,
    );
    const { recording } = await res.json();
    expect(recording.contactId).toBeNull();
    expect(recording.contactName).toBeNull();
    expect(getContactNameMock).not.toHaveBeenCalled();
  });

  it("404s for an unknown id in the workspace", async () => {
    getCallRecordingMock.mockResolvedValue(null);

    const res = await detailGET(
      new NextRequest(`http://x/api/capture/recordings/${REC_ID}`),
      props,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("404s for a malformed (non-uuid) id without hitting the db", async () => {
    const res = await detailGET(
      new NextRequest("http://x/api/capture/recordings/nope"),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
    expect(getCallRecordingMock).not.toHaveBeenCalled();
  });
});

describe("[unit] deriveParticipants", () => {
  it("dedupes case-insensitively, keeps first spelling, caps at 6", async () => {
    const map: Record<string, string> = {
      SPEAKER_00: "Carlos",
      SPEAKER_01: "carlos", // dupe by case
      SPEAKER_02: "Ana",
      SPEAKER_03: "Luis",
      SPEAKER_04: "Marta",
      SPEAKER_05: "Pedro",
      SPEAKER_06: "Sofia",
      SPEAKER_07: "Overflow", // 7th distinct → capped
    };
    expect(deriveParticipants(map, [])).toEqual([
      "Carlos",
      "Ana",
      "Luis",
      "Marta",
      "Pedro",
      "Sofia",
    ]);
  });

  it("resolves prefixed diarization keys (founder:SPEAKER_00) through the map", async () => {
    expect(
      deriveParticipants({ SPEAKER_00: "Carlos" }, ["participant:SPEAKER_00"]),
    ).toEqual(["Carlos"]);
  });

  it("returns [] with no map and only generic/unmapped labels", async () => {
    expect(deriveParticipants(null, ["founder", "SPEAKER_00", "You"])).toEqual([]);
  });
});
