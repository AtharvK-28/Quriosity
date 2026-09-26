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
import { emptyCircuit, gateCount, nextGateId, type GateType } from "@/lib/ir/types";
import { targetProbabilities, type Target } from "@/lib/grade/fidelity";
import { useCircuit } from "@/stores/circuitStore";
import { useSession } from "@/stores/sessionStore";
import { useArena, type ArenaMode } from "@/stores/arenaStore";
import { useAuth } from "@/stores/authStore";
import { arenaHttpBase, isLocalPage } from "@/lib/arena/server";
import { NODES } from "@/lib/curriculum/nodes";
import { CHALLENGES } from "@/lib/curriculum/challenges";
import s from "./arena.module.css";

/** E9-S7: the ladder opens once Unit 3 is behind you. */
function unitThreeDone(progress: Record<string, { state?: string }>): boolean {
  return NODES.filter((n) => n.unitId === "u3").every((n) => progress[n.id]?.state === "passed");
}

export default function ArenaPage() {
  const { progress, hydrate, hydrated } = useSession();
  const arena = useArena();
  const { circuit, setCircuit, held, pendingControl, selectedGateId, run,
    hold, place, completeControlled, cancelPending, select, moveGate, removeGate, setParams,
    execute, clearRun } = useCircuit();

  useEffect(() => { hydrate(); }, [hydrate]);

  // Ranked play is an account's (PRD §6.4). Connect once the session check
  // has answered; a guest gets the sign-in panel instead of a socket.
  const authStatus = useAuth((st) => st.status);
  useEffect(() => {
    if (authStatus === "unknown") return;
    if (authStatus === "guest") {
      useArena.setState({ phase: "signed-out", problem: null });
      return;
    }
    void arena.connect();
    return () => arena.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  // A new match starts from the circuit the mode hands out: the broken one in
  // a bug hunt, a clean one of the right width otherwise.
  const matchId = arena.matchId;
  useEffect(() => {
    if (arena.phase === "matched" && arena.challenge) {
      const c = emptyCircuit(arena.challenge.qubits, arena.challenge.title);
      if (arena.mode === "bughunt" && arena.challenge.starter) {
        c.gates = arena.challenge.starter.map((g) => ({
          id: nextGateId(),
          type: g.type as GateType,
          targets: g.targets,
          controls: g.controls ?? [],
          params: g.params ?? [],
          column: g.column,
          ...(g.type === "measure" ? { clbit: g.targets[0] } : {}),
        }));
      }
      setCircuit(c);
      clearRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Advisory only, and rate-limited to once a second so a drag does not
  // stream. The limit trails as well as leads: a change inside the window is
  // sent when the window closes, so the opponent's count is never left stale.
  const runCount = useRef(0);
  const lastSent = useRef(0);
  useEffect(() => {
    if (arena.phase !== "matched") return;
    const send = () => {
      lastSent.current = Date.now();
      arena.reportProgress(gateCount(useCircuit.getState().circuit), runCount.current);
    };
    const wait = 1000 - (Date.now() - lastSent.current);
    if (wait <= 0) {
      send();
      return;
    }
    const t = setTimeout(send, wait);
    return () => clearTimeout(t);
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
              {arena.phase === "matched"
                ? arena.mode === "golf" ? "Same target. Fewest gates wins."
                  : arena.mode === "bughunt" ? "Same bug. First fix wins."
                  : "Same target. First correct answer wins."
                : arena.phase === "queued" ? "Looking for an opponent."
                : arena.phase === "finished" ? "Match over."
                : "Race someone to a state."}
            </h1>
          </div>
          {/* A rating belongs to an account; a guest has none to show. */}
          {arena.phase !== "signed-out" && (
            <div className={s.stats}>
              <Readout value={arena.rating} label="rating" tone="measure" />
              <Readout value={arena.gamesPlayed} label="games" />
            </div>
          )}
        </header>

        {arena.problem && (
          <p className={s.problem} role="status">{arena.problem}</p>
        )}

        {arena.phase === "signed-out" && <SignedOut />}
        {arena.phase === "offline" && <Offline />}
        {arena.phase === "connecting" && <p className={s.quiet}>Connecting…</p>}

        {arena.phase === "idle" && (
          <Idle mode={arena.mode} onQueue={(m) => arena.queue(m)} ladderOpen={ladderOpen} />
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
            mode={arena.mode}
            capMs={arena.capMs}
            best={arena.best}
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
          <Result result={arena.result} mode={arena.mode} you={arena.playerId} onAgain={() => { arena.reset(); arena.queue(); }} onDone={() => arena.reset()} />
        )}
      </main>
    </div>
  );
}

/* -- States -------------------------------------------------------------------- */

function SignedOut() {
  return (
    <div className={s.panel}>
      <Registration />
      <h2 className={s.panelTitle}>Ranked matches need an account.</h2>
      <p className="prose">
        A rating has to belong to someone, so it follows you across devices. Practice
        rounds, challenges and the whole path work without one.
      </p>
      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", marginTop: "var(--s-4)" }}>
        <Link href="/auth/signup?next=/arena"><Button variant="primary">Create an account</Button></Link>
        <Link href="/auth/login?next=/arena"><Button variant="ghost">Sign in</Button></Link>
      </div>
    </div>
  );
}

function Offline() {
  // Decided after mount: the server render cannot know the hostname, and
  // guessing would make the two renders disagree.
  const [local, setLocal] = useState(true);
  useEffect(() => setLocal(isLocalPage()), []);

  return (
    <div className={s.panel}>
      <Registration />
      <h2 className={s.panelTitle}>The arena needs a server.</h2>
      <p className="prose">
        It is the only part of Quriosity that does. The path, the bench, the
        challenges and the review bench all run on this device and keep working
        with it stopped — you can carry on learning without it.
      </p>
      {local ? (
        <>
          <pre className={s.code}>npm run dev:server</pre>
          <p className={s.quiet}>Then reload this page.</p>
        </>
      ) : (
        <p className={s.quiet}>
          The server sleeps when nobody is playing and can take a minute to
          wake. Reload this page shortly.
        </p>
      )}
    </div>
  );
}

/** PRD E9-S6. One line each: what wins. */
const MODES: Array<{ id: ArenaMode; name: string; rule: string }> = [
  { id: "blitz", name: "Blitz", rule: "The first correct circuit wins." },
  { id: "golf", name: "Circuit golf", rule: "Three minutes. Fewest gates wins." },
  { id: "bughunt", name: "Bug hunt", rule: "Same broken circuit. First fix wins." },
];

function Idle({ mode, onQueue, ladderOpen }: { mode: ArenaMode; onQueue(m: ArenaMode): void; ladderOpen: boolean }) {
  const [picked, setPicked] = useState<ArenaMode>(mode);
  return (
    <>
      <div className={s.panel}>
        <Registration />
        <h2 className={s.panelTitle}>One target, two people.</h2>
        <div className={s.modes} role="radiogroup" aria-label="Match type">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={picked === m.id}
              className={s.mode}
              data-on={picked === m.id || undefined}
              onClick={() => setPicked(m.id)}
            >
              <span className={s.modeName}>{m.name}</span>
              <span className={s.modeRule}>{m.rule}</span>
            </button>
          ))}
        </div>
        <p className={s.quiet}>
          The server re-runs everything you send and decides on the state it
          reaches — never on the gates you chose, except to count them in golf.
        </p>
        <div className={s.actions}>
          <Button variant="primary" size="lg" onClick={() => onQueue(picked)}>Queue for a match</Button>
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
  mode: ArenaMode;
  capMs: number | null;
  best: number | null;
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
  const { challenge, opponent, opponentProgress, startedAt, lastGrade, mode, capMs, best } = props;
  const golf = mode === "golf";
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
        {(() => {
          // Golf counts down to the cap; the races count up.
          const shown = golf && capMs ? Math.max(0, Math.ceil(capMs / 1000) - elapsed) : elapsed;
          return (
            <div
              className={s.clock}
              data-low={golf && shown <= 30 ? true : undefined}
              aria-label={golf ? `${shown} seconds left` : `${shown} seconds elapsed`}
            >
              {String(Math.floor(shown / 60)).padStart(2, "0")}:{String(shown % 60).padStart(2, "0")}
            </div>
          );
        })()}
      </div>

      {/* Counts only. TRD §7.2: never the opponent's IR. */}
      <div className={s.opponentBar} role="status">
        <span className="label">Opponent</span>
        <span className={s.opponentStat}>{opponentProgress.gateCount} {opponentProgress.gateCount === 1 ? "gate" : "gates"}</span>
        <span className={s.opponentStat}>{opponentProgress.runCount} {opponentProgress.runCount === 1 ? "run" : "runs"}</span>
        <span className={s.quiet}>You never see their circuit.</span>
      </div>

      <div className={s.taskLine}>
        <b>{challenge.title}.</b> {challenge.brief}
        {golf && (
          <span className={s.golfLine}>
            Par {challenge.par}
            {best !== null && <> · your best <b>{best}</b></>}
          </span>
        )}
        {mode === "bughunt" && <span className={s.golfLine}>Something here is wrong. Fix it — don&apos;t start over.</span>}
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
                ? golf
                  ? `Correct in ${best ?? "?"} gates. Beat it before the clock runs out, or let it stand.`
                  : "Submitted and accepted — waiting on the result."
                : `Not yet. The server graded that at ${lastGrade.fidelity.toFixed(3)}.`}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function Result({ result, mode, you, onAgain, onDone }: {
  result: { winnerId: string | null; delta: number; yourRating: number; opponentRating: number; flagged: boolean; reason: string };
  mode: ArenaMode;
  you: string;
  onAgain(): void;
  onDone(): void;
}) {
  const won = result.winnerId === you;
  const drew = result.winnerId === null;
  const golf = mode === "golf";
  const title = drew
    ? result.reason === "nobody reached the target" ? "Nobody got there. A draw." : "A draw."
    : result.reason === "opponent disconnected" ? (won ? "They left. The match is yours." : "You left the match.")
    : golf ? (won ? "Fewer gates than them." : "They did it in fewer gates.")
    : mode === "bughunt" ? (won ? "You found it first." : "They found it first.")
    : won ? "You got there first." : "They got there first.";

  return (
    <div className={s.panel} data-tone={won ? "win" : drew ? undefined : "loss"}>
      <Registration />
      <h2 className={s.panelTitle}>
        {title}
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
          faster than the gates could physically be placed, or the reference
          answer exactly on a first attempt, is recorded rather than quietly
          reversed — if that was genuinely you, nothing is lost but this one
          result.
        </p>
      ) : (
        <p className="prose">
          {golf
            ? "Both circuits were checked on the server; only correct ones counted, and then only their gates."
            : won
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
    const base = arenaHttpBase();
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
