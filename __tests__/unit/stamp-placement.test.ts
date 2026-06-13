import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { sha256Hex, stampSignedPdf } from "@/lib/signatures/stamp.server";
import { makeTestSignaturePng } from "../helpers/png";

// 200x80 transparent PNG with a stroke — stands in for a drawn signature.
const SIG_PNG = makeTestSignaturePng();

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]); // US Letter
  return doc.save();
}

const BASE = {
  signaturePng: SIG_PNG,
  title: "Contrato de prueba",
  signerName: "Karen Brewer",
  signerEmail: "karen@example.com",
  signedAt: new Date("2026-06-12T19:30:00.000Z"),
  ip: "190.0.0.1",
  userAgent: "iPhone Safari (prueba)",
};

describe("stampSignedPdf placement", () => {
  it("embeds the signature into the chosen page and still appends the acta", async () => {
    const pdf = await makePdf(2);
    const out = await stampSignedPdf({
      ...BASE,
      pdfBytes: pdf,
      documentSha256: sha256Hex(pdf),
      placement: { pageIndex: 1, x: 0.1, y: 0.8, width: 0.35 },
    });
    const stamped = await PDFDocument.load(out);
    expect(stamped.getPageCount()).toBe(3); // 2 originals + acta
    // The placed page now carries content (image XObject) the blank page lacked.
    const page = stamped.getPage(1);
    expect(page.node.Resources()?.lookup).toBeDefined();
    expect(out.length).toBeGreaterThan(pdf.length);
  });

  it("clamps an out-of-range page index instead of throwing", async () => {
    const pdf = await makePdf(1);
    const out = await stampSignedPdf({
      ...BASE,
      pdfBytes: pdf,
      documentSha256: sha256Hex(pdf),
      placement: { pageIndex: 99, x: 0.5, y: 0.5, width: 0.4 },
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("clamps placements that would overflow the page edge", async () => {
    const pdf = await makePdf(1);
    const out = await stampSignedPdf({
      ...BASE,
      pdfBytes: pdf,
      documentSha256: sha256Hex(pdf),
      placement: { pageIndex: 0, x: 0.99, y: 0.99, width: 0.5 },
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("keeps the pad-only path (no placement) working unchanged", async () => {
    const pdf = await makePdf(1);
    const out = await stampSignedPdf({
      ...BASE,
      pdfBytes: pdf,
      documentSha256: sha256Hex(pdf),
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
});
