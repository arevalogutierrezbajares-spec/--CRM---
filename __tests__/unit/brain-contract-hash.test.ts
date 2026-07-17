import { describe, expect, it } from "vitest";
import {
  diffContract,
  typedFieldDiffer,
} from "../../scripts/brain/extractors/contract-hasher.mjs";

describe("contract-hasher", () => {
  it("same hashes → ok", () => {
    expect(diffContract("abc", "abc")).toBe("ok");
  });

  it("changed hashes → warn under typed-field-red when no removed fields", () => {
    expect(diffContract("abc", "def")).toBe("warn");
  });

  it("null either side → ok (undecidable)", () => {
    expect(diffContract(null, "abc")).toBe("ok");
    expect(diffContract("abc", null)).toBe("ok");
  });

  it("typedFieldDiffer is stubbed false", () => {
    expect(typedFieldDiffer(["foo"], ["consumer"])).toBe(false);
  });
});
