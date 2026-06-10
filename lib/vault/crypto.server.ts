import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";

// Vault encryption: AES-256-GCM with a server-held master key. The DB only
// stores ciphertext; the passphrase gate controls WHO may ask the server to
// decrypt. Losing VAULT_MASTER_KEY makes every stored secret unrecoverable.

function getMasterKey(): Buffer {
  const hex = process.env.VAULT_MASTER_KEY;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      "VAULT_MASTER_KEY must be set to 64 hex chars (openssl rand -hex 32)",
    );
  }
  return Buffer.from(hex, "hex");
}

export function isVaultConfigured() {
  const hex = process.env.VAULT_MASTER_KEY;
  return !!hex && /^[0-9a-f]{64}$/i.test(hex);
}

export function encryptVaultSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMasterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

export function decryptVaultSecret(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed vault payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getMasterKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function newVaultSalt() {
  return randomBytes(16).toString("hex");
}

export function hashVaultPassphrase(passphrase: string, salt: string) {
  return scryptSync(passphrase, salt, 32).toString("hex");
}

function safeEqualHex(a: string, b: string) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return (
    bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB)
  );
}

export function verifyVaultPassphrase(
  passphrase: string,
  salt: string,
  expectedHash: string,
) {
  return safeEqualHex(hashVaultPassphrase(passphrase, salt), expectedHash);
}

/** Grant cookie value — derived from the stored hash, so changing the
 *  passphrase invalidates every previously unlocked browser. */
export function vaultGrantValue(userId: string, passphraseHash: string) {
  return createHmac("sha256", getMasterKey())
    .update(`vault-grant:${userId}:${passphraseHash}`)
    .digest("hex");
}

export function verifyVaultGrant(
  cookieValue: string,
  userId: string,
  passphraseHash: string,
) {
  if (!/^[0-9a-f]{64}$/.test(cookieValue)) return false;
  return safeEqualHex(cookieValue, vaultGrantValue(userId, passphraseHash));
}
