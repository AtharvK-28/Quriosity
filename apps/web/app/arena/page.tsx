"use client";

/**
 * The arena — PRD E9, rebuilt as a game.
 *
 * Four states, one screen: idle, queued, matched, finished. What changed is
 * everything a competitive player expects around the race itself, after how
 * chess sites keep people playing:
 *
 *   - a RANK, not just a number: tiers with divisions and a bar to the next
 *   - a RECORD: rating trend, last matches, win streak, best rating
 *   - an opponent ALWAYS: after a short wait a bot steps in (unrated, labelled)
 *   - a COUNTDOWN, so both players read the target before the clock starts
 *   - EMOTES from a fixed set, so there is someone on the other side
 *   - a RESULT worth reading: rating and rank movement, XP earned, the other
 *     player's winning circuit, and a one-press REMATCH
 *   - TODAY: the streak, quests and daily puzzle, so a match is also progress
 *
 * WHAT IS LOCAL AND WHAT IS NOT. Run is local, exactly as everywhere else in
 * this app. Submit is the only thing that crosses to the server, and the
 * server re-simulates and re-grades before it decides anything.
 *
 * WHAT THE OPPONENT SEES. Gate count and run count during a match — never the
 * circuit (TRD §7.2). The circuit is revealed only once the match is over.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { TopBar } from "@/components/chrome/TopBar";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { GateTray } from "@/components/circuit/GateTray";
import { Histogram, probabilityMap, toFractions } from "@/components/viz/Histogram";
import { Button, Registration } from "@/components/ui/primitives";
import { TierBadge } from "@/components/arena/TierBadge";
import { TodayPanel } from "@/components/daily/TodayPanel";
import { BadgeShelf, Feed, LiveStats, Podium, PowerHud, SeasonBanner, SoundToggle, VersusSplash, VictoryBanner } from "@/components/arena/Game";
import { emptyCircuit, gateCount, nextGateId, type Circuit, type GateType } from "@/lib/ir/types";
import { targetProbabilities, type Target } from "@/lib/grade/fidelity";
import { rankFor, PROVISIONAL_GAMES } from "@/lib/arena/tiers";
import { formatCount } from "@/lib/i18n";
import { play } from "@/lib/arena/sfx";
import { useCircuit } from "@/stores/circuitStore";
import { MODE, useSession } from "@/stores/sessionStore";
import { BOT_AFTER_MS, EMOTE_TEXT, useArena, type ArenaMode, type Emote, type MatchResult, type ProfileMatch } from "@/stores/arenaStore";
import { useAuth } from "@/stores/authStore";
import { arenaHttpBase, isLocalPage } from "@/lib/arena/server";
import { NODES } from "@/lib/curriculum/nodes";
import { CHALLENGES } from "@/lib/curriculum/challenges";
import s from "./arena.module.css";

/** E9-S7: the ladder opens once Unit 3 is behind you. */
function unitThreeDone(progress: Record<string, { state?: string }>): boolean {
  return NODES.filter((n) => n.unitId === "u3").every((n) => progress[n.id]?.state === "passed");
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}


export default function ArenaPage() {
  const { progress, hydrate, hydrated, mode: appMode } = useSession();
  const arena = useArena();
  const { circuit, setCircuit, held, pendingControl, selectedGateId, run,
    hold, place, completeControlled, cancelPending, select, moveGate, dropGate, rewireGate, removeGate, setParams,
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
   * grades like nothing. The server names a challenge and the client looks it
   * up in the same module the server imported it from.
   */
  const localChallenge = useMemo(() => {
    const id = arena.challenge?.id;
    return id ? CHALLENGES.find((c) => c.id === id) ?? null : null;
  }, [arena.challenge?.id]);

  const onRun = useCallback(() => {
    runCount.current += 1;
    execute(localChallenge?.target);
  }, [execute, localChallenge]);

  useEffect(() => {
    if (arena.phase !== "matched") return;
    runCount.current = 0;
  }, [arena.phase, matchId]);

  const ladderOpen = hydrated && unitThreeDone(progress);
  const rank = rankFor(arena.rating);
  const provisional = arena.gamesPlayed < PROVISIONAL_GAMES;
  const showToday = arena.phase === "idle" || arena.phase === "signed-out" || arena.phase === "offline";

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <main className={s.main}>
        {arena.phase !== "matched" && (
          <header className={s.head}>
            <div>
              <span className="label">Arena</span>
              <h1 className="statement statement--s" style={{ marginTop: 6, maxWidth: "22ch" }}>
                {arena.phase === "queued" ? "Finding you an opponent."
                  : arena.phase === "finished" ? "Match over."
                    : "Race someone to a quantum state."}
              </h1>
            </div>
            <div className={s.headRight}>
              <div className={s.headTools}>
                {arena.phase !== "signed-out" && <LiveStats />}
                <SoundToggle />
              </div>
            {arena.phase !== "signed-out" && arena.phase !== "offline" && arena.phase !== "connecting" && (
              <div className={s.rankChip}>
                <TierBadge rank={rank} size={44} />
                <div>
                  <span className={s.rankLabel}>{rank.label}</span>
                  <span className={s.rankRating}>{formatCount(arena.rating)}{provisional ? "?" : ""}</span>
                </div>
              </div>
            )}
            </div>
          </header>
        )}

        {arena.problem && <p className={s.problem} role="status">{arena.problem}</p>}

        {arena.phase === "signed-out" && <SignedOut />}
        {arena.phase === "offline" && <Offline />}
        {arena.phase === "connecting" && <p className={s.quiet}>Connecting to the arena…</p>}

        {arena.phase === "idle" && (
          <Idle
            mode={arena.mode}
            onQueue={(m, bots) => arena.queue(m, bots)}
            ladderOpen={ladderOpen}
          />
        )}

        {arena.phase === "queued" && (
          <Queued
            mode={arena.mode}
            queuedAt={arena.queuedAt}
            onBotNow={() => { arena.leaveQueue(); setTimeout(() => arena.queue(arena.mode, "now"), 120); }}
            onCancel={() => arena.leaveQueue()}
          />
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
            onDrop={dropGate}
            onRewire={rewireGate}
            onRemove={removeGate}
            onParams={setParams}
            onRun={onRun}
            onSubmit={() => arena.submit(circuit)}
          />
        )}

        {arena.phase === "finished" && arena.result && (
          <Result
            result={arena.result}
            challengeQubits={localChallenge?.qubits ?? 2}
            showXp={MODE[appMode].motivation}
          />
        )}

        {showToday && arena.phase !== "signed-out" && <TodayPanel />}
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
        A rank has to belong to someone, so it follows you across devices — along
        with your streak, your quests and your place on the weekly ladder. The
        path, the challenges and the daily puzzle work without one.
      </p>
      <div className={s.actions}>
        <Link href="/auth/signup?next=/arena"><Button variant="primary">Create an account</Button></Link>
        <Link href="/auth/login?next=/arena"><Button variant="ghost">Sign in</Button></Link>
        <Link href="/daily" className={s.sideLink}>Try today&apos;s puzzle →</Link>
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
const MODES: Array<{ id: ArenaMode; name: string; rule: string; clock: string }> = [
  { id: "blitz", name: "Blitz", rule: "First correct circuit wins.", clock: "race" },
  { id: "golf", name: "Circuit golf", rule: "Fewest gates wins.", clock: "3 min" },
  { id: "bughunt", name: "Bug hunt", rule: "Same broken circuit. First fix wins.", clock: "race" },
];

function Idle({ mode, onQueue, ladderOpen }: { mode: ArenaMode; onQueue(m: ArenaMode, bots: "auto" | "now"): void; ladderOpen: boolean }) {
  const [picked, setPicked] = useState<ArenaMode>(mode);
  const { rating, gamesPlayed, profile } = useArena();
  const rank = rankFor(rating);
  const provisional = gamesPlayed < PROVISIONAL_GAMES;

  return (
    <div className={s.idleGrid}>
      <div className={s.idleMain}>
        <SeasonBanner />
        <section className={s.hero}>
          <Registration />
          <div className={s.heroRank}>
            <TierBadge rank={rank} size={92} />
            <div className={s.heroRankText}>
              <span className="label">Your rank</span>
              <span className={s.heroTier}>{rank.label}</span>
              <span className={s.heroRating}>
                {formatCount(rating)} rating{provisional ? ` · provisional (${Math.max(0, PROVISIONAL_GAMES - gamesPlayed)} more games)` : ""}
              </span>
            </div>
          </div>
          {rank.to !== null && (
            <div className={s.progress}>
              <div className={s.progressBar}><span style={{ width: `${rank.progress * 100}%` }} /></div>
              <span className={s.progressText}>{rank.to - rating} to {rank.next}</span>
            </div>
          )}
          <div className={s.heroStats}>
            <Stat value={profile ? `${profile.wins}–${profile.losses}–${profile.draws}` : "—"} label="W–L–D, recent" />
            <Stat value={profile?.winStreak ?? 0} label="win streak" tone={profile && profile.winStreak >= 2 ? "hot" : undefined} />
            <Stat value={profile ? formatCount(profile.bestRating) : "—"} label="best" />
            <Spark matches={profile?.matches ?? []} />
          </div>
        </section>

        <section className={s.panel}>
          <h2 className={s.panelTitle}>Pick a match.</h2>
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
                <span className={s.modeIcon} data-mode={m.id} aria-hidden />
                <span className={s.modeName}>{m.name}</span>
                <span className={s.modeRule}>{m.rule}</span>
                <span className={s.modeClock}>{m.clock}</span>
              </button>
            ))}
          </div>
          <div className={s.actions}>
            <button type="button" className={s.playBtn} onClick={() => onQueue(picked, "auto")}>
              <span className={s.playShine} aria-hidden />
              Find a match
            </button>
            <Button variant="ghost" onClick={() => onQueue(picked, "now")}>Play a bot now</Button>
          </div>
          <p className={s.quiet}>
            Ranked against people. If nobody near your rating is free within {BOT_AFTER_MS / 1000}s,
            a bot steps in — unrated, but it still counts for your quests and streak.
            Every win earns XP, and your first win each day earns a bonus.
          </p>
        </section>
        <BadgeShelf />
      </div>

      <aside className={s.idleSide}>
        <Ladder open={ladderOpen} />
        <Recent matches={profile?.matches ?? []} />
      </aside>
    </div>
  );
}

function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: "hot" }) {
  return (
    <div className={s.stat} data-tone={tone}>
      <span className={s.statValue}>{value}</span>
      <span className={s.statLabel}>{label}</span>
    </div>
  );
}

/** The rating over the last rated matches, oldest first. */
function Spark({ matches }: { matches: ProfileMatch[] }) {
  const points = matches.filter((m) => m.rated).slice(0, 15).reverse().map((m) => m.ratingAfter);
  if (points.length < 2) return <div className={s.sparkEmpty}>Play a few rated games to see your trend.</div>;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const W = 160;
  const H = 44;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 4 - ((p - lo) / Math.max(1, hi - lo)) * (H - 8)]);
  const up = points[points.length - 1] >= points[0];
  return (
    <div className={s.spark}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-label={`Rating trend: ${points[0]} to ${points[points.length - 1]}`}>
        <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} className={s.sparkLine} data-up={up || undefined} />
        <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="3" className={s.sparkDot} data-up={up || undefined} />
      </svg>
      <span className={s.statLabel}>trend</span>
    </div>
  );
}

function Recent({ matches }: { matches: ProfileMatch[] }) {
  return (
    <div className={s.panelTight}>
      <span className="label">Recent matches</span>
      {matches.length === 0 ? (
        <p className={s.quiet}>Nothing yet. Your first match shows up here.</p>
      ) : (
        <ol className={s.recent}>
          {matches.slice(0, 8).map((m) => (
            <li key={m.id} className={s.recentRow} data-result={m.result}>
              <span className={s.pill}>{m.result === "win" ? "W" : m.result === "loss" ? "L" : "D"}</span>
              <span className={s.recentName}>
                {m.opponent}
                {m.bot && <span className={s.botTag}>bot</span>}
              </span>
              <span className={s.recentMode}>{m.mode === "bughunt" ? "bug hunt" : m.mode}</span>
              <span className={s.recentDelta} data-sign={m.delta > 0 ? "up" : m.delta < 0 ? "down" : undefined}>
                {m.rated ? `${m.delta > 0 ? "+" : ""}${m.delta}` : "—"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Queued({ mode, queuedAt, onBotNow, onCancel }: { mode: ArenaMode; queuedAt: number | null; onBotNow(): void; onCancel(): void }) {
  const now = useNow(250);
  const waited = Math.max(0, Math.floor((now - (queuedAt ?? now)) / 1000));
  // The band the server is using, mirrored so the wait is explicable rather
  // than just slow. TRD §12.1: 50, widening by 50 every 2s, capped at 400.
  const band = Math.min(50 + 50 * Math.floor((waited * 1000) / 2000), 400);
  const botIn = Math.max(0, Math.ceil((BOT_AFTER_MS - (now - (queuedAt ?? now))) / 1000));

  return (
    <div className={s.queue}>
      <Registration />
      <div className={s.radar} aria-hidden>
        <span className={s.radarRing} />
        <span className={s.radarRing} data-delay="1" />
        <span className={s.radarRing} data-delay="2" />
        <span className={s.radarCore}>q</span>
      </div>
      <div className={s.queueText}>
        <span className="label">{MODES.find((m) => m.id === mode)?.name} · searching</span>
        <p className={s.queueTitle}>Looking within ±{band} of your rating.</p>
        <p className={s.quiet}>
          {botIn > 0 ? `Waited ${waited}s. A bot joins in ${botIn}s if nobody turns up.` : "No one yet — bringing in a bot."}
        </p>
        <div className={s.actions}>
          <Button variant="secondary" onClick={onBotNow}>Play a bot now</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

const EMOTES: Emote[] = ["gl", "nice", "wow", "oops", "hurry", "gg"];

function Match(props: {
  challenge: { title: string; brief: string; qubits: number; target: Target; allowedGates: GateType[]; par: number };
  circuit: Circuit;
  held: unknown; pendingControl: unknown; selectedGateId: string | null; run: unknown;
  onHold(t: GateType): void;
  onPlace(...a: never[]): void;
  onCompleteControlled(...a: never[]): void;
  onCancelPending(): void;
  onSelect(id: string | null): void;
  onMove(...a: never[]): void;
  onDrop(...a: never[]): void;
  onRewire(...a: never[]): void;
  onRemove(id: string): void;
  onParams(...a: never[]): void;
  onRun(): void;
  onSubmit(): void;
}) {
  const { challenge } = props;
  const arena = useArena();
  const user = useAuth((a) => a.user);
  const { opponent, opponentProgress, startedAt, lastGrade, mode, capMs, best, rated, emotes } = arena;
  const golf = mode === "golf";
  const now = useNow(100);
  const starting = startedAt !== null && now < startedAt;
  const elapsed = Math.max(0, Math.floor((now - (startedAt ?? now)) / 1000));
  const shown = golf && capMs ? Math.max(0, Math.ceil(capMs / 1000) - elapsed) : elapsed;

  const targetMap = useMemo(
    () => probabilityMap(targetProbabilities(challenge.target), challenge.qubits),
    [challenge],
  );
  const runResult = props.run as { counts?: { counts: Record<string, number> }; shots?: number } | null;
  const theirBubble = emotes.theirs && now - emotes.theirs.at < 3500 ? EMOTE_TEXT[emotes.theirs.emote] : null;
  const myBubble = emotes.mine && now - emotes.mine.at < 2500 ? EMOTE_TEXT[emotes.mine.emote] : null;
  const oppShare = Math.min(1, opponentProgress.gateCount / Math.max(1, challenge.par));
  // Your power bar: the best fidelity any of your own runs has reached.
  const [myPower, setMyPower] = useState(0);
  const runFidelity = (props.run as { grade?: { fidelity: number } } | null)?.grade?.fidelity ?? null;
  const lastRunFid = useRef<number | null>(null);
  useEffect(() => setMyPower(0), [arena.matchId]);
  useEffect(() => {
    if (runFidelity === null || runFidelity === lastRunFid.current) return;
    lastRunFid.current = runFidelity;
    play("run");
    setMyPower((p) => Math.max(p, runFidelity));
  }, [runFidelity]);

  // ⌘↵ runs, as on the bench.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !starting) { e.preventDefault(); props.onRun(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      {startedAt !== null && (
        <VersusSplash
          me={{ name: user?.displayName ?? "You", rating: arena.rating }}
          them={{ name: opponent?.name ?? "Opponent", rating: opponent?.rating ?? 1200, bot: opponent?.bot }}
          startsAt={startedAt}
          modeName={MODES.find((m) => m.id === mode)?.name ?? "Match"}
        />
      )}
      <PowerHud
        me={{ name: user?.displayName ?? "You", rating: arena.rating }}
        them={{ name: opponent?.name ?? "Opponent", rating: opponent?.rating ?? 1200, bot: opponent?.bot }}
        myPower={myPower}
        theirPower={oppShare}
        theirStats={`${opponentProgress.gateCount} ${opponentProgress.gateCount === 1 ? "gate" : "gates"} · ${opponentProgress.runCount} ${opponentProgress.runCount === 1 ? "run" : "runs"}`}
        clockSecs={starting ? (golf && capMs ? Math.ceil(capMs / 1000) : 0) : shown}
        low={golf && !starting && shown <= 30}
        modeName={MODES.find((m) => m.id === mode)?.name ?? "Match"}
        rated={rated}
        myBubble={myBubble}
        theirBubble={theirBubble}
      />

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
        <div key={arena.missAt ?? 0} className={s.stage} data-locked={starting || undefined} data-shake={arena.missAt && now - arena.missAt < 600 ? true : undefined}>
          <Registration />
          <div className={s.stageBody}>
            <CircuitCanvas
              circuit={props.circuit}
              minColumns={4}
              selectedGateId={props.selectedGateId}
              held={props.held as never}
              pendingControl={props.pendingControl as never}
              readOnly={starting}
              onPlace={props.onPlace as never}
              onCompleteControlled={props.onCompleteControlled as never}
              onCancelPending={props.onCancelPending}
              onSelect={props.onSelect}
              onMove={props.onMove as never}
              onDrop={props.onDrop as never}
              onRewire={props.onRewire as never}
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
              <Button variant="secondary" onClick={props.onRun} disabled={starting}>Run · ⌘↵</Button>
              <Button variant="primary" onClick={props.onSubmit} disabled={starting}>Submit</Button>
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

          <Feed items={arena.feed} />

          <Resign />

          <div className={s.emotes} aria-label="Send a message">
            {EMOTES.map((e) => (
              <button key={e} type="button" className={s.emote} onClick={() => arena.sendEmote(e)}>
                {EMOTE_TEXT[e]}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

/** Two presses, as on chess sites: one to ask, one to mean it. */
function Resign() {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 4000);
    return () => clearTimeout(t);
  }, [asking]);
  return (
    <button
      type="button"
      className={s.resign}
      data-asking={asking || undefined}
      onClick={() => (asking ? useArena.getState().resign() : setAsking(true))}
    >
      {asking ? "Press again to resign" : "Resign"}
    </button>
  );
}

function Result({ result, challengeQubits, showXp }: { result: MatchResult; challengeQubits: number; showXp: boolean }) {
  const arena = useArena();
  const you = arena.playerId;
  const won = result.winnerId === you;
  const drew = result.winnerId === null;
  const golf = arena.mode === "golf";
  const title = drew
    ? result.reason === "nobody reached the target" ? "Nobody got there." : "A draw."
    : result.reason === "opponent disconnected" ? (won ? "They left. It's yours." : "You left the match.")
      : result.reason === "resigned" ? (won ? "They resigned. It's yours." : "You resigned.")
      : golf ? (won ? "Fewer gates. Victory." : "They did it in fewer gates.")
        : arena.mode === "bughunt" ? (won ? "You found the bug first." : "They found it first.")
          : won ? "Victory." : "They got there first.";

  const before = rankFor(result.ratingBefore);
  const after = rankFor(result.yourRating);
  const [bar, setBar] = useState(before.label === after.label ? before.progress : after.progress);
  useEffect(() => {
    const t = setTimeout(() => setBar(after.progress), 300);
    return () => clearTimeout(t);
  }, [after.progress]);
  const moved = before.label !== after.label;

  const theirs = result.review?.theirs ?? null;
  const yours = result.review?.yours ?? null;
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const theirCircuit = useMemo(() => (theirs ? { ...theirs.circuit, qubits: theirs.circuit.qubits || challengeQubits } : null), [theirs, challengeQubits]);

  return (
    <div className={s.result} data-tone={won ? "win" : drew ? "draw" : "loss"}>
      <VictoryBanner result={result} won={won} drew={drew} earned={arena.earned} submits={arena.submits} />
      <div className={s.resultHead}>
        <span className={s.resultKicker}>{won ? "Win" : drew ? "Draw" : "Loss"}{result.rated ? "" : " · unrated"}</span>
        <h2 className={s.resultTitle}>{title}</h2>
      </div>

      <div className={s.resultRank}>
        <TierBadge rank={after} size={72} />
        <div className={s.resultRankText}>
          <span className={s.heroTier}>
            {after.label}
            {moved && <span className={s.rankMove} data-up={after.tier.min >= before.tier.min && result.delta > 0 || undefined}>{result.delta > 0 ? "Promoted" : "Dropped"}</span>}
          </span>
          <span className={s.heroRating}>
            {formatCount(result.yourRating)}{" "}
            {result.rated ? (
              <b className={s.delta} data-sign={result.delta > 0 ? "up" : result.delta < 0 ? "down" : undefined}>
                {result.delta > 0 ? "+" : ""}{result.delta}
              </b>
            ) : (
              <span className={s.quiet}>no rating change against a bot</span>
            )}
          </span>
          {after.to !== null && (
            <div className={s.progress}>
              <div className={s.progressBar}><span style={{ width: `${bar * 100}%` }} /></div>
              <span className={s.progressText}>{after.to - result.yourRating} to {after.next}</span>
            </div>
          )}
        </div>
        {showXp && result.xp > 0 && <span className={s.xpChip}>+{result.xp} XP</span>}
      </div>

      {result.flagged ? (
        <p className="prose">
          This match was flagged for review and no rating was awarded. A pass
          faster than the gates could physically be placed, or the reference
          answer exactly on a first attempt, is recorded rather than quietly
          reversed — if that was genuinely you, nothing is lost but this one result.
        </p>
      ) : (
        <div className={s.review}>
          <div className={s.reviewCol}>
            <span className="label">Your answer</span>
            <p className={s.reviewStat}>{yours ? `${yours.gates} gates · ${secs(yours.ms)}` : "Not solved"}</p>
          </div>
          <div className={s.reviewCol}>
            <span className="label">{arena.opponent?.bot ? "The bot's answer" : "Their answer"}</span>
            <p className={s.reviewStat}>{theirs ? `${theirs.gates} gates · ${secs(theirs.ms)}` : "Not solved"}</p>
            {theirCircuit && (
              <div className={s.reviewCanvas}>
                <CircuitCanvas circuit={theirCircuit} readOnly minColumns={3} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className={s.actions}>
        <Button
          variant="primary"
          onClick={() => arena.requestRematch()}
          disabled={arena.rematch.mine}
        >
          {arena.rematch.mine ? (arena.opponent?.bot ? "Starting…" : "Waiting for them…") : arena.rematch.theirs ? "Accept rematch" : "Rematch"}
        </Button>
        <Button variant="secondary" onClick={() => { arena.reset(); arena.queue(arena.mode, "auto"); }}>New opponent</Button>
        <Button variant="ghost" onClick={() => arena.reset()}>Back to the arena</Button>
        <button type="button" className={s.emote} onClick={() => arena.sendEmote("gg")}>Good game</button>
      </div>
      {arena.rematch.theirs && !arena.rematch.mine && <p className={s.good} role="status">{arena.opponent?.name} wants a rematch.</p>}
      {arena.emotes.theirs && Date.now() - arena.emotes.theirs.at < 5000 && (
        <p className={s.quiet} role="status">{arena.opponent?.name}: “{EMOTE_TEXT[arena.emotes.theirs.emote]}”</p>
      )}
    </div>
  );
}

/* -- The ladder ---------------------------------------------------------------- */

function Ladder({ open }: { open: boolean }) {
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [rows, setRows] = useState<Array<{ id: string; displayName: string; rating: number; gamesPlayed?: number; points?: number; wins?: number }> | null>(null);
  const me = useArena((st) => st.playerId);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    const base = arenaHttpBase();
    fetch(`${base}/leaderboard?limit=10${period === "week" ? "&period=week" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setRows(d.players ?? []))
      .catch(() => setRows([]));
  }, [open, period]);

  if (!open) {
    return (
      <div className={s.panelTight}>
        <span className="label">Ladder</span>
        <p className="prose prose--tight" style={{ marginTop: 8 }}>
          The ladder opens once you have finished Unit 3. Matches count from
          now — the ladder is just not worth reading until the curriculum has
          stopped teaching you the gates it uses.
        </p>
        <Link href="/path" className={s.sideLink}>Back to your path →</Link>
      </div>
    );
  }

  return (
    <div className={s.panelTight}>
      <div className={s.ladderHead}>
        <span className="label">Ladder</span>
        <div className={s.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={period === "week"} onClick={() => setPeriod("week")}>This week</button>
          <button type="button" role="tab" aria-selected={period === "all"} onClick={() => setPeriod("all")}>All time</button>
        </div>
      </div>
      {period === "week" && <p className={s.quiet}>3 points a win, 1 a draw. Resets Monday.</p>}
      {rows === null && <p className={s.quiet}>Loading…</p>}
      {rows?.length === 0 && <p className={s.quiet}>{period === "week" ? "Nobody has scored this week. Take the top spot." : "Nobody has finished a ranked match yet. Be first."}</p>}
      {rows && rows.length > 0 && <Podium rows={rows} me={me} metric={period} />}
      {rows && rows.length > 3 && (
        <ol className={s.ladder} start={4}>
          {rows.slice(3).map((p, i) => (
            <li key={p.id} className={s.ladderRow} data-you={p.id === me}>
              <span className={s.rank}>{i + 4}</span>
              <span className={s.ladderName}>
                <TierBadge rank={rankFor(p.rating)} size={20} />
                {p.displayName}{p.id === me ? " (you)" : ""}
              </span>
              <span className={s.ladderRating}>{period === "week" ? `${p.points}` : p.rating}</span>
              <span className={s.quiet}>{period === "week" ? "pts" : `${p.gamesPlayed}g`}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

