import { describe, expect, it } from "vitest";
import { founderPhotoFor, founderProfileFor } from "@/lib/founder-photos";

describe("founderProfileFor", () => {
  it("resolves founders by email regardless of display name", () => {
    expect(founderProfileFor("tg.2000", "tg.2000@icloud.com")).toEqual({
      photoUrl: "/team/tomas.jpg",
      displayName: "Tomás Gutiérrez",
    });
    expect(founderProfileFor("joearevalo21", "joearevalo21@gmail.com")?.photoUrl).toBe(
      "/team/jose.jpg",
    );
    expect(
      founderProfileFor("charlesbrewerleon", "charlesbrewerleon@gmail.com")?.photoUrl,
    ).toBe("/team/charles.jpg");
  });

  it("resolves the WhatsApp-local account for José", () => {
    expect(founderProfileFor("Jose Ernesto", "+16466752101@whatsapp.local")?.photoUrl).toBe(
      "/team/jose.jpg",
    );
  });

  it("resolves by known handle without email", () => {
    expect(founderProfileFor("tg.2000")?.displayName).toBe("Tomás Gutiérrez");
    expect(founderProfileFor("charlesbrewerleon")?.photoUrl).toBe("/team/charles.jpg");
    expect(founderProfileFor("joearevalo21")?.photoUrl).toBe("/team/jose.jpg");
  });

  it("resolves by accented full name", () => {
    expect(founderProfileFor("Tomás Gutiérrez")?.photoUrl).toBe("/team/tomas.jpg");
    expect(founderProfileFor("José Ernesto Arévalo")?.photoUrl).toBe("/team/jose.jpg");
    expect(founderProfileFor("Charles Brewer")?.photoUrl).toBe("/team/charles.jpg");
  });

  it("resolves by first name only when unambiguous", () => {
    expect(founderProfileFor("Tomas")?.photoUrl).toBe("/team/tomas.jpg");
    expect(founderProfileFor("Charles")?.photoUrl).toBe("/team/charles.jpg");
  });

  it("returns null for shared accounts containing several surnames", () => {
    expect(founderProfileFor("arevalogutierrezbajares")).toBeNull();
    expect(founderProfileFor("Arévalo Gutiérrez Bajares")).toBeNull();
  });

  it("returns null for non-founders", () => {
    expect(founderProfileFor("Patricia Mendoza")).toBeNull();
    expect(founderProfileFor("Ana Ops", "ana@caneycloud.com")).toBeNull();
    expect(founderProfileFor(null)).toBeNull();
    expect(founderProfileFor("")).toBeNull();
  });
});

describe("founderPhotoFor", () => {
  it("returns the photo only", () => {
    expect(founderPhotoFor("tg.2000", "tg.2000@icloud.com")).toBe("/team/tomas.jpg");
    expect(founderPhotoFor("Patricia Mendoza")).toBeNull();
  });
});
