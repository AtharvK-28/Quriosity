/**
 * Signed completion records — PRD E8-S5, closing what the browser could not.
 *
 * A record the browser issues carries a checksum: it proves the record was
 * not edited, not who earned it. This signs it. The server rebuilds the record
 * itself from the account's synced progress — so nothing on it is the
 * learner's say-so — puts the account's name on it, and signs the same bytes
 * the checksum covers with Ed25519. Anyone can check the signature against
 * the public key at GET /records/key; the record page asks GET /records/verify.
 *
 * The key is derived from JWT_SECRET with HKDF, so there is no second secret
 * to manage. Rotating JWT_SECRET retires every signature, which is the right
 * behaviour for a leaked secret.
 */

import { createPrivateKey, createPublicKey, hkdfSync, sign, verify, type KeyObject } from "node:crypto";

export interface RecordKeys {
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** The raw 32-byte public key, base64url — what a verifier needs. */
  publicRaw: string;
}

// An Ed25519 private key in PKCS#8 is this fixed prefix and the 32-byte seed.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function recordKeys(jwtSecret: string): RecordKeys {
  const seed = Buffer.from(hkdfSync("sha256", jwtSecret, "quriosity", "record-signing-v1", 32));
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  return { privateKey, publicKey, publicRaw: jwk.x };
}

/** What gets signed: the domain and the record's body, exactly as encoded. */
const signed = (body: string) => Buffer.from(`quriosity.record.v1.signed\n${body}`, "utf8");

export function signBody(keys: RecordKeys, body: string): string {
  return sign(null, signed(body), keys.privateKey).toString("base64url");
}

export function verifyBody(keys: RecordKeys, body: string, signature: string): boolean {
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(signature)) return false;
  try {
    return verify(null, signed(body), keys.publicKey, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}
