import { z } from "zod";

export const contactTypeEnum = z.enum(["person", "org"]);
export const relationshipTypeEnum = z.enum([
  "friend",
  "lead",
  "partner",
  "prospect",
]);
export const channelKindEnum = z.enum([
  "email",
  "phone",
  "whatsapp",
  "instagram",
  "domain",
]);

export const contactChannelInputSchema = z.object({
  kind: channelKindEnum,
  value: z.string().min(1).max(255),
});

export const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  type: contactTypeEnum.default("person"),
  organization: z.string().max(120).optional().nullable(),
  relationshipType: relationshipTypeEnum.default("prospect"),
  introChainFromText: z.string().max(240).optional().nullable(),
  notesPath: z.string().max(255).optional().nullable(),
  primaryOrgId: z.string().uuid().optional().nullable(),
  channels: z.array(contactChannelInputSchema).optional().default([]),
  tagIds: z.array(z.string().uuid()).optional().default([]),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;
export type ContactChannelInput = z.infer<typeof contactChannelInputSchema>;

/**
 * Parse a flat FormData submission into the structured ContactFormInput shape.
 * Channels are encoded as repeated `channel.kind` / `channel.value` pairs.
 * Tags are repeated `tagId` values.
 */
export function parseContactFormData(fd: FormData): ContactFormInput {
  const kinds = fd.getAll("channel.kind").map(String);
  const values = fd.getAll("channel.value").map(String);
  const channels = kinds
    .map((kind, i) => ({ kind, value: values[i] ?? "" }))
    .filter((c) => c.value.trim().length > 0);

  return contactFormSchema.parse({
    name: String(fd.get("name") ?? "").trim(),
    type: (fd.get("type") as string) || "person",
    organization: (fd.get("organization") as string) || null,
    relationshipType: (fd.get("relationshipType") as string) || "prospect",
    introChainFromText: (fd.get("introChainFromText") as string) || null,
    notesPath: (fd.get("notesPath") as string) || null,
    primaryOrgId: (fd.get("primaryOrgId") as string) || null,
    channels,
    tagIds: fd.getAll("tagId").map(String).filter(Boolean),
  });
}
