"use client";

/**
 * The arena — PRD E9.
 *
 * Four states, one screen: idle, queued, matched, finished. The match screen is
 * the bench's build loop with two additions — a clock, and a bar showing what
 * the opponent has done. It is deliberately the same canvas and the same tray:
 * a race on unfamiliar controls measures the controls.
 *
 * WHAT IS LOCAL AND WHAT IS NOT. Run is local, exactly as everywhere else in
 * this app — the simulator is on the device and pressing Run during a match
 * costs no network. Submit is the only thing that crosses to the server, and
 * the server re-simulates and re-grades before it decides anything. So the
 * client cannot win by lying, and it also cannot be slowed down by the network
 * while it is thinking.
 *
 * WHAT THE OPPONENT SEES. Gate count and run count. Never the circuit — TRD
 * §7.2 is explicit, and `match.progress` is advisory display on both ends.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/chrome/TopBar";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { GateTray } from "@/components/circuit/GateTray";
import { Histogram, probabilityMap, toFractions } from "@/components/viz/Histogram";
import { Button, Chip, Readout, Registration } from "@/components/ui/primitives";
import { emptyCircuit, gateCount, type GateType } from "@/lib/ir/types";
import { targetProbabilities, type Target } from "@/lib/grade/fidelity";
import { useCircuit } from "@/stores/circuitStore";
import { useSession } from "@/stores/sessionStore";
import { useArena } from "@/stores/arenaStore";
import { NODES } from "@/lib/curriculum/nodes";
import { CHALLENGES } from "@/lib/curriculum/challenges";
import s from "./arena.module.css";

/** E9-S7: the ladder opens once Unit 3 is behind you. */
function unitThreeDone(progress: Record<string, { state?: string }>): boolean {
  return NODES.filter((n) => n.unitId === "u3").every((n) => progress[n.id]?.state === "passed");
}

export default function ArenaPage() {
  const { displayName, progress, hydrate, hydrated } = useSession();
  const arena = useArena();
  const { circuit, setCircuit, held, pendingControl, selectedGateId, run,
    hold, place, completeControlled, cancelPending, select, moveGate, removeGate, setParams,
    execute, clearRun } = useCircuit();

  useEffect(() => { hydrate(); }, [hydrate]);

  // Connect once the display name is known, so the opponent sees a name.
  useEffect(() => {
    if (!hydrated) return;
    // The session default is literally "you", which reads as "YOU vs YOU" on
    // the other side of a match. Anyone who has not named themselves is a
    // stranger to their opponent, and should look like one.
    arena.connect(!displayName || displayName === "you" ? "Anonymous" : displayName);
    return () => arena.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // A new match starts from a clean circuit of the right width.
  const matchId = arena.matchId;
  useEffect(() => {
    if (arena.phase === "matched" && arena.challenge) {
      setCircuit(emptyCircuit(arena.challenge.qubits, arena.challenge.title));
      clearRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Advisory only, and rate-limited to once a second so a drag does not stream.
  const runCount = useRef(0);
  const lastSent = useRef(0);
  useEffect(() => {
    if (arena.phase !== "matched") return;
    const now = Date.now();
    if (now - lastSent.current < 1000) return;
    lastSent.current = now;
    arena.reportProgress(gateCount(circuit), runCount.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuit, arena.phase]);

  /**
   * The challenge, resolved from THIS build rather than from the wire.
   *
   * A `Target` holds Float64Arrays, and JSON turns those into objects keyed by
   * index — so a target sent over the socket arrives looking like a target and
   * grades like nothing, which showed up as an empty "aiming at" plot. The
   * server names a challenge and the client looks it up in the same module the
   * server imported it from, so the two cannot disagree and nothing has to be
   * rehydrated.
   */
  const localChallenge = useMemo(() => {
    const id = arena.challenge?.id;
    return id ? CHALLENGES.find((c) => c.id === id) ?? null : null;
  }, [arena.challenge?.id]);

  const onRun = useCallback(() => {
    runCount.current += 1;
    execute(localChallenge?.target);
  }, [execute, localChallenge]);

  const ladderOpen = hydrated && unitThreeDone(progress);

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <main className={s.main}>
        <header className={s.head}>
          <div>
            <span className="label">Arena · ranked</span>
            <h1 className="statement statement--s" style={{ marginTop: 6, maxWidth: "20ch" }}>
              {arena.phase === "matched" ? "Same target. First correct answer wins."
                : arena.phase === "queued" ? "Looking for an opponent."
                : arena.phase === "finished" ? "Match over."
                : "Race someone to a state."}
            </h1>
          </div>
          <div className={s.stats}>
            <Readout value={arena.rating} label="rating" tone="measure" />
            <Readout value={arena.gamesPlayed} label="games" />
          </div>
        </header>

        {arena.problem && (
          <p className={s.problem} role="status">{arena.problem}</p>
        )}

        {arena.phase === "offline" && <Offline />}
        {arena.phase === "connecting" && <p className={s.quiet}>Connecting…</p>}

        {arena.phase === "idle" && (
          <Idle onQueue={() => arena.queue()} ladderOpen={ladderOpen} />
        )}

        {arena.phase === "queued" && (
          <Queued onCancel={() => arena.leaveQueue()} />
        )}

        {arena.phase === "matched" && arena.challenge && !localChallenge && (
          <p className={s.problem} role="status">
            The server picked a challenge this build does not have
            ({arena.challenge.id}). Update the client and try again.
          </p>
        )}

        {arena.phase === "matched" && arena.challenge && localChallenge && (
          <Match
            challenge={localChallenge}
            opponent={arena.opponent}
            opponentProgress={arena.opponentProgress}
            startedAt={arena.startedAt}
            lastGrade={arena.lastGrade}
            circuit={circuit}
            held={held}
            pendingControl={pendingControl}
            selectedGateId={selectedGateId}
            run={run}
            onHold={hold}
            onPlace={place}
            onCompleteControlled={completeControlled}
            onCancelPending={cancelPending}
            onSelect={select}
            onMove={moveGate}
            onRemove={removeGate}
            onParams={setParams}
            onRun={onRun}
            onSubmit={() => arena.submit(circuit)}
          />
        )}

        {arena.phase === "finished" && arena.result && (
          <Result result={arena.result} you={arena.playerId} onAgain={() => { arena.reset(); arena.queue(); }} onDone={() => arena.reset()} />
        )}
      </main>
    </div>
  );
}

/* -- States -------------------------------------------------------------------- */

function Offline() {
  return (
    <div className={s.panel}>
      <Registration />
      <h2 className={s.panelTitle}>The arena needs a server.</h2>
      <p className="prose">
        It is the only part of Quriosity that does. The path, the bench, the
        challenges and the review bench all run on this device and keep working
        with it stopped — you can carry on learning without it.
      </p>
      <pre className={s.code}>npm run dev:server</pre>
      <p className={s.quiet}>Then reload this page.</p>
    </div>
  );
}

function Idle({ onQueue, ladderOpen }: { onQueue(): void; ladderOpen: boolean }) {
  return (
    <>
      <div className={s.panel}>
        <Registration />
        <h2 className={s.panelTitle}>One target, two people, one clock.</h2>
        <p className="prose">
          You and your opponent are handed the identical problem at the same
          moment. The first <b>correct</b> circuit wins — not the first submitted,
          and not the shortest. The server re-runs whatever you send before it
          decides anything.
        </p>
        <div className={s.actions}>
          <Button variant="primary" size="lg" onClick={onQueue}>Queue for a match</Button>
          <Link href="/challenges" className={s.sideLink}>Practise instead →</Link>
        </div>
      </div>
      <Ladder open={ladderOpen} />
    </>
  );
}

function Queued({ onCancel }: { onCancel(): void }) {
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // The band the server is using, mirrored so the wait is explicable rather
  // than just slow. TRD §12.1: 50, widening by 50 every 2s, capped at 400.
  const band = Math.min(50 + 50 * Math.floor((waited * 1000) / 2000), 400);

  return (
    <div className={s.panel}>
      <Registration />
      <h2 className={s.panelTitle}>Looking for someone near your rating.</h2>
      <p className="prose">
        Searching within <b>±{band}</b> points, widening every two seconds up to
        ±400. After a minute the search gives up rather than pairing you with
        anyone at all.
      </p>
      <p className={s.quiet}>Waiting {waited}s</p>
      <div className={s.actions}>
        <Button variant="ghost" onClick={onCancel}>Leave the queue</Button>
      </div>
    </div>
  );
}

function Match(props: {
  challenge: { title: string; brief: string; qubits: number; target: Target; allowedGates: GateType[]; par: number };
  opponent: { name: string; rating: number } | null;
  opponentProgress: { gateCount: number; runCount: number };
  startedAt: number | null;
  lastGrade: { passed: boolean; fidelity: number } | null;
  circuit: ReturnType<typeof emptyCircuit>;
  held: unknown; pendingControl: unknown; selectedGateId: string | null; run: unknown;
  onHold(t: GateType): void;
  onPlace(...a: never[]): void;
  onCompleteControlled(...a: never[]): void;
  onCancelPending(): void;
  onSelect(id: string | null): void;
  onMove(...a: never[]): void;
  onRemove(id: string): void;
  onParams(...a: never[]): void;
  onRun(): void;
  onSubmit(): void;
}) {
  const { challenge, opponent, opponentProgress, startedAt, lastGrade } = props;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - (startedAt ?? Date.now())) / 1000)), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  const targetMap = useMemo(
    () => probabilityMap(targetProbabilities(challenge.target), challenge.qubits),
    [challenge],
  );
  const runResult = props.run as { counts?: { counts: Record<string, number> }; shots?: number } | null;

  return (
    <>
      <div className={s.matchBar}>
        <div className={s.vs}>
          <span className="label label--ink">You</span>
          <span className={s.vsMark}>vs</span>
          <span className="label label--ink">{opponent?.name ?? "Opponent"}</span>
          <Chip>{opponent?.rating ?? "—"}</Chip>
        </div>
        <div className={s.clock} aria-label={`${elapsed} seconds elapsed`}>
          {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
        </div>
      </div>

      {/* Counts only. TRD §7.2: never the opponent's IR. */}
      <div className={s.opponentBar} role="status">
        <span className="label">Opponent</span>
        <span className={s.opponentStat}>{opponentProgress.gateCount} gates</span>
        <span className={s.opponentStat}>{opponentProgress.runCount} runs</span>
        <span className={s.quiet}>You never see their circuit.</span>
      </div>

      <div className={s.taskLine}>
        <b>{challenge.title}.</b> {challenge.brief}
      </div>

      <div className={s.arenaGrid}>
        <div className={s.stage}>
          <Registration />
          <div className={s.stageBody}>
            <CircuitCanvas
              circuit={props.circuit}
              minColumns={4}
              selectedGateId={props.selectedGateId}
              held={props.held as never}
              pendingControl={props.pendingControl as never}
              onPlace={props.onPlace as never}
              onCompleteControlled={props.onCompleteControlled as never}
              onCancelPending={props.onCancelPending}
              onSelect={props.onSelect}
              onMove={props.onMove as never}
              onRemove={props.onRemove}
              onParams={props.onParams as never}
            />
          </div>
          <div className={s.stageFoot}>
            <GateTray
              available={challenge.allowedGates}
              held={(props.held as { type?: GateType } | null)?.type ?? null}
              onPick={props.onHold}
            />
            <div className={s.runRow}>
              <Button variant="secondary" onClick={props.onRun}>Run · ⌘↵</Button>
              <Button variant="primary" onClick={props.onSubmit}>Submit</Button>
            </div>
          </div>
        </div>

        <aside className={s.side}>
          <div className={s.panelTight}>
            <span className="label">Aiming at</span>
            <Histogram qubits={challenge.qubits} actual={targetMap} height={120} dense />
          </div>

          {runResult?.counts && (
            <div className={s.panelTight}>
              <span className="label">Your last run</span>
              <Histogram
                qubits={challenge.qubits}
                actual={toFractions(runResult.counts.counts, runResult.shots ?? 1024)}
                target={targetMap}
                shots={runResult.shots}
                height={120}
                dense
              />
            </div>
          )}

          {lastGrade && (
            <p className={lastGrade.passed ? s.good : s.bad} role="status">
              {lastGrade.passed
                ? "Submitted and accepted — waiting on the result."
                : `Not yet. The server graded that at ${lastGrade.fidelity.toFixed(3)}.`}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function Result({ result, you, onAgain, onDone }: {
  result: { winnerId: string | null; delta: number; yourRating: number; opponentRating: number; flagged: boolean; reason: string };
  you: string;
  onAgain(): void;
  onDone(): void;
}) {
  const won = result.winnerId === you;
  const drew = result.winnerId === null;

  return (
    <div className={s.panel} data-tone={won ? "win" : drew ? undefined : "loss"}>
      <Registration />
      <h2 className={s.panelTitle}>
        {drew ? "A draw." : won ? "You got there first." : "They got there first."}
      </h2>

      <div className={s.resultStats}>
        <Readout value={result.yourRating} label="your rating" tone="measure" />
        <Readout
          value={`${result.delta > 0 ? "+" : ""}${result.delta}`}
          label="change"
          tone={result.delta > 0 ? "measure" : result.delta < 0 ? "flag" : undefined}
        />
        <Readout value={result.opponentRating} label="opponent" />
      </div>

      {result.flagged ? (
        <p className="prose">
          This match was flagged for review and no rating was awarded. A pass
          arriving faster than the gates could physically be placed is recorded
          rather than quietly reversed — if that was genuinely you, nothing is
          lost but this one result.
        </p>
      ) : (
        <p className="prose">
          {won
            ? "Your circuit reached the target state first, checked on the server against the same physics your bench runs."
            : "Grading is on the state, not the gates — their circuit need not look anything like yours."}
        </p>
      )}

      <div className={s.actions}>
        <Button variant="primary" onClick={onAgain}>Queue again</Button>
        <Button variant="ghost" onClick={onDone}>Back to the arena</Button>
      </div>
    </div>
  );
}

/* -- The ladder ---------------------------------------------------------------- */

function Ladder({ open }: { open: boolean }) {
  const [rows, setRows] = useState<Array<{ id: string; displayName: string; rating: number; gamesPlayed: number }> | null>(null);
  const me = useArena((st) => st.playerId);

  useEffect(() => {
    if (!open) return;
    const base = (process.env.NEXT_PUBLIC_ARENA_URL ?? "ws://localhost:4000").replace(/^ws/, "http");
    fetch(`${base}/leaderboard?limit=10`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setRows(d.players ?? []))
      .catch(() => setRows([]));
  }, [open]);

  if (!open) {
    return (
      <div className={s.panelTight}>
        <span className="label">Ladder</span>
        <p className="prose prose--tight" style={{ marginTop: 8 }}>
          The leaderboard opens once you have finished Unit 3. Ranked matches
          are playable now — the ladder is just not worth reading until the
          curriculum has stopped teaching you the gates it uses.
        </p>
        <Link href="/path" className={s.sideLink}>Back to your path →</Link>
      </div>
    );
  }

  return (
    <div className={s.panelTight}>
      <span className="label">Ladder · top ten</span>
      {rows === null && <p className={s.quiet}>Loading…</p>}
      {rows?.length === 0 && <p className={s.quiet}>Nobody has finished a ranked match yet. Be first.</p>}
      {rows && rows.length > 0 && (
        <ol className={s.ladder}>
          {rows.map((p, i) => (
            <li key={p.id} className={s.ladderRow} data-you={p.id === me}>
              <span className={s.rank}>{i + 1}</span>
              <span className={s.ladderName}>{p.displayName}{p.id === me ? " (you)" : ""}</span>
              <span className={s.ladderRating}>{p.rating}</span>
              <span className={s.quiet}>{p.gamesPlayed}g</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
