import { z } from "zod";

export const projectStatusEnum = z.enum(["active", "waiting", "done", "lost"]);

export const projectFormSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    status: projectStatusEnum.default("active"),
    templateId: z.string().min(1).optional().nullable(),
    contactIds: z.array(z.string().uuid()).default([]),
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
    notesPath: z.string().max(255).optional().nullable(),
  })
  .refine(
    (v) =>
      v.status !== "waiting" ||
      (v.waitingOn && v.waitingOn.trim().length > 0),
    {
      message: "waiting status requires a waiting_on description",
      path: ["waitingOn"],
    },
  );

export type ProjectFormInput = z.infer<typeof projectFormSchema>;

export function parseProjectFormData(fd: FormData): ProjectFormInput {
  const raw = {
    title: String(fd.get("title") ?? "").trim(),
    status: (fd.get("status") as string) || "active",
    templateId: emptyToNull(fd.get("templateId")),
    contactIds: fd.getAll("contactId").map(String).filter(Boolean),
    dueDate: emptyToNull(fd.get("dueDate")),
    waitingOn: emptyToNull(fd.get("waitingOn")),
    expectedUnblockDate: emptyToNull(fd.get("expectedUnblockDate")),
    notesPath: emptyToNull(fd.get("notesPath")),
  };
  return projectFormSchema.parse(raw);
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}
