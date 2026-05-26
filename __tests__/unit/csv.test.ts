import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("renders a simple table", () => {
    const csv = toCsv(
      ["name", "age"],
      [
        { name: "Ana", age: 30 },
        { name: "Bob", age: 45 },
      ],
    );
    expect(csv).toBe("name,age\r\nAna,30\r\nBob,45\r\n");
  });

  it("escapes commas, quotes, and newlines", () => {
    const csv = toCsv(
      ["text"],
      [{ text: 'hello, "world"\nnext line' }],
    );
    expect(csv).toBe('text\r\n"hello, ""world""\nnext line"\r\n');
  });

  it("formats dates as ISO + nulls as empty", () => {
    const csv = toCsv(
      ["d", "n"],
      [{ d: new Date("2026-05-26T12:00:00Z"), n: null }],
    );
    expect(csv).toBe("d,n\r\n2026-05-26T12:00:00.000Z,\r\n");
  });

  it("renders objects as JSON", () => {
    const csv = toCsv(
      ["payload"],
      [{ payload: { a: 1, b: "x" } }],
    );
    expect(csv).toContain('"{""a"":1,""b"":""x""}"');
  });
});
