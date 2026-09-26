/**
 * Accounts, sync and cohorts, over real HTTP against a real (in-process)
 * Postgres.
 *
 * What these pin is mostly what must NOT happen: a password that works for
 * the wrong account, a stolen refresh token that keeps working, an instructor
 * reading someone else's class, a deleted account whose name lives on in the
 * ladder.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startArenaServer, type ArenaServer } from "../src/server.ts";
import { freshDb } from "./db.ts";
import { emptyCircuit } from "../../web/lib/ir/types";

let server: ArenaServer;
const url = (p: string) => `http://127.0.0.1:${server.port}${p}`;

beforeAll(async () => {
  server = await startArenaServer({
    db: await freshDb(),
    jwtSecret: "test-secret",
    instructorCode: "TEACH-2026",
    adminEmails: ["admin@example.com"],
    secureCookies: false,
    authPerMinute: 1000,
  });
});

afterAll(async () => {
  await server.close();
});

beforeEach(async () => {
  await freshDb();
});

interface Session {
  status: number;
  body: any;
  token: string;
  cookie: string | null;
}

async function call(method: string, path: string, opts: { body?: unknown; token?: string; cookie?: string | null } = {}): Promise<Session> {
  const res = await fetch(url(path), {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const body = (await res.json().catch(() => null)) as any;
  const set = res.headers.get("set-cookie");
  return {
    status: res.status,
    body,
    token: body?.accessToken ?? "",
    cookie: set ? set.split(";")[0] : null,
  };
}

const signup = (email: string, extra: Record<string, unknown> = {}) =>
  call("POST", "/auth/signup", { body: { email, password: "correct horse", displayName: email.split("@")[0], ...extra } });

describe("signing up and in", () => {
  it("creates a student account and starts a session", async () => {
    const s = await signup("ada@example.com");
    expect(s.status).toBe(201);
    expect(s.body.user).toMatchObject({ email: "ada@example.com", role: "student" });
    expect(s.token.split(".")).toHaveLength(3);
    expect(s.cookie).toMatch(/^qr_refresh=/);
  });

  it("sets the refresh cookie httpOnly and SameSite=Strict", async () => {
    const res = await fetch(url("/auth/signup"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bo@example.com", password: "correct horse", displayName: "Bo" }),
    });
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
  });

  it("stores email case-insensitively and refuses a second account", async () => {
    await signup("Ada@Example.com");
    const again = await signup("ada@example.com");
    expect(again.status).toBe(409);
  });

  it("refuses a short password and a bad email", async () => {
    expect((await call("POST", "/auth/signup", { body: { email: "a@example.com", password: "short", displayName: "A" } })).status).toBe(400);
    expect((await call("POST", "/auth/signup", { body: { email: "not-an-email", password: "long enough", displayName: "A" } })).status).toBe(400);
  });

  it("grants instructor with the code, and admin by email", async () => {
    expect((await signup("t@example.com", { instructorCode: "TEACH-2026" })).body.user.role).toBe("instructor");
    expect((await signup("x@example.com", { instructorCode: "wrong" })).status).toBe(400);
    expect((await signup("admin@example.com")).body.user.role).toBe("admin");
  });

  it("logs in with the right password, and says the same thing for a wrong one or no account", async () => {
    await signup("ada@example.com");
    const ok = await call("POST", "/auth/login", { body: { email: "ada@example.com", password: "correct horse" } });
    expect(ok.status).toBe(200);
    const wrong = await call("POST", "/auth/login", { body: { email: "ada@example.com", password: "wrong horse" } });
    const nobody = await call("POST", "/auth/login", { body: { email: "nobody@example.com", password: "correct horse" } });
    expect(wrong.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(wrong.body.error).toBe(nobody.body.error);
  });

  it("keeps the password out of every response", async () => {
    const s = await signup("ada@example.com");
    const me = await call("GET", "/me", { token: s.token });
    expect(JSON.stringify([s.body, me.body])).not.toMatch(/password|argon2/i);
  });
});

describe("tokens", () => {
  it("needs a token for /me, and rejects a tampered one", async () => {
    const s = await signup("ada@example.com");
    expect((await call("GET", "/me")).status).toBe(401);
    expect((await call("GET", "/me", { token: s.token })).body.user.email).toBe("ada@example.com");
    const tampered = s.token.slice(0, -2) + (s.token.endsWith("A") ? "BB" : "AA");
    expect((await call("GET", "/me", { token: tampered })).status).toBe(401);
  });

  it("rotates the refresh token on every use", async () => {
    const s = await signup("ada@example.com");
    const r1 = await call("POST", "/auth/refresh", { cookie: s.cookie });
    expect(r1.status).toBe(200);
    expect(r1.cookie).not.toBe(s.cookie);
    const r2 = await call("POST", "/auth/refresh", { cookie: r1.cookie });
    expect(r2.status).toBe(200);
  });

  it("revokes the whole family when a spent token comes back", async () => {
    const s = await signup("ada@example.com");
    const legit = await call("POST", "/auth/refresh", { cookie: s.cookie });
    // Someone replays the original token: that is a copy.
    const replay = await call("POST", "/auth/refresh", { cookie: s.cookie });
    expect(replay.status).toBe(401);
    // And the legitimate successor dies with it.
    expect((await call("POST", "/auth/refresh", { cookie: legit.cookie })).status).toBe(401);
  });

  it("signs out: the refresh token stops working", async () => {
    const s = await signup("ada@example.com");
    await call("POST", "/auth/logout", { cookie: s.cookie });
    expect((await call("POST", "/auth/refresh", { cookie: s.cookie })).status).toBe(401);
  });
});

describe("synced progress and circuits", () => {
  it("stores and returns the session document", async () => {
    const s = await signup("ada@example.com");
    expect((await call("GET", "/me/documents/session", { token: s.token })).body.doc).toBeNull();
    const doc = { mode: "guided", progress: { "u0.n1": { state: "passed" } }, xp: 30 };
    expect((await call("PUT", "/me/documents/session", { token: s.token, body: { doc } })).status).toBe(200);
    expect((await call("GET", "/me/documents/session", { token: s.token })).body.doc).toEqual(doc);
  });

  it("refuses unknown document kinds and non-object documents", async () => {
    const s = await signup("ada@example.com");
    expect((await call("PUT", "/me/documents/secrets", { token: s.token, body: { doc: {} } })).status).toBe(404);
    expect((await call("PUT", "/me/documents/session", { token: s.token, body: { doc: [1, 2] } })).status).toBe(400);
  });

  it("saves, lists and deletes circuits, and validates them first", async () => {
    const s = await signup("ada@example.com");
    const c = emptyCircuit(2, "Bell");
    c.gates = [{ id: "g1", type: "h", targets: [0], controls: [], params: [], column: 0 }];
    expect((await call("PUT", "/me/circuits/c1", { token: s.token, body: { name: "Bell", circuit: c } })).status).toBe(200);

    const bad = { ...c, gates: [{ ...c.gates[0], targets: [7] }] };
    expect((await call("PUT", "/me/circuits/c2", { token: s.token, body: { name: "Bad", circuit: bad } })).status).toBe(400);

    const list = await call("GET", "/me/circuits", { token: s.token });
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual(["c1"]);

    await call("DELETE", "/me/circuits/c1", { token: s.token });
    expect((await call("GET", "/me/circuits", { token: s.token })).body.items).toEqual([]);
  });

  it("keeps each account's circuits to itself", async () => {
    const a = await signup("ada@example.com");
    const b = await signup("bo@example.com");
    await call("PUT", "/me/circuits/c1", { token: a.token, body: { name: "Mine", circuit: emptyCircuit(1) } });
    expect((await call("GET", "/me/circuits", { token: b.token })).body.items).toEqual([]);
  });
});

describe("cohorts", () => {
  async function classroom() {
    const teacher = await signup("t@example.com", { instructorCode: "TEACH-2026" });
    const student = await signup("s@example.com");
    const created = await call("POST", "/cohorts", { token: teacher.token, body: { name: "CS-402" } });
    return { teacher, student, cohort: created.body.cohort };
  }

  it("lets instructors create a cohort with a join code, and nobody else", async () => {
    const { student, cohort } = await classroom();
    expect(cohort.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect((await call("POST", "/cohorts", { token: student.token, body: { name: "Mine" } })).status).toBe(403);
  });

  it("joins by code and shows the student's real progress to the instructor", async () => {
    const { teacher, student, cohort } = await classroom();
    await call("PUT", "/me/documents/session", {
      token: student.token,
      body: { doc: { progress: { "u0.n1": { state: "passed" } }, misconceptions: [{ misconceptionId: "M8", ruleId: "L03", nodeId: "u3.n3", at: 1 }], xp: 30 } },
    });
    const joined = await call("POST", "/cohorts/join", { token: student.token, body: { code: cohort.joinCode.toLowerCase() } });
    expect(joined.status).toBe(200);

    const report = await call("GET", `/cohorts/${cohort.id}/report`, { token: teacher.token });
    expect(report.status).toBe(200);
    expect(report.body.students).toHaveLength(1);
    expect(report.body.students[0].progress["u0.n1"].state).toBe("passed");
    expect(report.body.students[0].misconceptions[0].misconceptionId).toBe("M8");
    // Only what the console needs leaves the server.
    expect(report.body.students[0].xp).toBeUndefined();
  });

  it("refuses the report to students and to other instructors — on the server", async () => {
    const { student, cohort } = await classroom();
    const other = await signup("t2@example.com", { instructorCode: "TEACH-2026" });
    expect((await call("GET", `/cohorts/${cohort.id}/report`, { token: student.token })).status).toBe(403);
    expect((await call("GET", `/cohorts/${cohort.id}/report`, { token: other.token })).status).toBe(403);
    const admin = await signup("admin@example.com");
    expect((await call("GET", `/cohorts/${cohort.id}/report`, { token: admin.token })).status).toBe(200);
  });

  it("hides the join code from members", async () => {
    const { student, cohort } = await classroom();
    await call("POST", "/cohorts/join", { token: student.token, body: { code: cohort.joinCode } });
    const mine = await call("GET", "/cohorts", { token: student.token });
    expect(mine.body.cohorts[0]).toMatchObject({ name: "CS-402", role: "member" });
    expect(mine.body.cohorts[0].joinCode).toBeUndefined();
  });

  it("says so for a code that doesn't exist", async () => {
    const s = await signup("s@example.com");
    expect((await call("POST", "/cohorts/join", { token: s.token, body: { code: "NOPE99" } })).status).toBe(404);
  });
});

describe("deleting an account", () => {
  it("needs the password", async () => {
    const s = await signup("ada@example.com");
    expect((await call("DELETE", "/me", { token: s.token, body: { password: "wrong horse" } })).status).toBe(403);
  });

  it("removes the account and its data, and anonymises its matches", async () => {
    const s = await signup("ada@example.com");
    await server.repo.touchPlayer(s.body.user.id, "ada");
    await call("PUT", "/me/documents/session", { token: s.token, body: { doc: { xp: 1 } } });

    expect((await call("DELETE", "/me", { token: s.token, body: { password: "correct horse" } })).status).toBe(200);
    expect((await call("POST", "/auth/login", { body: { email: "ada@example.com", password: "correct horse" } })).status).toBe(401);
    expect((await server.repo.getPlayer(s.body.user.id))!.displayName).toBe("Deleted player");
    const docs = await server.db.query("SELECT * FROM user_documents WHERE user_id = $1", [s.body.user.id]);
    expect(docs).toHaveLength(0);
  });
});

describe("rate limits", () => {
  it("cuts off /auth after the limit, per address", async () => {
    const limited = await startArenaServer({ db: server.db, jwtSecret: "x", secureCookies: false, authPerMinute: 3 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`http://127.0.0.1:${limited.port}/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "a@example.com", password: "whatever1" }),
        });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
      expect(statuses.slice(3)).toEqual([429, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe("a student's failed attempts (PRD E10-S5)", () => {
  async function setup() {
    const teacher = await signup("t@example.com", { instructorCode: "TEACH-2026" });
    const student = await signup("s@example.com");
    const cohort = (await call("POST", "/cohorts", { token: teacher.token, body: { name: "CS-402" } })).body.cohort;
    await call("POST", "/cohorts/join", { token: student.token, body: { code: cohort.joinCode } });
    return { teacher, student, cohort };
  }
  const attempt = (overrides: Record<string, unknown> = {}) => ({
    place: "lesson:u3.n3", ir: emptyCircuit(2), fidelity: 0.5,
    ruleId: "L01_no_entangler", misconceptionId: "M8", message: "q0 and q1 are still separable.", ...overrides,
  });

  it("lets the instructor open a member's attempt, with the diagnosis they were shown", async () => {
    const { teacher, student, cohort } = await setup();
    expect((await call("POST", "/me/attempts", { token: student.token, body: attempt() })).status).toBe(201);
    const r = await call("GET", `/cohorts/${cohort.id}/students/${student.body.user.id}/attempts`, { token: teacher.token });
    expect(r.status).toBe(200);
    expect(r.body.attempts[0]).toMatchObject({ place: "lesson:u3.n3", fidelity: 0.5, ruleId: "L01_no_entangler", message: "q0 and q1 are still separable." });
    expect(r.body.attempts[0].ir.qubits).toBe(2);
  });

  it("refuses other instructors, students, and people outside the class", async () => {
    const { student, cohort } = await setup();
    const other = await signup("t2@example.com", { instructorCode: "TEACH-2026" });
    const outsider = await signup("o@example.com");
    await call("POST", "/me/attempts", { token: outsider.token, body: attempt() });
    const sid = student.body.user.id;
    expect((await call("GET", `/cohorts/${cohort.id}/students/${sid}/attempts`, { token: other.token })).status).toBe(403);
    expect((await call("GET", `/cohorts/${cohort.id}/students/${sid}/attempts`, { token: student.token })).status).toBe(403);
    const teacher = await call("POST", "/auth/login", { body: { email: "t@example.com", password: "correct horse" } });
    expect((await call("GET", `/cohorts/${cohort.id}/students/${outsider.body.user.id}/attempts`, { token: teacher.token })).status).toBe(404);
  });

  it("validates what it stores and keeps only the recent ones", async () => {
    const { student } = await setup();
    expect((await call("POST", "/me/attempts", { token: student.token, body: attempt({ place: "../etc" }) })).status).toBe(400);
    expect((await call("POST", "/me/attempts", { token: student.token, body: attempt({ fidelity: 7 }) })).status).toBe(400);
    for (let i = 0; i < 105; i++) await server.db.query(
      "INSERT INTO attempts (id, user_id, place, ir, fidelity, created_at) VALUES ($1, $2, 'lesson:u0.n1', '{}', 0, $3)",
      [`old${i}`, student.body.user.id, i],
    );
    await call("POST", "/me/attempts", { token: student.token, body: attempt() });
    const [{ n }] = await server.db.query("SELECT COUNT(*)::int AS n FROM attempts WHERE user_id = $1", [student.body.user.id]);
    expect(n).toBe(100);
  });
});

describe("assignments (PRD E10-S4)", () => {
  it("sets work for a class, rolls up completion from synced progress, and shows it to students", async () => {
    const teacher = await signup("t@example.com", { instructorCode: "TEACH-2026" });
    const a = await signup("a@example.com");
    const b = await signup("b@example.com");
    const cohort = (await call("POST", "/cohorts", { token: teacher.token, body: { name: "CS-402" } })).body.cohort;
    for (const s of [a, b]) await call("POST", "/cohorts/join", { token: s.token, body: { code: cohort.joinCode } });

    const due = Date.now() + 7 * 86_400_000;
    const made = await call("POST", `/cohorts/${cohort.id}/assignments`, { token: teacher.token, body: { kind: "node", itemId: "u3.n3", dueAt: due } });
    expect(made.status).toBe(201);
    expect(made.body.assignment.title).toBeTruthy();
    await call("POST", `/cohorts/${cohort.id}/assignments`, { token: teacher.token, body: { kind: "challenge", itemId: "c.even", dueAt: due } });

    await call("PUT", "/me/documents/session", { token: a.token, body: { doc: { progress: { "u3.n3": { state: "passed" } }, challenges: { "c.even": { solved: true } } } } });
    await call("PUT", "/me/documents/session", { token: b.token, body: { doc: { progress: { "u3.n3": { state: "attempted" } } } } });

    const list = (await call("GET", `/cohorts/${cohort.id}/assignments`, { token: teacher.token })).body.assignments;
    expect(list.map((x: { itemId: string; done: number; total: number }) => [x.itemId, x.done, x.total])).toEqual([
      ["u3.n3", 1, 2],
      ["c.even", 1, 2],
    ]);

    const mine = (await call("GET", "/me/assignments", { token: b.token })).body.assignments;
    expect(mine.map((x: { itemId: string; cohort: string }) => [x.itemId, x.cohort])).toEqual([["u3.n3", "CS-402"], ["c.even", "CS-402"]]);
  });

  it("refuses items that aren't in the curriculum, past dates, and non-instructors", async () => {
    const teacher = await signup("t@example.com", { instructorCode: "TEACH-2026" });
    const student = await signup("s@example.com");
    const cohort = (await call("POST", "/cohorts", { token: teacher.token, body: { name: "X" } })).body.cohort;
    const due = Date.now() + 86_400_000;
    expect((await call("POST", `/cohorts/${cohort.id}/assignments`, { token: teacher.token, body: { kind: "node", itemId: "u9.n9", dueAt: due } })).status).toBe(400);
    expect((await call("POST", `/cohorts/${cohort.id}/assignments`, { token: teacher.token, body: { kind: "node", itemId: "u0.n1", dueAt: 1 } })).status).toBe(400);
    expect((await call("POST", `/cohorts/${cohort.id}/assignments`, { token: student.token, body: { kind: "node", itemId: "u0.n1", dueAt: due } })).status).toBe(403);
  });

  it("can be withdrawn", async () => {
    const teacher = await signup("t@example.com", { instructorCode: "TEACH-2026" });
    const cohort = (await call("POST", "/cohorts", { token: teacher.token, body: { name: "X" } })).body.cohort;
    const made = await call("POST", `/cohorts/${cohort.id}/assignments`, { token: teacher.token, body: { kind: "node", itemId: "u0.n1", dueAt: Date.now() + 86_400_000 } });
    await call("DELETE", `/cohorts/${cohort.id}/assignments/${made.body.assignment.id}`, { token: teacher.token });
    expect((await call("GET", `/cohorts/${cohort.id}/assignments`, { token: teacher.token })).body.assignments).toEqual([]);
  });
});
