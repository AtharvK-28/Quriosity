"use client";

/**
 * The challenge index — PRD E8.
 *
 * Goal G4 is "make repetition voluntary": eight attempts per learner per week,
 * without a daily quota nagging anyone into it. That only works if the index
 * itself is appetising, so every card previews the shape it is asking for. You
 * pick a challenge by recognising the histogram, not by reading a title.
 *
 * A challenge opens when the node that teaches it has been passed. Locked cards
 * stay visible and name what opens them — the shape of what is coming is worth
 * seeing, and a hidden feature teaches nothing.
 */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/chrome/TopBar";
import { Chip, Readout } from "@/components/ui/primitives";
import {
  CHALLENGES, DIFFICULTY_COPY, KIND_COPY, challengesByKind,
  type Challenge, type ChallengeKind,
} from "@/lib/curriculum/challenges";
import { NODES, NODES_BY_ID, challengeOpen, useSession } from "@/stores/sessionStore";
import { targetProbabilities } from "@/lib/grade/fidelity";
import { toChallenge, useAuthored } from "@/stores/authoredStore";
import { useClassChallenges } from "@/stores/classChallengesStore";
import { useAuth } from "@/stores/authStore";
import s from "./challenges.module.css";

const ORDER: ChallengeKind[] = ["reach", "golf", "bughunt"];

export default function ChallengesPage() {
  const router = useRouter();
  const { progress, challenges, hydrate, hydrated } = useSession();
  const authored = useAuthored((st) => st.items);
  const published = useClassChallenges((st) => st.items);
  const authStatus = useAuth((a) => a.status);

  useEffect(() => { hydrate(); useAuthored.getState().hydrate(); }, [hydrate]);

  const authoredChallenges = useMemo(() => authored.map(toChallenge), [authored]);
  const classChallenges = useMemo(() => published.map((c) => ({ challenge: toChallenge(c), cohort: c.cohort })), [published]);
  useEffect(() => {
    if (authStatus !== "unknown") void useClassChallenges.getState().load();
  }, [authStatus]);

  const solved = useMemo(
    () => CHALLENGES.filter((c) => challenges[c.id]?.solved).length,
    [challenges],
  );
  const open = useMemo(
    () => CHALLENGES.filter((c) => challengeOpen(progress, c.unlockAfter)).length,
    [progress],
  );

  /**
   * The node that opens the first challenge.
   *
   * With nothing passed, every card on this page is locked and the screen
   * offers no way off it — the one empty state in the app that did not name an
   * action, which Design Doc §14 asks of all of them.
   */
  const firstUnlock = useMemo(() => {
    const order = new Map(NODES.map((n, i) => [n.id, i]));
    const next = CHALLENGES
      .filter((c) => !challengeOpen(progress, c.unlockAfter))
      .sort((a, b) => (order.get(a.unlockAfter) ?? 0) - (order.get(b.unlockAfter) ?? 0))[0];
    return next ? NODES_BY_ID.get(next.unlockAfter) ?? null : null;
  }, [progress]);

  if (!hydrated) {
    return <div className="sheet" style={{ minHeight: "100vh" }}><TopBar /></div>;
  }

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />

      <main className={s.main}>
        <header className={s.head}>
          <div>
            <span className="label">Challenges</span>
            <h1 className="statement statement--s" style={{ marginTop: 6, maxWidth: "22ch" }}>
              {solved === 0
                ? "Practice, with more than one right answer."
                : `${solved} of ${CHALLENGES.length} solved.`}
            </h1>
          </div>
          <div className={s.stats}>
            <Readout value={solved} label="solved" tone={solved > 0 ? "measure" : undefined} />
            <Readout value={open} label="open" />
            <Readout value={CHALLENGES.length} label="total" />
          </div>
        </header>

        <p className={`prose ${s.intro}`}>
          Every one of these is graded on the state you produce, never on the gates
          you used — so there is always more than one way through, and finding a
          second one is worth as much as finding the first.
        </p>

        {open === 0 && firstUnlock && (
          <p className={s.nothingOpen}>
            Nothing is open yet — a challenge unlocks with the node that teaches
            it. The first one opens after{" "}
            <Link href={`/lesson/${firstUnlock.id}`}>“{firstUnlock.title}”</Link>,
            which is about {firstUnlock.estMinutes} minutes.
          </p>
        )}

        {ORDER.map((kind) => {
          const list = challengesByKind(kind);
          if (list.length === 0) return null;
          return (
            <section key={kind} className={s.section}>
              <div className={s.sectionHead}>
                <h2 className={s.sectionTitle}>{KIND_COPY[kind].label}</h2>
                <span className={s.sectionBlurb}>{KIND_COPY[kind].blurb}</span>
              </div>

              <div className={s.grid}>
                {list.map((c) => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    locked={!challengeOpen(progress, c.unlockAfter)}
                    solvedGates={challenges[c.id]?.bestGates ?? null}
                    attempts={challenges[c.id]?.attempts ?? 0}
                    onOpen={() => router.push(`/challenges/${c.id}`)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {classChallenges.length > 0 && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>From your classes</h2>
              <span className={s.sectionBlurb}>
                Published by your instructors. Graded the same way; not counted on your record.
              </span>
            </div>
            <div className={s.grid}>
              {classChallenges.map(({ challenge: c, cohort }) => (
                <ChallengeCard
                  key={c.id}
                  challenge={{ ...c, brief: `${c.brief} · ${cohort}` }}
                  locked={false}
                  solvedGates={challenges[c.id]?.bestGates ?? null}
                  attempts={challenges[c.id]?.attempts ?? 0}
                  onOpen={() => router.push(`/challenges/authored?id=${encodeURIComponent(c.id)}`)}
                />
              ))}
            </div>
          </section>
        )}

        {authoredChallenges.length > 0 && (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Authored here</h2>
              <span className={s.sectionBlurb}>
                Written on the instructor console in this browser. Graded the same way; not counted on your record.
              </span>
            </div>
            <div className={s.grid}>
              {authoredChallenges.map((c) => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  locked={false}
                  solvedGates={null}
                  attempts={0}
                  onOpen={() => router.push(`/challenges/authored?id=${encodeURIComponent(c.id)}`)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ChallengeCard({
  challenge,
  locked,
  solvedGates,
  attempts,
  onOpen,
}: {
  challenge: Challenge;
  locked: boolean;
  solvedGates: number | null;
  attempts: number;
  onOpen(): void;
}) {
  const unlockNode = NODES_BY_ID.get(challenge.unlockAfter);
  const solved = solvedGates !== null;

  return (
    <button
      type="button"
      className={s.card}
      data-kind={challenge.kind}
      data-locked={locked}
      data-solved={solved}
      disabled={locked}
      onClick={onOpen}
      aria-label={
        locked
          ? `${challenge.title}, locked — finish ${unlockNode?.title ?? "an earlier node"} first`
          : `${challenge.title}. ${challenge.brief}`
      }
    >
      <div className={s.cardTop}>
        <span className="label">{DIFFICULTY_COPY[challenge.difficulty]}</span>
        <span className={s.dots} aria-hidden>
          {[1, 2, 3].map((d) => (
            <span key={d} className={s.dot} data-on={d <= challenge.difficulty} />
          ))}
        </span>
      </div>

      {/* The target shape in miniature — the card is chosen by recognition. */}
      <TargetSpark challenge={challenge} />

      <h3 className={s.cardTitle}>{challenge.title}</h3>
      <p className={s.cardBrief}>{challenge.brief}</p>

      <div className={s.cardFoot}>
        {locked ? (
          <span>Opens after “{unlockNode?.title ?? challenge.unlockAfter}”</span>
        ) : solved ? (
          <>
            <b>Solved</b>
            <span>
              {solvedGates} gate{solvedGates === 1 ? "" : "s"}
              {challenge.kind === "golf" && ` · par ${challenge.par}`}
            </span>
          </>
        ) : (
          <>
            <span>{challenge.qubits} qubit{challenge.qubits === 1 ? "" : "s"}</span>
            <span>par {challenge.par}</span>
            {attempts > 0 && <span>{attempts} tried</span>}
          </>
        )}
      </div>
    </button>
  );
}

/** A histogram small enough to read at a glance and no smaller. */
function TargetSpark({ challenge }: { challenge: Challenge }) {
  const probs = useMemo(() => targetProbabilities(challenge.target), [challenge]);
  const bars = Array.from(probs);
  const max = Math.max(...bars, 1e-9);

  return (
    <div className={s.spark} aria-hidden>
      {bars.map((p, i) => (
        <span
          key={i}
          className={s.sparkBar}
          data-zero={p < 1e-9}
          style={{ height: `${Math.max(2, (p / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
