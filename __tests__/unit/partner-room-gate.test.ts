/**
 * The partner-room passcode gate is a soft layer on top of the 160-bit access
 * token. These lock in: 4-digit validation, room-scoped hashing (same PIN in
 * two rooms ≠ same hash), the grant-cookie derivation (changing/removing the
 * passcode invalidates old grants), constant-time verification, and the
 * cookie-name scheme (room-scoped, no hyphens).
 */
import { describe, it, expect } from "vitest";
import {
  isValidPartnerPasscode,
  hashPartnerRoomPasscode,
  partnerGateCookieName,
  partnerMemberCookieName,
  partnerGateCookieValue,
  verifyPasscodeAgainstHash,
} from "@/lib/partner-room-gate.server";

const ROOM_A = "11111111-1111-1111-1111-111111111111";
const ROOM_B = "22222222-2222-2222-2222-222222222222";

describe("partner room passcode gate", () => {
  it("accepts exactly four digits and nothing else", () => {
    expect(isValidPartnerPasscode("1234")).toBe(true);
    expect(isValidPartnerPasscode("0000")).toBe(true);
    expect(isValidPartnerPasscode("123")).toBe(false);
    expect(isValidPartnerPasscode("12345")).toBe(false);
    expect(isValidPartnerPasscode("12a4")).toBe(false);
    expect(isValidPartnerPasscode("")).toBe(false);
    expect(isValidPartnerPasscode(" 1234")).toBe(false);
  });

  it("scopes the passcode hash to the room (same PIN, different hash)", () => {
    const a = hashPartnerRoomPasscode(ROOM_A, "1234");
    const b = hashPartnerRoomPasscode(ROOM_B, "1234");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a passcode against its stored hash, constant-time", () => {
    const hash = hashPartnerRoomPasscode(ROOM_A, "4729");
    expect(verifyPasscodeAgainstHash(ROOM_A, "4729", hash)).toBe(true);
    expect(verifyPasscodeAgainstHash(ROOM_A, "4720", hash)).toBe(false);
    // a hash from another room must not validate even with the right PIN
    expect(verifyPasscodeAgainstHash(ROOM_B, "4729", hash)).toBe(false);
  });

  it("derives a grant cookie that changes when the passcode hash changes", () => {
    const h1 = hashPartnerRoomPasscode(ROOM_A, "1234");
    const h2 = hashPartnerRoomPasscode(ROOM_A, "9999");
    const grant1 = partnerGateCookieValue(ROOM_A, h1);
    const grant2 = partnerGateCookieValue(ROOM_A, h2);
    expect(grant1).not.toBe(grant2);
    expect(grant1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("room-scopes cookie names and strips hyphens", () => {
    expect(partnerGateCookieName(ROOM_A)).toBe(
      "pa_grant_11111111111111111111111111111111",
    );
    expect(partnerMemberCookieName(ROOM_A)).toBe(
      "pa_member_11111111111111111111111111111111",
    );
    expect(partnerGateCookieName(ROOM_A)).not.toBe(partnerGateCookieName(ROOM_B));
  });
});
