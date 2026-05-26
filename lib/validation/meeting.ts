import { z } from "zod";

export const meetingTypeEnum = z.enum(["one_on_one", "group", "event", "call"]);
export const meetingSourceEnum = z.enum([
  "calendar",
  "manual",
  "whatsapp",
  "voice",
]);

export const meetingFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  scheduledAt: z
    .string()
    .min(1, "Date + time required")
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Use ISO datetime-local"),
  endedAt: z.string().optional().nullable(),
  type: meetingTypeEnum.default("one_on_one"),
  location: z.string().max(240).optional().nullable(),
  agenda: z.string().max(4000).optional().nullable(),
  minutes: z.string().max(8000).optional().nullable(),
  metAtTag: z.string().max(120).optional().nullable(),
  linkedProjectId: z.string().uuid().optional().nullable(),
  attendeeIds: z.array(z.string().uuid()).default([]),
});

export type MeetingFormInput = z.infer<typeof meetingFormSchema>;

export function parseMeetingFormData(fd: FormData): MeetingFormInput {
  const empty = (v: FormDataEntryValue | null) => {
    if (v === null) return null;
    const s = String(v).trim();
    return s.length === 0 ? null : s;
  };
  return meetingFormSchema.parse({
    title: String(fd.get("title") ?? "").trim(),
    scheduledAt: String(fd.get("scheduledAt") ?? "").trim(),
    endedAt: empty(fd.get("endedAt")),
    type: (fd.get("type") as string) || "one_on_one",
    location: empty(fd.get("location")),
    agenda: empty(fd.get("agenda")),
    minutes: empty(fd.get("minutes")),
    metAtTag: empty(fd.get("metAtTag")),
    linkedProjectId: empty(fd.get("linkedProjectId")),
    attendeeIds: fd.getAll("attendeeId").map(String).filter(Boolean),
  });
}

/**
 * Parse action items out of meeting minutes. Recognized syntax (per line):
 *
 *   [ ] Send proposal to Marta
 *   [ ] @cofounder Schedule follow-up
 *   - [ ] Confirm vendor pricing
 *
 * Returns the raw action-item strings (caller turns them into Milestone rows).
 */
export function parseActionItems(minutes: string | null | undefined): string[] {
  if (!minutes) return [];
  const lines = minutes.split(/\r?\n/);
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^(?:-\s*)?\[\s\]\s*(.+)$/);
    if (m && m[1].trim()) out.push(m[1].trim());
  }
  return out;
}
