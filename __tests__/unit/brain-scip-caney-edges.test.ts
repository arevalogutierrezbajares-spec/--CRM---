/**
 * THE BRAIN — SCIP-backed Caney route→table extractor (pure helpers).
 *
 * Locks the symbol-classification + reference-collection logic that turns a SCIP
 * index into route→table edges: class-only symbol parsing, models.py-scoped
 * model discovery, api/-scoped reference collection (dedup + sorted, ignoring the
 * model's own definition), and __tablename__ mapping.
 */

import { describe, it, expect } from "vitest";
import {
  classNameOfSymbol,
  isDefinition,
  parseModelSymbols,
  parseRouteTableRefs,
  parseClassTables,
  isRouteDoc,
  loadScipReport,
  scipCaneyEdges,
} from "@/scripts/brain/extractors/scip-caney-edges.mjs";

const sym = (mod: string, tail: string) =>
  `scip-python python caneycloud-backend abc123 \`${mod}\`/${tail}`;

const BOOKING = sym("APP.backend.db.models", "Booking#");
const BOOKING_ID = sym("APP.backend.db.models", "Booking#id.");
const CHANNEL = sym("APP.backend.db.models", "Channel#");
const SERVICE_CLASS = sym("APP.backend.services.pricing", "PriceEngine#"); // not a model

const def = (symbol: string) => ({ range: [0, 0, 0], symbol, symbol_roles: 1 });
const ref = (symbol: string) => ({ range: [1, 0, 1], symbol, symbol_roles: 8 }); // ReadAccess

describe("classNameOfSymbol", () => {
  it("extracts the class name from a class symbol (`/Name#`)", () => {
    expect(classNameOfSymbol(BOOKING)).toBe("Booking");
    expect(classNameOfSymbol(CHANNEL)).toBe("Channel");
  });
  it("rejects members and non-class symbols", () => {
    expect(classNameOfSymbol(BOOKING_ID)).toBeNull(); // field `Booking#id.`
    expect(classNameOfSymbol(sym("m", "fn().") )).toBeNull();
    expect(classNameOfSymbol("")).toBeNull();
  });
});

describe("isDefinition / isRouteDoc", () => {
  it("reads the Definition role bit", () => {
    expect(isDefinition({ symbol_roles: 1 })).toBe(true);
    expect(isDefinition({ symbol_roles: 9 })).toBe(true); // Definition|ReadAccess
    expect(isDefinition({ symbol_roles: 8 })).toBe(false);
    expect(isDefinition({})).toBe(false);
  });
  it("flags api/ documents as route handlers", () => {
    expect(isRouteDoc({ relative_path: "api/v1/admin_bookings.py" })).toBe(true);
    expect(isRouteDoc({ relative_path: "db/models.py" })).toBe(false);
  });
});

describe("parseModelSymbols", () => {
  const documents = [
    {
      relative_path: "db/models.py",
      occurrences: [def(BOOKING), def(BOOKING_ID), def(CHANNEL)],
    },
    {
      // a class defined OUTSIDE a models.py file is not a model
      relative_path: "services/pricing.py",
      occurrences: [def(SERVICE_CLASS)],
    },
    {
      // a reference (not a definition) does not register a model
      relative_path: "comms/models.py",
      occurrences: [ref(BOOKING)],
    },
  ];

  it("registers only class definitions inside *models.py", () => {
    const m = parseModelSymbols(documents);
    expect(m.get(BOOKING)).toBe("Booking");
    expect(m.get(CHANNEL)).toBe("Channel");
    expect(m.has(BOOKING_ID)).toBe(false); // a field, not a class
    expect(m.has(SERVICE_CLASS)).toBe(false); // not a models.py file
    expect(m.size).toBe(2);
  });
});

describe("parseRouteTableRefs", () => {
  const modelSymbols = new Map([
    [BOOKING, "Booking"],
    [CHANNEL, "Channel"],
  ]);
  const documents = [
    {
      relative_path: "api/v1/admin_bookings.py",
      occurrences: [ref(BOOKING), ref(BOOKING), ref(CHANNEL)], // dup Booking
    },
    {
      // not an api/ doc — ignored even though it references a model
      relative_path: "services/booking.py",
      occurrences: [ref(BOOKING)],
    },
    {
      // a model's own definition is not a route reference
      relative_path: "api/v1/models_admin.py",
      occurrences: [def(BOOKING)],
    },
  ];

  it("collects distinct (routeFile, class) refs from api/ docs only, sorted", () => {
    const refs = parseRouteTableRefs(documents, modelSymbols);
    expect(refs).toEqual([
      { routeFile: "api/v1/admin_bookings.py", cls: "Booking" },
      { routeFile: "api/v1/admin_bookings.py", cls: "Channel" },
    ]);
  });
});

describe("parseClassTables", () => {
  it("maps each model class to its __tablename__ across model files", () => {
    const files: [string, string][] = [
      [
        "db/models.py",
        `class Booking(Base):\n    __tablename__ = "bookings"\n\nclass Channel(Base):\n    __tablename__ = "channels"\n`,
      ],
      [
        "comms/models.py",
        `class Message(Base):\n    id = Column(Integer)\n    __tablename__ = 'messages'\n`,
      ],
    ];
    expect(parseClassTables(files)).toEqual({
      Booking: "bookings",
      Channel: "channels",
      Message: "messages",
    });
  });
});

describe("loadScipReport / scipCaneyEdges (portable source)", () => {
  it("loads pre-extracted edges from the committed report (no index needed)", () => {
    const { edges, stats } = loadScipReport();
    expect(stats.available).toBe(true);
    expect(stats.source).toBe("report");
    expect(edges.length).toBeGreaterThan(0);
    // shape is identical to the index extractor's output
    for (const e of edges.slice(0, 3)) {
      expect(e).toHaveProperty("routeFile");
      expect(e).toHaveProperty("table");
      expect(["reads", "writes"]).toContain(e.direction);
    }
  });

  it("degrades to empty when the report is absent", () => {
    const r = loadScipReport("/definitely/not/a/report.json");
    expect(r.stats.available).toBe(false);
    expect(r.edges).toEqual([]);
  });

  it("falls back to the report when no raw index is present", () => {
    const { stats } = scipCaneyEdges({ indexPath: "/definitely/not/an/index.json" });
    expect(stats.available).toBe(true);
    expect(stats.source).toBe("report");
  });
});
