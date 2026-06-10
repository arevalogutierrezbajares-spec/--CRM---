/**
 * Vault crypto invariants: GCM roundtrip, tamper rejection, unique IVs,
 * scrypt passphrase verification, and grant derivation (changing the
 * passphrase hash invalidates old grants; grants are user-scoped).
 */
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.VAULT_MASTER_KEY = "a".repeat(64);
});

describe("vault crypto", () => {
  it("roundtrips a secret", async () => {
    const { encryptVaultSecret, decryptVaultSecret } = await import(
      "@/lib/vault/crypto.server"
    );
    const payload = encryptVaultSecret("hunter2 — ñandú 🔐");
    expect(payload.startsWith("v1.")).toBe(true);
    expect(decryptVaultSecret(payload)).toBe("hunter2 — ñandú 🔐");
  });

  it("uses a fresh IV per encryption", async () => {
    const { encryptVaultSecret } = await import("@/lib/vault/crypto.server");
    expect(encryptVaultSecret("same")).not.toBe(encryptVaultSecret("same"));
  });

  it("rejects tampered ciphertext", async () => {
    const { encryptVaultSecret, decryptVaultSecret } = await import(
      "@/lib/vault/crypto.server"
    );
    const [v, iv, tag, ct] = encryptVaultSecret("secret").split(".");
    const flipped = ct[0] === "A" ? "B" + ct.slice(1) : "A" + ct.slice(1);
    expect(() => decryptVaultSecret([v, iv, tag, flipped].join("."))).toThrow();
  });

  it("verifies passphrases via scrypt and rejects wrong ones", async () => {
    const { newVaultSalt, hashVaultPassphrase, verifyVaultPassphrase } =
      await import("@/lib/vault/crypto.server");
    const salt = newVaultSalt();
    const hash = hashVaultPassphrase("correct horse", salt);
    expect(verifyVaultPassphrase("correct horse", salt, hash)).toBe(true);
    expect(verifyVaultPassphrase("wrong horse", salt, hash)).toBe(false);
    // Same passphrase, different salt → different hash.
    expect(hashVaultPassphrase("correct horse", newVaultSalt())).not.toBe(hash);
  });

  it("derives grants per user and invalidates on passphrase change", async () => {
    const { vaultGrantValue, verifyVaultGrant } = await import(
      "@/lib/vault/crypto.server"
    );
    const grant = vaultGrantValue("user-1", "hash-1");
    expect(verifyVaultGrant(grant, "user-1", "hash-1")).toBe(true);
    expect(verifyVaultGrant(grant, "user-2", "hash-1")).toBe(false); // other user
    expect(verifyVaultGrant(grant, "user-1", "hash-2")).toBe(false); // pass changed
    expect(verifyVaultGrant("zz", "user-1", "hash-1")).toBe(false); // malformed
  });
});
