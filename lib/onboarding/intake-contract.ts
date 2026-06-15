/**
 * Posada onboarding intake contract (AGB-CRM → TOUR PMS).
 *
 * The CRM intake wizard captures a posada's details and pushes them to the PMS
 * onboarding import endpoint:
 *
 *   POST {CANEY_PMS_API_URL}/api/v1/onboarding/sessions/{sessionId}/intake
 *   Authorization: Bearer <import_token>
 *   { "intake_revision": "<stable id>", "fields": { "records": [ ... ] } }
 *
 * The PMS stores `fields` verbatim as a `form_field` artifact whose
 * `extracted_text` is `JSON.stringify(fields)`, then its transform layer reads
 * `JSON.parse(text).records` — so `fields` MUST be `{ records: [...] }` and each
 * record MUST carry a `type` discriminator. The record shapes, required fields,
 * and enum constraints below mirror the PMS `onboarding/transform.py`,
 * `onboarding/guard.py`, and `onboarding/taxonomy.py` exactly. Keeping them in
 * lock-step is what prevents a record from being silently dropped (unknown
 * taxonomy token) or turned into a transform "gap" (missing required field).
 *
 * Pure module — no React, no `server-only`, no I/O — so it is importable from
 * both the client wizard and the server action, and unit-testable in isolation.
 */

import { z } from "zod";

// --------------------------------------------------------------------------- //
// Canonical taxonomy (mirror of PMS onboarding/taxonomy.py)                     //
// Submitting these exact tokens guarantees the PMS normalizer keeps them;       //
// unrecognized tokens are dropped on the PMS side (amenities) or rejected       //
// (currency), so the wizard always emits canonical values.                      //
// --------------------------------------------------------------------------- //
export const CANONICAL_CURRENCIES = ["USD", "VES", "EUR"] as const;
export type CanonicalCurrency = (typeof CANONICAL_CURRENCIES)[number];

export const CANONICAL_BED_TYPES = [
  "double",
  "queen",
  "king",
  "single",
  "twin",
  "bunk",
] as const;
export type CanonicalBedType = (typeof CANONICAL_BED_TYPES)[number];

export const CANONICAL_AMENITIES = [
  "wifi",
  "air_conditioning",
  "fan",
  "pool",
  "hot_water",
  "private_bathroom",
  "tv",
  "minibar",
  "breakfast_included",
  "parking",
  "kitchen",
  "ocean_view",
  "balcony",
  "safe",
  "pets_allowed",
  "beach_access",
] as const;
export type CanonicalAmenity = (typeof CANONICAL_AMENITIES)[number];

/** Spanish-first display labels for the wizard UI (value stays canonical). */
export const BED_TYPE_LABELS: Record<CanonicalBedType, string> = {
  double: "Matrimonial (doble)",
  queen: "Queen",
  king: "King",
  single: "Individual",
  twin: "Twin (dos camas)",
  bunk: "Litera",
};

export const AMENITY_LABELS: Record<CanonicalAmenity, string> = {
  wifi: "WiFi",
  air_conditioning: "Aire acondicionado",
  fan: "Ventilador",
  pool: "Piscina",
  hot_water: "Agua caliente",
  private_bathroom: "Baño privado",
  tv: "TV",
  minibar: "Minibar / nevera",
  breakfast_included: "Desayuno incluido",
  parking: "Estacionamiento",
  kitchen: "Cocina",
  ocean_view: "Vista al mar",
  balcony: "Balcón / terraza",
  safe: "Caja fuerte",
  pets_allowed: "Acepta mascotas",
  beach_access: "Acceso a la playa",
};

export const CURRENCY_LABELS: Record<CanonicalCurrency, string> = {
  USD: "USD — Dólares",
  VES: "VES — Bolívares",
  EUR: "EUR — Euros",
};

/** Common Venezuelan posada payment methods (free tokens; PMS stores verbatim). */
export const PAYMENT_METHODS = [
  "cash_usd",
  "cash_ves",
  "zelle",
  "pago_movil",
  "bank_transfer",
  "binance",
  "card",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash_usd: "Efectivo (USD)",
  cash_ves: "Efectivo (Bs.)",
  zelle: "Zelle",
  pago_movil: "Pago móvil",
  bank_transfer: "Transferencia bancaria",
  binance: "Binance / cripto",
  card: "Tarjeta",
};

/**
 * Structured intake is operator-curated, so it is high-trust. The PMS marks a
 * proposal `pre_checked` when `confidence >= session.confidence_threshold`
 * (default 0.85); 0.95 keeps every record eligible for bulk-approve.
 */
export const STRUCTURED_CONFIDENCE = 0.95;

// --------------------------------------------------------------------------- //
// Draft schema (what the wizard collects)                                       //
// Constraints mirror PMS guard.REQUIRED_FIELDS + enum/value checks.             //
// --------------------------------------------------------------------------- //
export const propertyProfileSchema = z.object({
  name: z.string().trim().min(1, "El nombre de la posada es obligatorio").max(200),
  address: z.string().trim().max(500).optional().default(""),
  timezone: z.string().trim().max(64).optional().default("America/Caracas"),
});

export const roomTypeSchema = z.object({
  name: z.string().trim().min(1, "El tipo de habitación necesita un nombre").max(200),
  maxOccupancy: z
    .number({ invalid_type_error: "Capacidad inválida" })
    .int("La capacidad debe ser un número entero")
    .positive("La capacidad debe ser mayor que cero"),
  bedType: z.enum(CANONICAL_BED_TYPES).optional().nullable(),
  amenities: z.array(z.enum(CANONICAL_AMENITIES)).default([]),
});

export const roomSchema = z.object({
  roomNumber: z.string().trim().min(1, "El número de habitación es obligatorio").max(64),
  roomTypeName: z.string().trim().min(1, "Selecciona el tipo de habitación"),
});

export const ratePlanSchema = z.object({
  roomTypeName: z.string().trim().min(1, "Selecciona el tipo de habitación"),
  name: z.string().trim().max(120).optional().default("standard"),
  baseRate: z
    .number({ invalid_type_error: "Tarifa inválida" })
    .nonnegative("La tarifa no puede ser negativa"),
  currency: z.enum(CANONICAL_CURRENCIES),
});

export const cancellationRuleSchema = z.object({
  tierName: z.string().trim().min(1, "Nombre de la política obligatorio").max(120),
  timeBoundaryHours: z
    .number({ invalid_type_error: "Horas inválidas" })
    .nonnegative("Las horas no pueden ser negativas"),
  refundPercentage: z
    .number({ invalid_type_error: "Porcentaje inválido" })
    .min(0, "El reembolso no puede ser menor que 0%")
    .max(100, "El reembolso no puede superar 100%"),
});

export const paymentConfigSchema = z.object({
  methods: z.array(z.enum(PAYMENT_METHODS)).default([]),
});

export const intakeDraftSchema = z
  .object({
    property: propertyProfileSchema,
    roomTypes: z.array(roomTypeSchema).default([]),
    rooms: z.array(roomSchema).default([]),
    ratePlans: z.array(ratePlanSchema).default([]),
    cancellationRules: z.array(cancellationRuleSchema).default([]),
    payment: paymentConfigSchema.default({ methods: [] }),
  })
  .superRefine((draft, ctx) => {
    // FK pre-wiring: rooms + rate plans reference a room type by NAME; the PMS
    // turns an unresolved reference into a gap, so we reject it here instead.
    const typeNames = new Set(draft.roomTypes.map((rt) => rt.name.trim()));
    draft.rooms.forEach((room, i) => {
      if (!typeNames.has(room.roomTypeName.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rooms", i, "roomTypeName"],
          message: `Tipo de habitación desconocido: "${room.roomTypeName}"`,
        });
      }
    });
    draft.ratePlans.forEach((rp, i) => {
      if (!typeNames.has(rp.roomTypeName.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ratePlans", i, "roomTypeName"],
          message: `Tipo de habitación desconocido: "${rp.roomTypeName}"`,
        });
      }
    });
    // Duplicate room-type names break the name→id resolution on the PMS side.
    const dupes = draft.roomTypes
      .map((rt) => rt.name.trim())
      .filter((n, i, arr) => arr.indexOf(n) !== i);
    if (dupes.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roomTypes"],
        message: `Nombres de tipo de habitación duplicados: ${[...new Set(dupes)].join(", ")}`,
      });
    }
  });

export type IntakeDraft = z.infer<typeof intakeDraftSchema>;
export type RoomTypeDraft = z.infer<typeof roomTypeSchema>;
export type RoomDraft = z.infer<typeof roomSchema>;
export type RatePlanDraft = z.infer<typeof ratePlanSchema>;
export type CancellationRuleDraft = z.infer<typeof cancellationRuleSchema>;

/** Empty draft for wizard initialization. */
export function emptyDraft(): IntakeDraft {
  return {
    property: { name: "", address: "", timezone: "America/Caracas" },
    roomTypes: [],
    rooms: [],
    ratePlans: [],
    cancellationRules: [],
    payment: { methods: [] },
  };
}

// --------------------------------------------------------------------------- //
// Records assembly (the exact PMS wire shape)                                   //
// --------------------------------------------------------------------------- //
export type IntakeRecord = Record<string, unknown> & { type: string };

export interface IntakeFields {
  records: IntakeRecord[];
}

/**
 * Build the `fields.records[]` array the PMS transform consumes. Field keys
 * (snake_case) match `onboarding/transform.py` reads exactly. Empty optional
 * values are omitted so they don't override PMS defaults (e.g. timezone).
 */
export function buildRecords(draft: IntakeDraft): IntakeRecord[] {
  const records: IntakeRecord[] = [];
  const c = STRUCTURED_CONFIDENCE;

  // property_profile (single)
  const profile: IntakeRecord = {
    type: "property_profile",
    name: draft.property.name.trim(),
    confidence: c,
  };
  const address = draft.property.address?.trim();
  if (address) profile.address = address;
  const timezone = draft.property.timezone?.trim();
  if (timezone) profile.timezone = timezone;
  records.push(profile);

  // room_type (parents first so the PMS can resolve name→id for children)
  for (const rt of draft.roomTypes) {
    const rec: IntakeRecord = {
      type: "room_type",
      name: rt.name.trim(),
      max_occupancy: rt.maxOccupancy,
      amenities: rt.amenities,
      confidence: c,
    };
    if (rt.bedType) rec.bed_type = rt.bedType;
    records.push(rec);
  }

  // room
  for (const room of draft.rooms) {
    records.push({
      type: "room",
      room_number: room.roomNumber.trim(),
      room_type_name: room.roomTypeName.trim(),
      confidence: c,
    });
  }

  // rate_plan
  for (const rp of draft.ratePlans) {
    records.push({
      type: "rate_plan",
      room_type_name: rp.roomTypeName.trim(),
      name: (rp.name?.trim() || "standard"),
      base_rate: rp.baseRate,
      currency: rp.currency,
      confidence: c,
    });
  }

  // cancellation_rule (optional)
  for (const cr of draft.cancellationRules) {
    records.push({
      type: "cancellation_rule",
      tier_name: cr.tierName.trim(),
      time_boundary_hours: cr.timeBoundaryHours,
      refund_percentage: cr.refundPercentage,
      confidence: c,
    });
  }

  // payment_config (optional, only when at least one method is selected)
  if (draft.payment.methods.length > 0) {
    records.push({
      type: "payment_config",
      methods: draft.payment.methods,
      confidence: c,
    });
  }

  return records;
}

export function buildIntakeFields(draft: IntakeDraft): IntakeFields {
  return { records: buildRecords(draft) };
}

// --------------------------------------------------------------------------- //
// Readiness (mirror of PMS service.REQUIRED_AREAS for a "live-ready" posada)    //
// --------------------------------------------------------------------------- //
export type ReadinessArea = "property_profile" | "room_type" | "room" | "rate_plan";

export interface Readiness {
  ready: boolean;
  areas: Record<ReadinessArea, boolean>;
  blocking: ReadinessArea[];
}

const AREA_LABELS: Record<ReadinessArea, string> = {
  property_profile: "Perfil de la posada",
  room_type: "Tipos de habitación",
  room: "Habitaciones",
  rate_plan: "Tarifas",
};

export function areaLabel(area: ReadinessArea): string {
  return AREA_LABELS[area];
}

/** Required areas for the PMS to deploy a live tenant (FR-GAP-1 minimal slice). */
export function computeReadiness(draft: IntakeDraft): Readiness {
  const areas: Record<ReadinessArea, boolean> = {
    property_profile: draft.property.name.trim().length > 0,
    room_type: draft.roomTypes.length > 0,
    room: draft.rooms.length > 0,
    rate_plan: draft.ratePlans.length > 0,
  };
  const blocking = (Object.keys(areas) as ReadinessArea[]).filter((a) => !areas[a]);
  return { ready: blocking.length === 0, areas, blocking };
}

// --------------------------------------------------------------------------- //
// Deterministic idempotency key                                                 //
// --------------------------------------------------------------------------- //
/** Recursively sort object keys so equal content hashes identically. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** 52-bit FNV-1a over the canonical JSON — synchronous, dependency-free. */
function fnv1a(input: string): string {
  let hi = 0x811c;
  let lo = 0x9dc5;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    lo ^= ch & 0xff;
    // multiply by FNV prime 0x01000193 with 32x32 split, keep 52 bits
    const loProd = lo * 0x0193;
    const hiProd = hi * 0x0193 + lo * 0x0100;
    lo = loProd & 0xffff;
    hi = (hiProd + (loProd >>> 16)) & 0xffffffff;
  }
  return (hi >>> 0).toString(16).padStart(8, "0") + (lo & 0xffff).toString(16).padStart(4, "0");
}

/**
 * Stable revision derived from content. Identical fields → identical revision →
 * the PMS dedups (created=false), so a retry of the same submission is a no-op
 * (FR-BR-4); changed content yields a new revision and a new immutable artifact.
 */
export function computeIntakeRevision(fields: IntakeFields): string {
  return `crm-${fnv1a(JSON.stringify(canonicalize(fields)))}`;
}
