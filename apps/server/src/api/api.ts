/**
 * The REST API: accounts, a learner's synced progress and circuits, cohorts.
 *
 *   POST   /auth/signup           { email, password, displayName, instructorCode? }
 *   POST   /auth/login            { email, password }
 *   POST   /auth/refresh          (refresh cookie)  → a new access token
 *   POST   /auth/logout           (refresh cookie)
 *   GET    /me
 *   DELETE /me                    { password }      PRD E1-S7
 *   GET    /me/documents/:kind                      synced progress
 *   PUT    /me/documents/:kind    { doc }
 *   GET    /me/circuits                             PRD E11-S1
 *   PUT    /me/circuits/:id       { name, circuit, savedAt?, updatedAt? }
 *   DELETE /me/circuits/:id
 *   POST   /cohorts               { name }          instructor, admin
 *   GET    /cohorts                                 own, joined, or all (admin)
 *   POST   /cohorts/join          { code }
 *   GET    /cohorts/:id/report                      that cohort's instructor, or an admin
 *   POST   /me/attempts           { place, ir, fidelity, ruleId?, misconceptionId?, message? }
 *   GET    /me/assignments                          what my classes have set me
 *   GET    /cohorts/:id/students/:uid/attempts      instructor — PRD E10-S5
 *   GET    /cohorts/:id/assignments                 instructor, with completion — E10-S4
 *   POST   /cohorts/:id/assignments { kind, itemId, dueAt }
 *   DELETE /cohorts/:id/assignments/:aid
 *   GET    /cohorts/:id/challenges                  instructor — authored challenges published here (E8-S6)
 *   POST   /cohorts/:id/challenges { challenge }
 *   DELETE /cohorts/:id/challenges/:cid
 *   GET    /me/challenges                           published to classes I am in
 *   POST   /records/sign          { track }         a signed completion record, from synced progress
 *   GET    /records/verify?code=                    public — is this record signed by this server?
 *   GET    /records/key                             public — the Ed25519 key records are signed with
 *   POST   /daily/start                             start today's puzzle clock (server time)
 *   POST   /daily/submit          { ir }            graded here; the first pass is your result
 *   GET    /daily/leaderboard                       public — today's fewest gates, then fastest
 *
 * SEC4: every authorisation decision is made here, per request, from the
 * verified token — never inferred from which buttons the client shows. An
 * instructor asking for someone else's cohort gets a 403 from this file, not
 * an empty screen from the web app.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import type { Db } from "../db/db.ts";
import { checkPassword, decoyHash, hashPassword, MAX_PASSWORD, MIN_PASSWORD } from "../auth/password.ts";
import {
  issueRefresh, revokeRefresh, rotateRefresh, signAccess, verifyAccess,
  REFRESH_TTL_MS, type AccessClaims, type Role,
} from "../auth/tokens.ts";
import { bearer, cookies, clientIp, HttpError, rateLimiter, readJson, sendJson } from "../http/kit.ts";
import { validate } from "../../../web/lib/ir/validate";
import type { Circuit } from "../../../web/lib/ir/types";
import { NODES_BY_ID } from "../../../web/lib/curriculum/nodes";
import { CHALLENGES_BY_ID } from "../../../web/lib/curriculum/challenges";
import { TRACKS_BY_ID, trackProgress } from "../../../web/lib/curriculum/tracks";
import { buildRecord, encodeRecord, readRecord, splitRecordCode } from "../../../web/lib/curriculum/record";
import { GATES } from "../../../web/lib/ir/gates";
import { recordKeys, signBody, verifyBody } from "../records/sign.ts";
import { dailyChallenge, dayKey } from "../../../web/lib/daily";
import { simulate } from "../../../web/lib/sim/statevector";
import { grade } from "../../../web/lib/grade/fidelity";
import { gateCount } from "../../../web/lib/ir/types";

export interface ApiOptions {
  db: Db;
  jwtSecret: string;
  /** Signing up with this code makes an instructor account (PRD E1-S5). */
  instructorCode?: string;
  /** Emails that become admin accounts on signup. */
  adminEmails?: string[];
  /** Secure cookies: on everywhere but plain-http local development. */
  secureCookies: boolean;
  /** Attempts per minute per address on /auth/*. TRD §13.2 says 10. */
  authPerMinute?: number;
}

const REFRESH_COOKIE = "qr_refresh";
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;
const DOC_KINDS = new Set(["session"]);
const MAX_DOC_BYTES = 256 * 1024;
const MAX_CIRCUITS = 200;
const MAX_ATTEMPTS = 100;
const PLACE = /^(lesson|challenge):[\w.-]{1,64}$/;

/** A title for an assignable item, or null if the curriculum has no such thing. */
function itemTitle(kind: string, id: string): string | null {
  if (kind === "node") return NODES_BY_ID.get(id)?.title ?? null;
  if (kind === "challenge") return CHALLENGES_BY_ID.get(id)?.title ?? null;
  return null;
}

/** Has this learner's synced progress done the item? */
function isDone(doc: unknown, kind: string, id: string): boolean {
  const d = (doc ?? {}) as {
    progress?: Record<string, { state?: string }>;
    challenges?: Record<string, { solved?: boolean }>;
  };
  return kind === "node" ? d.progress?.[id]?.state === "passed" : Boolean(d.challenges?.[id]?.solved);
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

const toUser = (r: Record<string, unknown>): PublicUser => ({
  id: String(r.id),
  email: String(r.email),
  displayName: String(r.display_name),
  role: r.role as Role,
});

function str(v: unknown, field: string, max: number): string {
  if (typeof v !== "string") throw new HttpError(400, `${field} is required.`);
  const s = v.trim();
  if (!s) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} is too long.`);
  return s;
}

/* -- Published challenges ------------------------------------------------------ */

const MAX_CLASS_CHALLENGES = 50;
const MAX_AUTHORED_QUBITS = 8;
const MAX_AUTHORED_GATES = 60;

/**
 * An authored challenge from the web app, checked field by field and rebuilt
 * from known keys only (SEC6) — so what members download is exactly what the
 * web app's runner expects, and nothing else.
 */
function authoredChallenge(raw: unknown) {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "challenge is required.");
  const c = raw as Record<string, unknown>;
  const title = str(c.title, "Title", 80);
  const brief = str(c.brief, "Brief", 300);
  const hint = typeof c.hint === "string" ? c.hint.trim().slice(0, 300) : "";
  const kind = c.kind === "golf" ? "golf" : c.kind === "reach" ? "reach" : null;
  if (!kind) throw new HttpError(400, "kind must be reach or golf.");
  const reference = c.reference as Circuit;
  if (!reference || typeof reference !== "object" || !validate(reference).valid) {
    throw new HttpError(400, "The reference circuit isn't valid.");
  }
  if (reference.qubits > MAX_AUTHORED_QUBITS) throw new HttpError(400, `Published challenges use up to ${MAX_AUTHORED_QUBITS} qubits.`);
  if (reference.gates.length > MAX_AUTHORED_GATES) throw new HttpError(400, `Published challenges use up to ${MAX_AUTHORED_GATES} gates.`);
  const allowed = Array.isArray(c.allowedGates) ? c.allowedGates : [];
  if (allowed.length === 0 || !allowed.every((g) => typeof g === "string" && g in GATES)) {
    throw new HttpError(400, "allowedGates must name gates from the registry.");
  }
  return { title, brief, hint, kind, reference, allowedGates: [...new Set(allowed as string[])] };
}

export function createApi(opts: ApiOptions) {
  const { db, jwtSecret } = opts;
  const keys = recordKeys(jwtSecret);
  const authLimit = rateLimiter(opts.authPerMinute ?? 10, 60_000); // TRD §13.2
  const writeLimit = rateLimiter(120, 60_000);

  function refreshCookie(token: string | null): string {
    const attrs = [
      `${REFRESH_COOKIE}=${token ? encodeURIComponent(token) : ""}`,
      "HttpOnly",
      "SameSite=Strict",
      "Path=/",
      `Max-Age=${token ? Math.floor(REFRESH_TTL_MS / 1000) : 0}`,
    ];
    if (opts.secureCookies) attrs.push("Secure");
    return attrs.join("; ");
  }

  async function session(res: ServerResponse, status: number, user: PublicUser, family?: string) {
    const refresh = await issueRefresh(db, user.id, family);
    const accessToken = signAccess(jwtSecret, { sub: user.id, role: user.role, name: user.displayName });
    sendJson(res, status, { accessToken, user }, { "set-cookie": refreshCookie(refresh) });
  }

  function requireUser(req: IncomingMessage): AccessClaims {
    const token = bearer(req);
    const claims = token ? verifyAccess(jwtSecret, token) : null;
    if (!claims) throw new HttpError(401, "Sign in to do that.");
    return claims;
  }

  async function loadUser(id: string): Promise<PublicUser | null> {
    const [r] = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    return r ? toUser(r) : null;
  }

  /* -- Handlers --------------------------------------------------------------- */

  async function signup(req: IncomingMessage, res: ServerResponse) {
    const body = await readJson(req);
    const email = str(body.email, "Email", 320).toLowerCase();
    if (!EMAIL.test(email)) throw new HttpError(400, "That doesn't look like an email address.");
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_PASSWORD) throw new HttpError(400, `Passwords need at least ${MIN_PASSWORD} characters.`);
    if (password.length > MAX_PASSWORD) throw new HttpError(400, "That password is too long.");
    const displayName = str(body.displayName, "Name", 60);

    const code = typeof body.instructorCode === "string" ? body.instructorCode.trim() : "";
    if (code && code !== opts.instructorCode) throw new HttpError(400, "That instructor code isn't right.");
    const role: Role = opts.adminEmails?.includes(email) ? "admin" : code ? "instructor" : "student";

    const passwordHash = await hashPassword(password);
    const id = randomUUID();
    const rows = await db.query(
      `INSERT INTO users (id, email, password_hash, display_name, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING RETURNING *`,
      [id, email, passwordHash, displayName, role, Date.now()],
    );
    // Without email delivery there is no way to answer a duplicate signup that
    // doesn't reveal the address is taken. The /auth rate limit bounds how
    // fast anyone can use that; the message at least doesn't confirm it.
    if (!rows[0]) throw new HttpError(409, "We couldn't create an account with that email. If it's yours, sign in instead.");
    await session(res, 201, toUser(rows[0]));
  }

  async function login(req: IncomingMessage, res: ServerResponse) {
    const body = await readJson(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const [row] = email ? await db.query("SELECT * FROM users WHERE email = $1", [email]) : [];
    // The same work either way, so timing does not reveal which emails exist.
    const ok = await checkPassword(row ? String(row.password_hash) : await decoyHash(), password);
    if (!row || !ok) throw new HttpError(401, "That email and password don't match.");
    await session(res, 200, toUser(row));
  }

  async function refresh(req: IncomingMessage, res: ServerResponse) {
    const presented = cookies(req)[REFRESH_COOKIE];
    if (!presented) throw new HttpError(401, "Not signed in.");
    const out = await rotateRefresh(db, presented);
    if (!out.ok) {
      sendJson(res, 401, { error: out.reason === "reused" ? "Signed out for safety — sign in again." : "Not signed in." }, {
        "set-cookie": refreshCookie(null),
      });
      return;
    }
    const user = await loadUser(out.userId);
    if (!user) throw new HttpError(401, "Not signed in.");
    const accessToken = signAccess(jwtSecret, { sub: user.id, role: user.role, name: user.displayName });
    sendJson(res, 200, { accessToken, user }, { "set-cookie": refreshCookie(out.token) });
  }

  async function logout(req: IncomingMessage, res: ServerResponse) {
    const presented = cookies(req)[REFRESH_COOKIE];
    if (presented) await revokeRefresh(db, presented);
    sendJson(res, 200, { ok: true }, { "set-cookie": refreshCookie(null) });
  }

  async function deleteMe(req: IncomingMessage, res: ServerResponse, me: AccessClaims) {
    const body = await readJson(req);
    const [row] = await db.query("SELECT * FROM users WHERE id = $1", [me.sub]);
    if (!row) throw new HttpError(404, "No such account.");
    const ok = await checkPassword(String(row.password_hash), typeof body.password === "string" ? body.password : "");
    if (!ok) throw new HttpError(403, "That password isn't right.");

    await db.tx(async (q) => {
      // Matches are anonymised, not erased: an opponent's rating history has
      // to stay explicable after this account is gone (PRD §7.4).
      await q.query("UPDATE players SET display_name = 'Deleted player' WHERE id = $1", [me.sub]);
      await q.query("DELETE FROM users WHERE id = $1", [me.sub]);
    });
    sendJson(res, 200, { ok: true }, { "set-cookie": refreshCookie(null) });
  }

  async function getDoc(res: ServerResponse, me: AccessClaims, kind: string) {
    if (!DOC_KINDS.has(kind)) throw new HttpError(404, "No such document.");
    const [r] = await db.query("SELECT doc, updated_at FROM user_documents WHERE user_id = $1 AND kind = $2", [me.sub, kind]);
    sendJson(res, 200, r ? { doc: r.doc, updatedAt: Number(r.updated_at) } : { doc: null, updatedAt: null });
  }

  async function putDoc(req: IncomingMessage, res: ServerResponse, me: AccessClaims, kind: string) {
    if (!DOC_KINDS.has(kind)) throw new HttpError(404, "No such document.");
    const body = await readJson(req);
    const doc = body.doc;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new HttpError(400, "doc must be an object.");
    const json = JSON.stringify(doc);
    if (json.length > MAX_DOC_BYTES) throw new HttpError(413, "That document is too large.");
    const now = Date.now();
    await db.query(
      `INSERT INTO user_documents (user_id, kind, doc, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, kind) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
      [me.sub, kind, json, now],
    );
    sendJson(res, 200, { updatedAt: now });
  }

  async function listCircuits(res: ServerResponse, me: AccessClaims) {
    const rows = await db.query(
      "SELECT id, name, circuit, saved_at, updated_at FROM circuits WHERE user_id = $1 ORDER BY updated_at DESC",
      [me.sub],
    );
    sendJson(res, 200, {
      items: rows.map((r) => ({
        id: r.id, name: r.name, circuit: r.circuit, savedAt: Number(r.saved_at), updatedAt: Number(r.updated_at),
      })),
    });
  }

  async function putCircuit(req: IncomingMessage, res: ServerResponse, me: AccessClaims, id: string) {
    if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, "Bad circuit id.");
    const body = await readJson(req);
    const name = str(body.name, "Name", 80);
    const circuit = body.circuit as Circuit;
    // SEC6: validated before it is stored, exactly as before it is run.
    if (!circuit || typeof circuit !== "object" || !validate(circuit).valid) {
      throw new HttpError(400, "That circuit isn't valid.");
    }
    const now = Date.now();
    const savedAt = Number.isFinite(body.savedAt) ? Number(body.savedAt) : now;
    const updatedAt = Number.isFinite(body.updatedAt) ? Number(body.updatedAt) : now;

    await db.tx(async (q) => {
      const [{ n }] = await q.query("SELECT COUNT(*)::int AS n FROM circuits WHERE user_id = $1 AND id <> $2", [me.sub, id]);
      if (Number(n) >= MAX_CIRCUITS) throw new HttpError(409, `You can keep ${MAX_CIRCUITS} saved circuits.`);
      await q.query(
        `INSERT INTO circuits (user_id, id, name, circuit, saved_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, circuit = EXCLUDED.circuit, updated_at = EXCLUDED.updated_at`,
        [me.sub, id, name, JSON.stringify(circuit), savedAt, updatedAt],
      );
    });
    sendJson(res, 200, { ok: true });
  }

  async function deleteCircuit(res: ServerResponse, me: AccessClaims, id: string) {
    await db.query("DELETE FROM circuits WHERE user_id = $1 AND id = $2", [me.sub, id]);
    sendJson(res, 200, { ok: true });
  }

  /* -- Cohorts ------------------------------------------------------------------ */

  function joinCode(): string {
    // No 0/O or 1/I: codes are read aloud in a lecture hall.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
  }

  async function createCohort(req: IncomingMessage, res: ServerResponse, me: AccessClaims) {
    if (me.role !== "instructor" && me.role !== "admin") throw new HttpError(403, "Only instructors create cohorts.");
    const body = await readJson(req);
    const name = str(body.name, "Cohort name", 80);
    const id = randomUUID();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = joinCode();
      const rows = await db.query(
        `INSERT INTO cohorts (id, name, join_code, instructor_id, created_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (join_code) DO NOTHING RETURNING *`,
        [id, name, code, me.sub, Date.now()],
      );
      if (rows[0]) {
        sendJson(res, 201, { cohort: { id, name, joinCode: code, members: 0, role: "instructor" } });
        return;
      }
    }
    throw new HttpError(503, "Couldn't make a join code. Try again.");
  }

  async function listCohorts(res: ServerResponse, me: AccessClaims) {
    const rows = await db.query(
      `SELECT c.id, c.name, c.join_code, c.instructor_id,
              (SELECT COUNT(*)::int FROM cohort_members m WHERE m.cohort_id = c.id) AS members
         FROM cohorts c
        WHERE c.instructor_id = $1
           OR $2
           OR EXISTS (SELECT 1 FROM cohort_members m WHERE m.cohort_id = c.id AND m.user_id = $1)
        ORDER BY c.created_at DESC`,
      [me.sub, me.role === "admin"],
    );
    sendJson(res, 200, {
      cohorts: rows.map((r) => {
        const teaches = r.instructor_id === me.sub || me.role === "admin";
        return {
          id: r.id,
          name: r.name,
          members: Number(r.members),
          role: teaches ? "instructor" : "member",
          // Only the people running a cohort see the code that joins it.
          joinCode: teaches ? r.join_code : undefined,
        };
      }),
    });
  }

  async function joinCohort(req: IncomingMessage, res: ServerResponse, me: AccessClaims) {
    const body = await readJson(req);
    const code = str(body.code, "Join code", 16).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const [c] = await db.query("SELECT id, name FROM cohorts WHERE join_code = $1", [code]);
    if (!c) throw new HttpError(404, "No cohort has that code.");
    await db.query(
      "INSERT INTO cohort_members (cohort_id, user_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [c.id, me.sub, Date.now()],
    );
    sendJson(res, 200, { cohort: { id: c.id, name: c.name } });
  }

  async function cohortReport(res: ServerResponse, me: AccessClaims, id: string) {
    const [c] = await db.query("SELECT * FROM cohorts WHERE id = $1", [id]);
    if (!c) throw new HttpError(404, "No such cohort.");
    // PRD §6.4: instructors see their own cohorts only; admins see all.
    if (c.instructor_id !== me.sub && me.role !== "admin") throw new HttpError(403, "That isn't your cohort.");

    const rows = await db.query(
      `SELECT u.id, u.display_name, d.doc, d.updated_at
         FROM cohort_members m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN user_documents d ON d.user_id = u.id AND d.kind = 'session'
        WHERE m.cohort_id = $1
        ORDER BY u.display_name`,
      [id],
    );
    sendJson(res, 200, {
      cohort: { id: c.id, name: c.name, joinCode: c.join_code },
      students: rows.map((r) => {
        const doc = (r.doc ?? {}) as { progress?: unknown; misconceptions?: unknown };
        // Only what the console reads. Nothing else in a learner's document
        // leaves the server on an instructor's behalf.
        return {
          id: r.id,
          name: r.display_name,
          progress: doc.progress ?? {},
          misconceptions: Array.isArray(doc.misconceptions) ? doc.misconceptions : [],
          updatedAt: r.updated_at === null ? null : Number(r.updated_at),
        };
      }),
    });
  }

  /* -- Attempts and assignments (PRD E10-S4, E10-S5) --------------------------- */

  /** The cohort, if the caller runs it (or is an admin). A 403 otherwise. */
  async function taughtCohort(me: AccessClaims, id: string) {
    const [c] = await db.query("SELECT * FROM cohorts WHERE id = $1", [id]);
    if (!c) throw new HttpError(404, "No such cohort.");
    if (c.instructor_id !== me.sub && me.role !== "admin") throw new HttpError(403, "That isn't your cohort.");
    return c;
  }

  async function logAttempt(req: IncomingMessage, res: ServerResponse, me: AccessClaims) {
    const body = await readJson(req);
    const place = typeof body.place === "string" ? body.place : "";
    if (!PLACE.test(place)) throw new HttpError(400, "Bad place.");
    const circuit = body.ir as Circuit;
    if (!circuit || typeof circuit !== "object" || !validate(circuit).valid) throw new HttpError(400, "That circuit isn't valid.");
    const fidelity = Number(body.fidelity);
    if (!Number.isFinite(fidelity) || fidelity < 0 || fidelity > 1.0001) throw new HttpError(400, "Bad fidelity.");
    const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

    await db.tx(async (q) => {
      await q.query(
        `INSERT INTO attempts (id, user_id, place, ir, fidelity, rule_id, misconception_id, message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [randomUUID(), me.sub, place, JSON.stringify(circuit), fidelity, text(body.ruleId, 64), text(body.misconceptionId, 8), text(body.message, 600), Date.now()],
      );
      // Keep the most recent only: this is a window for an instructor, not an archive.
      await q.query(
        `DELETE FROM attempts WHERE user_id = $1 AND id NOT IN (
           SELECT id FROM attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2)`,
        [me.sub, MAX_ATTEMPTS],
      );
    });
    sendJson(res, 201, { ok: true });
  }

  async function studentAttempts(res: ServerResponse, me: AccessClaims, cohortId: string, userId: string) {
    await taughtCohort(me, cohortId);
    const [member] = await db.query("SELECT 1 FROM cohort_members WHERE cohort_id = $1 AND user_id = $2", [cohortId, userId]);
    // Not in this class: the same answer as a missing class, so nothing leaks.
    if (!member) throw new HttpError(404, "No such student in this cohort.");
    const rows = await db.query(
      `SELECT id, place, ir, fidelity, rule_id, misconception_id, message, created_at
         FROM attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId],
    );
    sendJson(res, 200, {
      attempts: rows.map((r) => ({
        id: r.id, place: r.place, ir: r.ir, fidelity: Number(r.fidelity),
        ruleId: r.rule_id, misconceptionId: r.misconception_id, message: r.message, at: Number(r.created_at),
      })),
    });
  }

  async function createAssignment(req: IncomingMessage, res: ServerResponse, me: AccessClaims, cohortId: string) {
    await taughtCohort(me, cohortId);
    const body = await readJson(req);
    const kind = body.kind === "challenge" ? "challenge" : body.kind === "node" ? "node" : null;
    const itemId = typeof body.itemId === "string" ? body.itemId : "";
    if (!kind || !itemTitle(kind, itemId)) throw new HttpError(400, "Pick a lesson or challenge from the curriculum.");
    const dueAt = Number(body.dueAt);
    if (!Number.isFinite(dueAt) || dueAt < Date.now() - 86_400_000) throw new HttpError(400, "Pick a due date that hasn't passed.");
    const id = randomUUID();
    await db.query(
      "INSERT INTO assignments (id, cohort_id, kind, item_id, due_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, cohortId, kind, itemId, dueAt, Date.now()],
    );
    sendJson(res, 201, { assignment: { id, kind, itemId, title: itemTitle(kind, itemId), dueAt } });
  }

  async function cohortAssignments(res: ServerResponse, me: AccessClaims, cohortId: string) {
    await taughtCohort(me, cohortId);
    const [assignments, members] = await Promise.all([
      db.query("SELECT * FROM assignments WHERE cohort_id = $1 ORDER BY due_at ASC", [cohortId]),
      db.query(
        `SELECT d.doc FROM cohort_members m
           LEFT JOIN user_documents d ON d.user_id = m.user_id AND d.kind = 'session'
          WHERE m.cohort_id = $1`,
        [cohortId],
      ),
    ]);
    sendJson(res, 200, {
      assignments: assignments.map((a) => ({
        id: a.id,
        kind: a.kind,
        itemId: a.item_id,
        title: itemTitle(String(a.kind), String(a.item_id)),
        dueAt: Number(a.due_at),
        // Rolled up from progress the students already sync (E10-S4).
        done: members.filter((m) => isDone(m.doc, String(a.kind), String(a.item_id))).length,
        total: members.length,
      })),
    });
  }

  async function deleteAssignment(res: ServerResponse, me: AccessClaims, cohortId: string, id: string) {
    await taughtCohort(me, cohortId);
    await db.query("DELETE FROM assignments WHERE id = $1 AND cohort_id = $2", [id, cohortId]);
    sendJson(res, 200, { ok: true });
  }

  async function myAssignments(res: ServerResponse, me: AccessClaims) {
    const rows = await db.query(
      `SELECT a.*, c.name AS cohort_name FROM assignments a
         JOIN cohorts c ON c.id = a.cohort_id
         JOIN cohort_members m ON m.cohort_id = a.cohort_id AND m.user_id = $1
        ORDER BY a.due_at ASC`,
      [me.sub],
    );
    sendJson(res, 200, {
      assignments: rows.map((a) => ({
        id: a.id, kind: a.kind, itemId: a.item_id, title: itemTitle(String(a.kind), String(a.item_id)),
        dueAt: Number(a.due_at), cohort: a.cohort_name,
      })),
    });
  }

  /* -- Published challenges (E8-S6) --------------------------------------------- */

  async function publishChallenge(req: IncomingMessage, res: ServerResponse, me: AccessClaims, cohortId: string) {
    await taughtCohort(me, cohortId);
    const body = await readJson(req);
    const challenge = authoredChallenge(body.challenge);
    const id = `class.${randomUUID().slice(0, 8)}`;
    await db.tx(async (q) => {
      const [{ n }] = await q.query("SELECT COUNT(*)::int AS n FROM class_challenges WHERE cohort_id = $1", [cohortId]);
      if (Number(n) >= MAX_CLASS_CHALLENGES) throw new HttpError(409, `A class can hold ${MAX_CLASS_CHALLENGES} published challenges.`);
      await q.query(
        "INSERT INTO class_challenges (id, cohort_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5)",
        [id, cohortId, me.sub, JSON.stringify(challenge), Date.now()],
      );
    });
    sendJson(res, 201, { challenge: { id, ...challenge } });
  }

  async function cohortChallenges(res: ServerResponse, me: AccessClaims, cohortId: string) {
    await taughtCohort(me, cohortId);
    const rows = await db.query("SELECT id, body, created_at FROM class_challenges WHERE cohort_id = $1 ORDER BY created_at DESC", [cohortId]);
    sendJson(res, 200, {
      challenges: rows.map((r) => ({ id: r.id, ...(r.body as object), createdAt: Number(r.created_at) })),
    });
  }

  async function unpublishChallenge(res: ServerResponse, me: AccessClaims, cohortId: string, id: string) {
    await taughtCohort(me, cohortId);
    await db.query("DELETE FROM class_challenges WHERE id = $1 AND cohort_id = $2", [id, cohortId]);
    sendJson(res, 200, { ok: true });
  }

  async function myChallenges(res: ServerResponse, me: AccessClaims) {
    const rows = await db.query(
      `SELECT k.id, k.body, k.created_at, c.name AS cohort_name FROM class_challenges k
         JOIN cohorts c ON c.id = k.cohort_id
        WHERE c.instructor_id = $1
           OR EXISTS (SELECT 1 FROM cohort_members m WHERE m.cohort_id = k.cohort_id AND m.user_id = $1)
        ORDER BY k.created_at DESC`,
      [me.sub],
    );
    sendJson(res, 200, {
      challenges: rows.map((r) => ({
        id: r.id, ...(r.body as object), cohort: r.cohort_name, createdAt: Number(r.created_at),
      })),
    });
  }

  /* -- Signed completion records (E8-S5) ----------------------------------------- */

  async function signRecord(req: IncomingMessage, res: ServerResponse, me: AccessClaims) {
    const body = await readJson(req);
    const track = typeof body.track === "string" ? TRACKS_BY_ID.get(body.track) : undefined;
    if (!track) throw new HttpError(400, "No such track.");
    const user = await loadUser(me.sub);
    if (!user) throw new HttpError(401, "Sign in to do that.");
    const [row] = await db.query("SELECT doc FROM user_documents WHERE user_id = $1 AND kind = 'session'", [me.sub]);
    const doc = (row?.doc ?? {}) as { progress?: Record<string, never>; challenges?: Record<string, never> };
    const progress = doc.progress ?? {};
    // The server's copy of the progress decides, not the request.
    const tp = trackProgress(track, progress, doc.challenges ?? {});
    if (!tp.complete) {
      const left = tp.nodesTotal - tp.nodesPassed + tp.capstonesTotal - tp.capstonesSolved;
      throw new HttpError(409, `Your synced progress doesn't complete this track yet — ${left} left. If you finished it on another device, give it a moment to sync.`);
    }
    const code = encodeRecord(buildRecord(track, user.displayName, progress));
    sendJson(res, 200, { code: `${code}.${signBody(keys, splitRecordCode(code).body)}` });
  }

  function verifyRecord(res: ServerResponse, code: string) {
    const reading = readRecord(code);
    if (reading.status === "unreadable" || !reading.signature) {
      sendJson(res, 200, { signed: false, valid: false });
      return;
    }
    const valid = reading.status === "intact" && verifyBody(keys, splitRecordCode(code).body, reading.signature);
    sendJson(res, 200, { signed: true, valid });
  }

  /* -- The daily puzzle ---------------------------------------------------------- */

  async function dailyStart(res: ServerResponse, me: AccessClaims) {
    const day = dayKey();
    await db.query(
      "INSERT INTO daily_results (day, user_id, started_at) VALUES ($1, $2, $3) ON CONFLICT (day, user_id) DO NOTHING",
      [day, me.sub, Date.now()],
    );
    const [r] = await db.query("SELECT * FROM daily_results WHERE day = $1 AND user_id = $2", [day, me.sub]);
    sendJson(res, 200, {
      day, challengeId: dailyChallenge(day).id, startedAt: Number(r.started_at),
      solved: r.solved_at !== null, gates: r.gates === null ? null : Number(r.gates), ms: r.ms === null ? null : Number(r.ms),
    });
  }

  async function dailySubmit(req: IncomingMessage, res: ServerResponse, me: AccessClaims) {
    const body = await readJson(req);
    const day = dayKey();
    const challenge = dailyChallenge(day);
    const circuit = body.ir as Circuit;
    if (!circuit || typeof circuit !== "object" || !validate(circuit).valid) throw new HttpError(400, "That circuit isn't valid.");
    if (circuit.qubits !== challenge.qubits) throw new HttpError(400, `Today's puzzle is ${challenge.qubits} qubits.`);
    const [row] = await db.query("SELECT * FROM daily_results WHERE day = $1 AND user_id = $2", [day, me.sub]);
    if (!row) throw new HttpError(409, "Open today's puzzle first — that starts your clock.");

    const g = grade(simulate(circuit), challenge.target);
    const now = Date.now();
    await db.query("UPDATE daily_results SET tries = tries + 1 WHERE day = $1 AND user_id = $2", [day, me.sub]);
    if (g.passed && row.solved_at === null) {
      await db.query(
        "UPDATE daily_results SET solved_at = $1, gates = $2, ms = $3 WHERE day = $4 AND user_id = $5 AND solved_at IS NULL",
        [now, gateCount(circuit), now - Number(row.started_at), day, me.sub],
      );
    }
    const board = await dailyBoard(day, me.sub);
    sendJson(res, 200, { passed: g.passed, fidelity: g.fidelity, you: board.you, solvers: board.solvers });
  }

  async function dailyBoard(day: string, userId: string | null) {
    const rows = await db.query(
      `SELECT r.user_id, r.gates, r.ms, u.display_name FROM daily_results r
         JOIN users u ON u.id = r.user_id
        WHERE r.day = $1 AND r.solved_at IS NOT NULL
        ORDER BY r.gates ASC, r.ms ASC`,
      [day],
    );
    const ranked = rows.map((r, i) => ({ rank: i + 1, name: String(r.display_name), gates: Number(r.gates), ms: Number(r.ms), me: r.user_id === userId }));
    return {
      day,
      challengeId: dailyChallenge(day).id,
      solvers: ranked.length,
      top: ranked.slice(0, 10).map(({ me: _me, ...rest }) => ({ ...rest, you: _me })),
      you: ranked.find((r) => r.me) ?? null,
    };
  }

  /* -- Routing ---------------------------------------------------------------- */

  /** Handles the request if it is an API route. Returns false otherwise. */
  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const { pathname } = url;
    const method = req.method ?? "GET";
    const seg = pathname.split("/").filter(Boolean);
    if (!["auth", "me", "cohorts", "records", "daily"].includes(seg[0] ?? "")) return false;

    try {
      // Public: whoever a record was sent to has no account here.
      if (seg[0] === "records" && method === "GET") {
        if (seg[1] === "verify") verifyRecord(res, (url.searchParams.get("code") ?? "").slice(0, 4000));
        else if (seg[1] === "key") sendJson(res, 200, { alg: "Ed25519", key: keys.publicRaw });
        else throw new HttpError(404, "Not found.");
        return true;
      }
      // Public too, but it says where you stand if you are signed in.
      if (seg[0] === "daily" && seg[1] === "leaderboard" && method === "GET") {
        const token = bearer(req);
        const claims = token ? verifyAccess(jwtSecret, token) : null;
        sendJson(res, 200, await dailyBoard(dayKey(), claims?.sub ?? null));
        return true;
      }

      if (seg[0] === "auth") {
        if (method !== "POST") throw new HttpError(405, "Use POST.");
        if (authLimit(clientIp(req))) throw new HttpError(429, "Too many attempts. Wait a minute and try again.");
        if (seg[1] === "signup") await signup(req, res);
        else if (seg[1] === "login") await login(req, res);
        else if (seg[1] === "refresh") await refresh(req, res);
        else if (seg[1] === "logout") await logout(req, res);
        else throw new HttpError(404, "Not found.");
        return true;
      }

      const me = requireUser(req);
      if (method !== "GET" && writeLimit(me.sub)) throw new HttpError(429, "Slow down a little.");

      if (seg[0] === "me") {
        if (seg.length === 1 && method === "GET") {
          const user = await loadUser(me.sub);
          if (!user) throw new HttpError(401, "Sign in to do that.");
          sendJson(res, 200, { user });
        } else if (seg.length === 1 && method === "DELETE") await deleteMe(req, res, me);
        else if (seg[1] === "documents" && seg[2] && method === "GET") await getDoc(res, me, seg[2]);
        else if (seg[1] === "documents" && seg[2] && method === "PUT") await putDoc(req, res, me, seg[2]);
        else if (seg[1] === "circuits" && !seg[2] && method === "GET") await listCircuits(res, me);
        else if (seg[1] === "circuits" && seg[2] && method === "PUT") await putCircuit(req, res, me, seg[2]);
        else if (seg[1] === "circuits" && seg[2] && method === "DELETE") await deleteCircuit(res, me, seg[2]);
        else if (seg[1] === "attempts" && !seg[2] && method === "POST") await logAttempt(req, res, me);
        else if (seg[1] === "assignments" && !seg[2] && method === "GET") await myAssignments(res, me);
        else if (seg[1] === "challenges" && !seg[2] && method === "GET") await myChallenges(res, me);
        else throw new HttpError(404, "Not found.");
        return true;
      }

      if (seg[0] === "records") {
        if (seg[1] === "sign" && method === "POST") await signRecord(req, res, me);
        else throw new HttpError(404, "Not found.");
        return true;
      }

      if (seg[0] === "daily") {
        if (seg[1] === "start" && method === "POST") await dailyStart(res, me);
        else if (seg[1] === "submit" && method === "POST") await dailySubmit(req, res, me);
        else throw new HttpError(404, "Not found.");
        return true;
      }

      // cohorts
      if (seg.length === 1 && method === "POST") await createCohort(req, res, me);
      else if (seg.length === 1 && method === "GET") await listCohorts(res, me);
      else if (seg[1] === "join" && method === "POST") await joinCohort(req, res, me);
      else if (seg[2] === "report" && method === "GET") await cohortReport(res, me, seg[1]);
      else if (seg[2] === "students" && seg[3] && seg[4] === "attempts" && method === "GET") await studentAttempts(res, me, seg[1], seg[3]);
      else if (seg[2] === "assignments" && !seg[3] && method === "GET") await cohortAssignments(res, me, seg[1]);
      else if (seg[2] === "assignments" && !seg[3] && method === "POST") await createAssignment(req, res, me, seg[1]);
      else if (seg[2] === "assignments" && seg[3] && method === "DELETE") await deleteAssignment(res, me, seg[1], seg[3]);
      else if (seg[2] === "challenges" && !seg[3] && method === "GET") await cohortChallenges(res, me, seg[1]);
      else if (seg[2] === "challenges" && !seg[3] && method === "POST") await publishChallenge(req, res, me, seg[1]);
      else if (seg[2] === "challenges" && seg[3] && method === "DELETE") await unpublishChallenge(res, me, seg[1], seg[3]);
      else throw new HttpError(404, "Not found.");
      return true;
    } catch (e) {
      if (e instanceof HttpError) sendJson(res, e.status, { error: e.message });
      else {
        console.error("[api]", e instanceof Error ? e.message : e);
        sendJson(res, 500, { error: "Something went wrong on the server. Your work in this browser is safe." });
      }
      return true;
    }
  };
}

export { verifyAccess };
