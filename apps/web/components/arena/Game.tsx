"use client";

/**
 * The arena's game layer — everything that makes a race feel like a match.
 *
 *   VersusSplash   the fighting-game intro: both cards fly in, win odds, 3-2-1-GO
 *   PowerHud       both players as power bars — your best fidelity so far against
 *                  their progress to par — with the clock in the middle
 *   Feed           the play-by-play ("Cy submitted — missed, 71%")
 *   VictoryBanner  VICTORY / DEFEAT in lights, confetti, the rating counting up
 *   BadgeShelf     the badges, earned and still to earn
 *   Podium         the top three, on steps
 *   SeasonBanner   this week's season and when it ends
 *   LiveStats      who is online, queueing and playing right now
 *   SoundToggle    sound on or off, remembered
 *
 * Nothing here decides anything: every number shown arrives from the server or
 * from this player's own runs. It is presentation, with physics untouched.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { TierBadge } from "./TierBadge";
import { rankFor, type Rank } from "@/lib/arena/tiers";
import { BADGES, BADGES_BY_ID } from "@/lib/arena/badges";
import { muted, play, setMuted } from "@/lib/arena/sfx";
import { formatCount } from "@/lib/i18n";
import { useArena, type FeedItem, type MatchResult } from "@/stores/arenaStore";
import { useSession } from "@/stores/sessionStore";
import s from "./Game.module.css";

export function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** Elo's own answer to "who is favourite". */
export function winChance(mine: number, theirs: number): number {
  return 1 / (1 + 10 ** ((theirs - mine) / 400));
}

const clockText = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

/* -- The intro ------------------------------------------------------------------ */

export function VersusSplash({ me, them, startsAt, modeName }: {
  me: { name: string; rating: number };
  them: { name: string; rating: number; bot?: boolean };
  startsAt: number;
  modeName: string;
}) {
  const now = useNow(100);
  const left = Math.ceil((startsAt - now) / 1000);
  const lastTick = useRef<number | null>(null);
  const [goUntil, setGoUntil] = useState<number | null>(null);

  useEffect(() => {
    if (left > 0 && left <= 3 && lastTick.current !== left) {
      lastTick.current = left;
      play("tick");
    }
    if (left <= 0 && lastTick.current !== 0) {
      lastTick.current = 0;
      play("go");
      setGoUntil(Date.now() + 700);
    }
  }, [left]);

  const showing = left > 0 || (goUntil !== null && now < goUntil);
  if (!showing) return null;
  const odds = winChance(me.rating, them.rating);

  return (
    <div className={s.versusSplash} role="status" aria-live="assertive">
      <div className={s.vsMode}>{modeName}</div>
      <div className={s.vsRow}>
        <VsCard side="left" name={me.name} rating={me.rating} rank={rankFor(me.rating)} tag="you" />
        <div className={s.vsMark}>VS</div>
        <VsCard side="right" name={them.name} rating={them.rating} rank={rankFor(them.rating)} tag={them.bot ? "bot" : undefined} />
      </div>
      <div className={s.odds}>
        <span>{Math.round(odds * 100)}%</span>
        <div className={s.oddsBar}><span style={{ width: `${odds * 100}%` }} /></div>
        <span>{Math.round((1 - odds) * 100)}%</span>
      </div>
      <div key={left > 0 ? left : "go"} className={s.vsCount} data-go={left <= 0 || undefined}>
        {left > 0 ? left : "GO!"}
      </div>
      <p className={s.vsHint}>{left > 0 ? "Read the target. The clock starts at zero." : ""}</p>
    </div>
  );
}

function VsCard({ side, name, rating, rank, tag }: { side: "left" | "right"; name: string; rating: number; rank: Rank; tag?: string }) {
  return (
    <div className={s.vsCard} data-side={side}>
      <TierBadge rank={rank} size={88} />
      <span className={s.vsName}>{name}{tag && <span className={s.vsTag}>{tag}</span>}</span>
      <span className={s.vsRank}>{rank.label} · {formatCount(rating)}</span>
    </div>
  );
}

/* -- The HUD --------------------------------------------------------------------- */

export function PowerHud({ me, them, myPower, theirPower, theirStats, clockSecs, low, modeName, rated, myBubble, theirBubble }: {
  me: { name: string; rating: number };
  them: { name: string; rating: number; bot?: boolean };
  /** 0–1: your best fidelity so far this match. */
  myPower: number;
  /** 0–1: their gates against par. */
  theirPower: number;
  theirStats: string;
  clockSecs: number;
  low: boolean;
  modeName: string;
  rated: boolean;
  myBubble: string | null;
  theirBubble: string | null;
}) {
  return (
    <div className={s.hud}>
      <HudSide side="left" name={me.name} rating={me.rating} power={myPower} caption={myPower > 0 ? `best run ${Math.round(myPower * 100)}%` : "no run yet"} bubble={myBubble} tag="you" />
      <div className={s.hudClock} data-low={low || undefined}>
        <span className={s.hudMode}>{modeName}{rated ? "" : " · unrated"}</span>
        <span className={s.hudTime}>{clockText(clockSecs)}</span>
      </div>
      <HudSide side="right" name={them.name} rating={them.rating} power={theirPower} caption={theirStats} bubble={theirBubble} tag={them.bot ? "bot" : undefined} />
    </div>
  );
}

function HudSide({ side, name, rating, power, caption, bubble, tag }: {
  side: "left" | "right"; name: string; rating: number; power: number; caption: string; bubble: string | null; tag?: string;
}) {
  const rank = rankFor(rating);
  return (
    <div className={s.hudSide} data-side={side}>
      <TierBadge rank={rank} size={48} />
      <div className={s.hudText}>
        <span className={s.hudName}>{name}{tag && <span className={s.vsTag}>{tag}</span>}</span>
        <div className={s.power} data-hot={power >= 0.9 || undefined}>
          <span style={{ width: `${Math.max(3, power * 100)}%` }} />
        </div>
        <span className={s.hudCaption}>{caption}</span>
      </div>
      {bubble && <span key={bubble} className={s.hudBubble}>{bubble}</span>}
    </div>
  );
}

/* -- The play-by-play ------------------------------------------------------------- */

export function Feed({ items }: { items: FeedItem[] }) {
  const now = useNow(1000);
  return (
    <div className={s.feed} aria-live="polite">
      <span className={s.feedHead}>Play-by-play</span>
      {items.length === 0 ? (
        <p className={s.feedEmpty}>Quiet so far. Their moves show up here.</p>
      ) : (
        <ol className={s.feedList}>
          {items.map((it) => (
            <li key={it.id} className={s.feedItem} data-kind={it.kind}>
              <span className={s.feedDot} aria-hidden />
              <span className={s.feedText}>{it.text}</span>
              <span className={s.feedAge}>{Math.max(0, Math.round((now - it.at) / 1000))}s</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* -- The result ------------------------------------------------------------------- */

function useCountUp(from: number, to: number, ms = 1100) {
  const [v, setV] = useState(from);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - (1 - k) ** 3;
      setV(Math.round(from + (to - from) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms]);
  return v;
}

export function VictoryBanner({ result, won, drew, earned, submits }: {
  result: MatchResult; won: boolean; drew: boolean; earned: string[]; submits: number;
}) {
  const rating = useCountUp(result.ratingBefore, result.yourRating);
  const word = won ? "VICTORY" : drew ? "DRAW" : "DEFEAT";
  const yours = result.review?.yours ?? null;
  return (
    <div className={s.banner} data-tone={won ? "win" : drew ? "draw" : "loss"}>
      {won && <Confetti />}
      <div className={s.bannerWord} aria-label={word}>
        {word.split("").map((ch, i) => (
          <span key={i} style={{ animationDelay: `${i * 45}ms` }}>{ch}</span>
        ))}
      </div>
      <div className={s.bannerStats}>
        <div className={s.bannerStat}>
          <span className={s.bannerNum}>{formatCount(rating)}</span>
          <span className={s.bannerLabel}>
            rating{result.rated ? (result.delta !== 0 ? ` ${result.delta > 0 ? "+" : ""}${result.delta}` : "") : " · unrated"}
          </span>
        </div>
        <div className={s.bannerStat}>
          <span className={s.bannerNum}>{yours ? `${(yours.ms / 1000).toFixed(1)}s` : "—"}</span>
          <span className={s.bannerLabel}>your time</span>
        </div>
        <div className={s.bannerStat}>
          <span className={s.bannerNum}>{yours ? yours.gates : "—"}</span>
          <span className={s.bannerLabel}>gates</span>
        </div>
        <div className={s.bannerStat}>
          <span className={s.bannerNum}>{submits}</span>
          <span className={s.bannerLabel}>{submits === 1 ? "submit" : "submits"}</span>
        </div>
      </div>
      {earned.length > 0 && (
        <div className={s.earned}>
          <span className={s.earnedHead}>Badges unlocked</span>
          {earned.map((id) => {
            const b = BADGES_BY_ID.get(id);
            return b ? (
              <span key={id} className={s.earnedChip}>
                <span className={s.medal} data-earned>{b.glyph}</span>
                {b.name}
              </span>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

/** Sixty pieces of colour, once. Decoration earned by winning. */
export function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 60 }, (_, i) => ({
      left: (i * 37) % 100,
      delay: (i % 12) * 60,
      dur: 1600 + ((i * 53) % 900),
      hue: ["var(--cta)", "var(--measure)", "var(--phase)", "var(--error)", "var(--flag)"][i % 5],
      rot: (i * 47) % 360,
      w: 6 + (i % 3) * 3,
    })),
    [],
  );
  return (
    <div className={s.confetti} aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.hue,
            width: p.w,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.dur}ms`,
            ["--r" as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}

/* -- The lobby -------------------------------------------------------------------- */

export function BadgeShelf() {
  const held = new Set(useSession((st) => st.badges));
  return (
    <section className={s.shelf}>
      <div className={s.shelfHead}>
        <span className="label">Badges</span>
        <span className={s.shelfCount}>{held.size} / {BADGES.length}</span>
      </div>
      <ul className={s.shelfGrid}>
        {BADGES.map((b) => (
          <li key={b.id} className={s.shelfItem} data-earned={held.has(b.id) || undefined} title={`${b.name} — ${b.how}`}>
            <span className={s.medal} data-earned={held.has(b.id) || undefined}>{held.has(b.id) ? b.glyph : "?"}</span>
            <span className={s.shelfName}>{b.name}</span>
            <span className={s.shelfHow}>{b.how}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Podium({ rows, me, metric }: {
  rows: Array<{ id: string; displayName: string; rating: number; points?: number }>;
  me: string;
  metric: "week" | "all";
}) {
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;
  // Second, first, third — the way podiums stand.
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className={s.podium}>
      {order.map((p) => {
        const place = top.indexOf(p) + 1;
        return (
          <div key={p.id} className={s.step} data-place={place} data-you={p.id === me || undefined}>
            <TierBadge rank={rankFor(p.rating)} size={place === 1 ? 46 : 36} />
            <span className={s.stepName}>{p.displayName}</span>
            <span className={s.stepScore}>{metric === "week" ? `${p.points} pts` : p.rating}</span>
            <span className={s.stepBlock}>{place}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SeasonBanner() {
  const stats = useArena((st) => st.stats);
  const now = useNow(60_000);
  const ends = stats?.weekEndsAt ?? null;
  const left = ends ? Math.max(0, ends - now) : null;
  const d = left !== null ? Math.floor(left / 86_400_000) : 0;
  const h = left !== null ? Math.floor((left % 86_400_000) / 3_600_000) : 0;
  return (
    <div className={s.season}>
      <span className={s.seasonTag}>Weekly season</span>
      <span className={s.seasonText}>3 points a win, 1 a draw. The ladder resets every Monday.</span>
      <span className={s.seasonClock}>{left !== null ? `ends in ${d}d ${h}h` : "…"}</span>
    </div>
  );
}

export function LiveStats() {
  const stats = useArena((st) => st.stats);
  const load = useArena((st) => st.loadStats);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);
  if (!stats) return null;
  return (
    <div className={s.live}>
      <span className={s.liveDot} aria-hidden />
      <span><b>{stats.online}</b> online</span>
      <span><b>{stats.queued}</b> in queue</span>
      <span><b>{stats.live}</b> live</span>
      <span><b>{stats.today}</b> today</span>
    </div>
  );
}

export function SoundToggle() {
  const [off, setOff] = useState(false);
  useEffect(() => setOff(muted()), []);
  return (
    <button
      type="button"
      className={s.sound}
      aria-pressed={!off}
      onClick={() => {
        setMuted(!off);
        setOff(!off);
        if (off) play("emote");
      }}
      title={off ? "Sound off" : "Sound on"}
    >
      {off ? "🔇 Sound off" : "🔊 Sound on"}
    </button>
  );
}
