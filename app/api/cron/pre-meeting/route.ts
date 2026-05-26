import { NextRequest, NextResponse } from "next/server";

/**
 * AGB-405 — pre-meeting card.
 *
 * STUB: this route is the integration seam for Google/Outlook calendar.
 * When a calendar webhook fires for an upcoming meeting, POST here with
 * the attendee emails and we'd match each to a contact + return their
 * recent touches + conversation summary.
 *
 * Until calendar integration is wired (out of scope for v1 autonomous build),
 * this returns 501.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      error: "Not implemented",
      note: "Calendar integration is the next dependency. Wire Google Calendar push notifications to this endpoint.",
    },
    { status: 501 },
  );
}
