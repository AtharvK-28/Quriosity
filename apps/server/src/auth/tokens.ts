/**
 * Access and refresh tokens — TRD §13.4.
 *
 *   Access   a JWT (HS256), 15 minutes. Held in the client's memory only,
 *            never in localStorage, and sent as a Bearer header.
 *   Refresh  an opaque random token, 30 days, in an httpOnly cookie. Rotated
 *            on every use; presenting a used one means it was copied, and the
 *            whole family is revoked. Only its SHA-256 is stored.
 *
 * HS256 is signed with node:crypto rather than a library: it is fifteen lines,
 * and the only algorithm accepted is the one this file signs with, so the
 * "alg: none" class of bug has nowhere to live.
 */

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Db } from "../db/db.ts";

export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Role = "student" | "instructor" | "admin";

export interface AccessClaims {
  sub: string;
  role: Role;
  name: string;
  iat: number;
  exp: number;
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function signAccess(secret: string, claims: { sub: string; role: Role; name: string }, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...claims, iat, exp: iat + ACCESS_TTL_S }));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyAccess(secret: string, token: string, now = Date.now()): AccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  try {
    const h = JSON.parse(Buffer.from(header, "base64url").toString());
    if (h.alg !== "HS256") return null;
    const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as AccessClaims;
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number") return null;
    if (claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

/* -- Refresh tokens ----------------------------------------------------------- */

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Issues a refresh token, in `family` (a rotation) or a new one (a login). */
export async function issueRefresh(db: Db, userId: string, family?: string, now = Date.now()): Promise<string> {
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, family, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, family ?? randomUUID(), sha256(secret), now + REFRESH_TTL_MS, now],
  );
  return `${id}.${secret}`;
}

export type RotateResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: "invalid" | "expired" | "reused" };

/**
 * Spends a refresh token and returns its successor. A token that was already
 * spent is a copy: its whole family is revoked, logging out every device that
 * holds a descendant, including the attacker's.
 */
export async function rotateRefresh(db: Db, presented: string, now = Date.now()): Promise<RotateResult> {
  const [id, secret] = presented.split(".");
  if (!id || !secret) return { ok: false, reason: "invalid" };

  return db.tx(async (q) => {
    const [row] = await q.query("SELECT * FROM refresh_tokens WHERE id = $1 FOR UPDATE", [id]);
    if (!row) return { ok: false, reason: "invalid" } as const;

    const expected = Buffer.from(String(row.token_hash), "hex");
    const given = Buffer.from(sha256(secret), "hex");
    if (!timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" } as const;

    if (row.used_at !== null || row.revoked_at !== null) {
      await q.query("UPDATE refresh_tokens SET revoked_at = $1 WHERE family = $2 AND revoked_at IS NULL", [now, row.family]);
      return { ok: false, reason: "reused" } as const;
    }
    if (Number(row.expires_at) <= now) return { ok: false, reason: "expired" } as const;

    await q.query("UPDATE refresh_tokens SET used_at = $1 WHERE id = $2", [now, id]);
    const nextId = randomUUID();
    const nextSecret = randomBytes(32).toString("base64url");
    await q.query(
      `INSERT INTO refresh_tokens (id, user_id, family, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [nextId, row.user_id, row.family, sha256(nextSecret), now + REFRESH_TTL_MS, now],
    );
    return { ok: true, userId: String(row.user_id), token: `${nextId}.${nextSecret}` } as const;
  });
}

/** Logout: the presented token's family, and only that device's, is revoked. */
export async function revokeRefresh(db: Db, presented: string, now = Date.now()): Promise<void> {
  const [id] = presented.split(".");
  if (!id) return;
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = $1
     WHERE family = (SELECT family FROM refresh_tokens WHERE id = $2) AND revoked_at IS NULL`,
    [now, id],
  );
}
