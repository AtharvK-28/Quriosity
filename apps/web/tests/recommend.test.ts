/**
 * Recommendations, tracks and completion records — PRD E7-S7, E6-S6, E8-S5.
 *
 * A recommendation is only worth making if it names its evidence, so every
 * case here asserts the reason as well as the destination.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { recommendNext } from "@/lib/curriculum/recommend";
import { TRACKS, capstoneChallenges, trackHours, trackNodes, trackProgress } from "@/lib/curriculum/tracks";
import { buildRecord, encodeRecord, readRecord, splitRecordCode } from "@/lib/curriculum/record";
import { NODES, UNITS, nodesInUnit } from "@/lib/curriculum/nodes";
import { CHALLENGES } from "@/lib/curriculum/challenges";
import { useSession } from "@/stores/sessionStore";

const NOW = Date.UTC(2026, 8, 15, 12);
const DAY = 86_400_000;

function session() {
  return useSession.getState();
}

function recommend(now = NOW) {
  const { progress, misconceptions, challenges } = session();
  return recommendNext({ progress, misconceptions, challenges, now });
}

beforeEach(() => {
  useSession.setState({ hydrated: true });
  session().reset();
});

/** The whole path, however many units it has. */
const LAST_UNIT = UNITS[UNITS.length - 1].id;

describe("what to do next — E7-S7", () => {
  it("starts a fresh learner at the first node, and says why", () => {
    const r = recommend();
    expect(r.kind).toBe("node");
    expect(r.nodeId).toBe(NODES[0].id);
    expect(r.reason).toMatch(/where the path starts/);
  });

  it("puts a mastery gate first, naming the rate and the unit it opens", () => {
    const u0 = nodesInUnit("u0");
    // Miss two of three first time: 33%, under the 80% bar.
    for (const [i, n] of u0.entries()) {
      if (i < 2) session().recordAttempt(n.id, false, 0.3, 1);
      session().recordAttempt(n.id, true, 1, 2);
    }
    const r = recommend();
    expect(r.kind).toBe("consolidate");
    expect(r.href).toMatch(/consolidate=1/);
    expect(r.reason).toMatch(/33%/);
    expect(r.reason).toMatch(/opens “One qubit”/);
  });

  it("sends a recurring belief back to the node that builds it", () => {
    session().seedThrough("u3.n3");
    // M7 fired twice this week on the Bell node, which is not passed yet.
    session().recordMisconception("M7", "L05_measure_then_coherent", "u3.n3");
    session().recordMisconception("M7", "L05_measure_then_coherent", "u3.n3");
    // Nothing is due for review in this scenario.
    useSession.setState({
      progress: Object.fromEntries(Object.entries(session().progress).map(([k, v]) => [k, { ...v, nextReviewAt: Date.now() + 30 * DAY }])),
    });

    const r = recommend(Date.now());
    expect(r.kind).toBe("revisit");
    expect(r.misconceptionId).toBe("M7");
    // The first passed node that builds M7 is "Measuring is deciding".
    expect(r.title).toBe("Measuring is deciding");
    expect(r.reason).toMatch(/2 times in the last two weeks/);
    expect(r.reason).toMatch(/most recently on “Two coins, one answer”/);
  });

  it("does not revisit a belief that was caught once", () => {
    session().seedThrough("u3.n3");
    session().recordMisconception("M7", "L05_measure_then_coherent", "u3.n3");
    useSession.setState({
      progress: Object.fromEntries(Object.entries(session().progress).map(([k, v]) => [k, { ...v, nextReviewAt: Date.now() + 30 * DAY }])),
    });
    expect(recommend(Date.now()).kind).toBe("node");
  });

  it("brings back a decayed concept before new material", () => {
    session().seedThrough("u2");
    const due = recommend(Date.now() + 60 * DAY);
    expect(due.kind).toBe("review");
    expect(due.reason).toMatch(/retention is down to \d+%/);
  });

  it("offers practice once the path is done, then says there is nothing left", () => {
    session().seedThrough(LAST_UNIT);
    const later = Date.now();
    useSession.setState({
      progress: Object.fromEntries(Object.entries(session().progress).map(([k, v]) => [k, { ...v, nextReviewAt: later + 30 * DAY }])),
    });
    const r = recommend(later);
    expect(r.kind).toBe("challenge");
    expect(r.href).toMatch(/^\/challenges\//);

    for (const c of CHALLENGES) session().recordChallenge(c.id, true, c.par);
    expect(recommend(later).kind).toBe("done");
  });
});

describe("tracks — E6-S6", () => {
  it("every track covers every unit, frames each one, and has real capstones", () => {
    for (const t of TRACKS) {
      expect(t.units.map((u) => u.unitId)).toEqual(UNITS.map((u) => u.id));
      expect(t.units.every((u) => u.framing.length > 40)).toBe(true);
      expect(capstoneChallenges(t)).toHaveLength(t.capstones.length);
      expect(trackNodes(t)).toHaveLength(NODES.length);
    }
  });

  it("estimates hours in half-hour steps", () => {
    for (const t of TRACKS) {
      const h = trackHours(t);
      expect(h * 2).toBe(Math.round(h * 2));
      expect(h).toBeGreaterThan(1);
    }
  });

  it("is complete only with every node and every capstone", () => {
    const t = TRACKS[0];
    session().seedThrough(LAST_UNIT);
    const before = trackProgress(t, session().progress, session().challenges);
    expect(before.nodesPassed).toBe(NODES.length);
    expect(before.complete).toBe(false);

    for (const id of t.capstones) session().recordChallenge(id, true, 3);
    expect(trackProgress(t, session().progress, session().challenges).complete).toBe(true);
  });
});

describe("completion records — E8-S5", () => {
  it("round-trip intact, with track, date and node list", () => {
    session().seedThrough(LAST_UNIT);
    const record = buildRecord(TRACKS[1], "  Ravi K.  ", session().progress, new Date(NOW));
    const reading = readRecord(encodeRecord(record));
    expect(reading.status).toBe("intact");
    if (reading.status !== "intact") return;
    expect(reading.record.name).toBe("Ravi K.");
    expect(reading.record.issued).toBe("2026-09-15");
    expect(reading.record.nodes).toHaveLength(NODES.length);
    expect(reading.record.firstTry).toBe(100);
    expect(reading.track.id).toBe("cryptography");
  });

  it("reads as altered when anything in it is changed", () => {
    session().seedThrough(LAST_UNIT);
    const code = encodeRecord(buildRecord(TRACKS[0], "Ravi", session().progress, new Date(NOW)));
    const [body, sum] = code.split(".");
    const forged = btoa(atob(body.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (body.length % 4)) % 4)).replace("Ravi", "Meera"))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(readRecord(`${forged}.${sum}`).status).toBe("altered");
    expect(readRecord(`${body}.0000`).status).toBe("altered");
    expect(readRecord("nonsense").status).toBe("unreadable");
  });

  it("carries a server signature as a third part, without changing what the checksum covers", () => {
    session().seedThrough(LAST_UNIT);
    const code = encodeRecord(buildRecord(TRACKS[0], "Ravi", session().progress, new Date(NOW)));
    const unsigned = readRecord(code);
    const signed = readRecord(`${code}.c2lnbmF0dXJl`);
    expect(unsigned.status === "intact" && unsigned.signature).toBe(null);
    expect(signed.status).toBe("intact");
    expect(signed.status === "intact" && signed.signature).toBe("c2lnbmF0dXJl");
    expect(splitRecordCode(`${code}.sig`).body).toBe(code.split(".")[0]);
    expect(readRecord(`${code}.sig.extra`).status).toBe("unreadable");
  });
});
