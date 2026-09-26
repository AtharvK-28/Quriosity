/**
 * Password hashing — Argon2id with TRD §13.4's parameters.
 *
 * `@node-rs/argon2` ships prebuilt binaries, so the server installs on a
 * hosting image without a compiler. No password is ever logged (SEC2).
 */

import { hash, verify } from "@node-rs/argon2";

// Algorithm.Argon2id. Written as the number because the package exports the
// enum as a const enum, which does not survive `isolatedModules`.
const ARGON2ID = 2;

const OPTIONS = {
  algorithm: ARGON2ID,
  timeCost: 3,
  memoryCost: 64 * 1024, // KiB → 64 MB
  parallelism: 4,
} as const;

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 256;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function checkPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/**
 * A hash to verify against when the email is unknown, so a missing account
 * takes as long to reject as a wrong password — login must not tell an
 * attacker which emails exist (PRD E1-S1: "non-enumerating").
 */
let decoy: Promise<string> | null = null;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword("decoy-password-never-used");
  return decoy;
}
