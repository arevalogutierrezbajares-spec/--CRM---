/**
 * The public partner-upload route now enforces the allow-list + magic bytes
 * SERVER-side (the client list is advisory). These lock in the families the
 * form advertises — PDF, modern + legacy Office, zip, images, text — and the
 * executable rejections that make the gate worth having.
 */
import { describe, it, expect } from "vitest";
import {
  PARTNER_UPLOAD_EXTS,
  isAllowedPartnerUpload,
  isExecutableContent,
  sniffPartnerUpload,
} from "@/lib/project-files/sniff";

const bytes = (...b: number[]) => new Uint8Array(b);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00); // MZ
const ELF = bytes(0x7f, 0x45, 0x4c, 0x46);

describe("isAllowedPartnerUpload", () => {
  it("accepts every advertised extension", () => {
    for (const ext of PARTNER_UPLOAD_EXTS) {
      expect(isAllowedPartnerUpload(`file${ext}`)).toBe(true);
    }
  });

  it("rejects extensions outside the list", () => {
    for (const name of ["run.exe", "page.html", "script.sh", "noext", "a.svg"]) {
      expect(isAllowedPartnerUpload(name)).toBe(false);
    }
  });

  it("is case-insensitive on the extension", () => {
    expect(isAllowedPartnerUpload("REPORT.PDF")).toBe(true);
  });
});

describe("sniffPartnerUpload", () => {
  it("accepts content that matches the extension", () => {
    expect(sniffPartnerUpload("a.pdf", PDF).ok).toBe(true);
    expect(sniffPartnerUpload("a.png", PNG).ok).toBe(true);
    expect(sniffPartnerUpload("a.zip", ZIP).ok).toBe(true);
    expect(sniffPartnerUpload("a.docx", ZIP).ok).toBe(true);
    expect(sniffPartnerUpload("a.doc", OLE).ok).toBe(true);
    expect(sniffPartnerUpload("a.xls", OLE).ok).toBe(true);
    expect(sniffPartnerUpload("notes.txt", bytes(0x68, 0x69)).ok).toBe(true);
  });

  it("rejects renamed executables (the attack the client can't stop)", () => {
    expect(sniffPartnerUpload("invoice.pdf", EXE).ok).toBe(false);
    expect(sniffPartnerUpload("notes.txt", EXE).ok).toBe(false);
    expect(sniffPartnerUpload("data.csv", ELF).ok).toBe(false);
  });

  it("rejects content/extension mismatches", () => {
    expect(sniffPartnerUpload("photo.png", PDF).ok).toBe(false);
    expect(sniffPartnerUpload("deck.doc", PNG).ok).toBe(false);
    expect(sniffPartnerUpload("script.sh", PDF).ok).toBe(false);
  });
});

describe("isExecutableContent", () => {
  it("flags PE and ELF headers", () => {
    expect(isExecutableContent(EXE)).toBe(true);
    expect(isExecutableContent(ELF)).toBe(true);
    expect(isExecutableContent(PDF)).toBe(false);
  });
});
