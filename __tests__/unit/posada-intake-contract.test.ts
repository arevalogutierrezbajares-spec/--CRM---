import { describe, expect, it } from "vitest";
import {
  AMENITY_GROUPS,
  CANONICAL_AMENITIES,
  buildIntakeFields,
  buildRecords,
  cancellationRuleSchema,
  computeIntakeRevision,
  computeReadiness,
  emptyDraft,
  expandRoomNumbers,
  intakeDraftSchema,
  ratePlanSchema,
  removeRoomTypeCascade,
  replaceRoomType,
  roomTypeDependents,
  roomTypeSchema,
  type IntakeDraft,
} from "@/lib/onboarding/intake-contract";

function fullDraft(): IntakeDraft {
  return intakeDraftSchema.parse({
    property: { name: "Posada Bolívar", address: "Calle 1, Mérida", timezone: "America/Caracas" },
    roomTypes: [{ name: "Doble", maxOccupancy: 2, bedType: "double", amenities: ["wifi", "pool"] }],
    rooms: [{ roomNumber: "101", roomTypeName: "Doble" }],
    ratePlans: [{ roomTypeName: "Doble", name: "standard", baseRate: 45, currency: "USD" }],
    cancellationRules: [{ tierName: "Flexible", timeBoundaryHours: 48, refundPercentage: 100 }],
    payment: { methods: ["zelle", "cash_usd"] },
  });
}

describe("buildIntakeFields — PMS wire contract", () => {
  it("wraps records under a `records` key (the exact shape the PMS transform parses)", () => {
    const fields = buildIntakeFields(fullDraft());
    expect(Object.keys(fields)).toEqual(["records"]);
    expect(Array.isArray(fields.records)).toBe(true);
  });

  it("emits one record per entity with the correct snake_case keys + type discriminators", () => {
    const records = buildRecords(fullDraft());
    const byType = Object.fromEntries(records.map((r) => [r.type, r]));

    expect(byType.property_profile).toMatchObject({
      type: "property_profile",
      name: "Posada Bolívar",
      address: "Calle 1, Mérida",
      timezone: "America/Caracas",
      confidence: 0.95,
    });
    expect(byType.room_type).toMatchObject({
      type: "room_type",
      name: "Doble",
      max_occupancy: 2,
      bed_type: "double",
      amenities: ["wifi", "pool"],
    });
    expect(byType.room).toMatchObject({
      type: "room",
      room_number: "101",
      room_type_name: "Doble",
    });
    expect(byType.rate_plan).toMatchObject({
      type: "rate_plan",
      room_type_name: "Doble",
      name: "standard",
      base_rate: 45,
      currency: "USD",
    });
    expect(byType.cancellation_rule).toMatchObject({
      type: "cancellation_rule",
      tier_name: "Flexible",
      time_boundary_hours: 48,
      refund_percentage: 100,
    });
    expect(byType.payment_config).toMatchObject({
      type: "payment_config",
      methods: ["zelle", "cash_usd"],
    });
  });

  it("orders room_type before its rooms/rate_plans (name→id resolution depends on it)", () => {
    const records = buildRecords(fullDraft());
    const rtIdx = records.findIndex((r) => r.type === "room_type");
    const roomIdx = records.findIndex((r) => r.type === "room");
    const rateIdx = records.findIndex((r) => r.type === "rate_plan");
    expect(rtIdx).toBeLessThan(roomIdx);
    expect(rtIdx).toBeLessThan(rateIdx);
  });

  it("omits optional payment_config / cancellation when not provided", () => {
    const d = emptyDraft();
    d.property.name = "Solo Nombre";
    const records = buildRecords(d);
    expect(records.find((r) => r.type === "payment_config")).toBeUndefined();
    expect(records.find((r) => r.type === "cancellation_rule")).toBeUndefined();
    expect(records).toHaveLength(1); // just the property profile
  });

  it("omits blank optional property fields so PMS defaults aren't overridden", () => {
    const d = emptyDraft();
    d.property = { name: "Posada X", address: "", timezone: "" };
    const profile = buildRecords(d)[0];
    expect(profile).not.toHaveProperty("address");
    expect(profile).not.toHaveProperty("timezone");
  });
});

describe("validation mirrors the PMS guard", () => {
  it("rejects a non-canonical currency", () => {
    expect(ratePlanSchema.safeParse({ roomTypeName: "Doble", baseRate: 10, currency: "GBP" }).success).toBe(false);
  });

  it("rejects non-positive occupancy and negative base rate", () => {
    expect(roomTypeSchema.safeParse({ name: "X", maxOccupancy: 0, amenities: [] }).success).toBe(false);
    expect(ratePlanSchema.safeParse({ roomTypeName: "Doble", baseRate: -1, currency: "USD" }).success).toBe(false);
  });

  it("rejects refund percentage out of 0..100", () => {
    expect(
      cancellationRuleSchema.safeParse({ tierName: "T", timeBoundaryHours: 24, refundPercentage: 150 }).success,
    ).toBe(false);
  });

  it("rejects a room/rate_plan that references an unknown room type", () => {
    const draft = {
      property: { name: "P" },
      roomTypes: [{ name: "Doble", maxOccupancy: 2, amenities: [] }],
      rooms: [{ roomNumber: "1", roomTypeName: "Suite" }], // not defined
      ratePlans: [],
    };
    expect(intakeDraftSchema.safeParse(draft).success).toBe(false);
  });

  it("rejects duplicate room type names", () => {
    const draft = {
      property: { name: "P" },
      roomTypes: [
        { name: "Doble", maxOccupancy: 2, amenities: [] },
        { name: "Doble", maxOccupancy: 3, amenities: [] },
      ],
    };
    expect(intakeDraftSchema.safeParse(draft).success).toBe(false);
  });

  it("accepts a well-formed full draft", () => {
    expect(intakeDraftSchema.safeParse(fullDraft()).success).toBe(true);
  });
});

describe("readiness", () => {
  it("an empty draft is not live-ready and blocks every required area", () => {
    const r = computeReadiness(emptyDraft());
    expect(r.ready).toBe(false);
    expect(r.blocking).toEqual(["property_profile", "room_type", "room", "rate_plan"]);
  });

  it("a full draft is live-ready with nothing blocking", () => {
    const r = computeReadiness(fullDraft());
    expect(r.ready).toBe(true);
    expect(r.blocking).toEqual([]);
  });
});

describe("computeIntakeRevision — idempotency key", () => {
  it("is deterministic and prefixed for identical content", () => {
    const a = computeIntakeRevision(buildIntakeFields(fullDraft()));
    const b = computeIntakeRevision(buildIntakeFields(fullDraft()));
    expect(a).toBe(b);
    expect(a).toMatch(/^crm-[0-9a-f]+$/);
  });

  it("changes when content changes", () => {
    const base = buildIntakeFields(fullDraft());
    const changed = fullDraft();
    changed.ratePlans[0].baseRate = 999;
    expect(computeIntakeRevision(base)).not.toBe(computeIntakeRevision(buildIntakeFields(changed)));
  });
});

describe("expandRoomNumbers — bulk entry", () => {
  it("expands an inclusive numeric range", () => {
    expect(expandRoomNumbers("101-105").numbers).toEqual(["101", "102", "103", "104", "105"]);
  });

  it("preserves zero-padding from the start of the range", () => {
    expect(expandRoomNumbers("001-003").numbers).toEqual(["001", "002", "003"]);
    expect(expandRoomNumbers("8-11").numbers).toEqual(["8", "9", "10", "11"]);
  });

  it("mixes ranges, singles, and non-numeric tokens; de-dupes", () => {
    const { numbers } = expandRoomNumbers("101-103, 101, 201, PH1");
    expect(numbers).toEqual(["101", "102", "103", "201", "PH1"]);
  });

  it("reports bad ranges and over-cap ranges without throwing", () => {
    expect(expandRoomNumbers("105-100").errors[0]).toMatch(/inicio mayor/i);
    expect(expandRoomNumbers("1-9999", { cap: 50 }).errors[0]).toMatch(/demasiado grande/i);
  });
});

describe("cascade edit / remove helpers", () => {
  function draftWithType(): IntakeDraft {
    return intakeDraftSchema.parse({
      property: { name: "P" },
      roomTypes: [{ name: "Doble", maxOccupancy: 2, amenities: [] }],
      rooms: [
        { roomNumber: "101", roomTypeName: "Doble" },
        { roomNumber: "102", roomTypeName: "Doble" },
      ],
      ratePlans: [{ roomTypeName: "Doble", name: "standard", baseRate: 40, currency: "USD" }],
    });
  }

  it("counts dependents of a room type", () => {
    expect(roomTypeDependents(draftWithType(), "Doble")).toEqual({ rooms: 2, ratePlans: 1 });
  });

  it("replaceRoomType cascades a rename into rooms + rate plans", () => {
    const renamed = { name: "Matrimonial", maxOccupancy: 2, bedType: null, amenities: [] };
    const next = replaceRoomType(draftWithType(), 0, renamed);
    expect(next.roomTypes[0].name).toBe("Matrimonial");
    expect(next.rooms.every((r) => r.roomTypeName === "Matrimonial")).toBe(true);
    expect(next.ratePlans[0].roomTypeName).toBe("Matrimonial");
    // and the result still validates (no orphans)
    expect(intakeDraftSchema.safeParse(next).success).toBe(true);
  });

  it("removeRoomTypeCascade drops the type and all its dependents", () => {
    const next = removeRoomTypeCascade(draftWithType(), 0);
    expect(next.roomTypes).toHaveLength(0);
    expect(next.rooms).toHaveLength(0);
    expect(next.ratePlans).toHaveLength(0);
  });
});

describe("amenity grouping", () => {
  it("covers every canonical amenity exactly once across groups", () => {
    const grouped = AMENITY_GROUPS.flatMap((g) => g.amenities);
    expect([...grouped].sort()).toEqual([...CANONICAL_AMENITIES].sort());
    expect(new Set(grouped).size).toBe(CANONICAL_AMENITIES.length);
  });
});
