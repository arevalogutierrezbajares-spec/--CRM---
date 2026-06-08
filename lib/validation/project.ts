import { z } from "zod";

export const projectStatusEnum = z.enum(["active", "waiting", "done", "lost"]);

/**
 * A Project is the lighter execution unit that rolls up to a Line of Business.
 * It carries status/dates/blocking but no portfolio/pipeline fields (those live
 * on the LoB).
 */
export const projectFormSchema = z
  .object({
    lobId: z.string().uuid("Pick a line of business"),
    title: z.string().min(1, "Title is required").max(200),
    status: projectStatusEnum.default("active"),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional()
      .nullable(),
    waitingOn: z.string().max(240).optional().nullable(),
    expectedUnblockDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional()
      .nullable(),
  })
  .refine(
    (v) =>
      v.status !== "waiting" || (v.waitingOn && v.waitingOn.trim().length > 0),
    {
      message: "waiting status requires a waiting_on description",
      path: ["waitingOn"],
    },
  );

export type ProjectFormInput = z.infer<typeof projectFormSchema>;

export function parseProjectFormData(fd: FormData): ProjectFormInput {
  const raw = {
    lobId: String(fd.get("lobId") ?? "").trim(),
    title: String(fd.get("title") ?? "").trim(),
    status: (fd.get("status") as string) || "active",
    dueDate: emptyToNull(fd.get("dueDate")),
    waitingOn: emptyToNull(fd.get("waitingOn")),
    expectedUnblockDate: emptyToNull(fd.get("expectedUnblockDate")),
  };
  return projectFormSchema.parse(raw);
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}
