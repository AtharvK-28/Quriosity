"use client";

/**
 * One track — PRD E6-S6 and E8-S5.
 *
 * Each unit leads with why it matters in the domain, then the nodes that teach
 * it. The capstones close the track, and the completion record opens only when
 * every node and every capstone is done: a record for "most of it" proves
 * nothing to anyone.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Chip, Input, Readout, Registration } from "@/components/ui/primitives";
import { TRACKS_BY_ID, capstoneChallenges, trackHours, trackProgress } from "@/lib/curriculum/tracks";
import { buildRecord, encodeRecord } from "@/lib/curriculum/record";
import { KIND_COPY } from "@/lib/curriculum/challenges";
import {
  NODES_BY_ID, UNITS, challengeOpen, currentNodeId, nodesInUnit, unitProgress, useSession,
} from "@/stores/sessionStore";
import p from "@/components/ui/page.module.css";
import s from "./TrackView.module.css";

export function TrackView({ trackId }: { trackId: string }) {
  const track = TRACKS_BY_ID.get(trackId)!;
  const router = useRouter();
  const { progress, challenges, displayName, setDisplayName, trackId: following, setTrack, hydrate, hydrated } = useSession();
  const [name, setName] = useState("");
  const [recordUrl, setRecordUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    if (hydrated) setName(displayName === "you" ? "" : displayName);
  }, [hydrated, displayName]);

  const tp = useMemo(() => trackProgress(track, progress, challenges), [track, progress, challenges]);
  const capstones = capstoneChallenges(track);
  const next = currentNodeId(progress);
  const nextNode = next ? NODES_BY_ID.get(next) : null;
  const nextCapstone = capstones.find((c) => challengeOpen(progress, c.unlockAfter) && !challenges[c.id]?.solved);

  if (!hydrated) return null;

  function issue() {
    const clean = name.trim();
    if (clean) setDisplayName(clean);
    const code = encodeRecord(buildRecord(track, clean, progress));
    setRecordUrl(`${window.location.origin}/record/${code}`);
  }

  async function copy() {
    if (!recordUrl) return;
    try {
      await navigator.clipboard.writeText(recordUrl);
      setCopied(true);
    } catch { /* the link is selectable */ }
  }

  const remaining = tp.nodesTotal - tp.nodesPassed + tp.capstonesTotal - tp.capstonesSolved;

  return (
    <main className={p.main}>
      <nav style={{ marginBottom: "var(--s-4)" }}>
        <Link href="/tracks" className="label">← Tracks</Link>
      </nav>

      <header className={p.head}>
        <div>
          <span className="label">{track.domain}</span>
          <h1 className="statement statement--s" style={{ marginTop: 6 }}>{track.title}</h1>
          <p className={p.body} style={{ marginTop: "var(--s-3)" }}>{track.pitch}</p>
        </div>
        <div className={p.stats}>
          <Readout value={`~${trackHours(track)}h`} label="estimated" />
          <Readout value={`${Math.round(tp.fraction * 100)}%`} label="done" tone={tp.complete ? "measure" : undefined} />
        </div>
      </header>

      <div className={`${p.panel} ${p.framed}`} style={{ marginBottom: "var(--s-6)" }}>
        <Registration />
        <span className="label">By the end you can</span>
        <p className={s.outcome}>{track.outcome}</p>
        <div className={p.row} style={{ marginTop: "var(--s-4)" }}>
          {!tp.complete && nextNode && (
            <Button variant="primary" size="sm" onClick={() => router.push(`/lesson/${nextNode.id}`)}>
              Next: {nextNode.title}
            </Button>
          )}
          {!tp.complete && !nextNode && nextCapstone && (
            <Button variant="primary" size="sm" onClick={() => router.push(`/challenges/${nextCapstone.id}`)}>
              Capstone: {nextCapstone.title}
            </Button>
          )}
          {following !== track.id && (
            <Button variant="secondary" size="sm" onClick={() => setTrack(track.id)}>Follow this track</Button>
          )}
          {following === track.id && <Chip tone="measure" dot>following</Chip>}
        </div>
      </div>

      {track.units.map((tu) => {
        const unit = UNITS.find((u) => u.id === tu.unitId)!;
        const nodes = nodesInUnit(unit.id);
        const up = unitProgress(progress, unit.id);
        const minutes = nodes.reduce((sum, n) => sum + n.estMinutes, 0);
        return (
          <section key={unit.id} className={p.section}>
            <div className={p.sectionHead}>
              <h2 className={p.sectionTitle}>Unit {unit.ordinal} · {unit.title}</h2>
              <span className={p.mono}>{up.passed} of {up.total} · about {minutes} min</span>
            </div>
            <p className={s.framing}>{tu.framing}</p>
            <ol className={s.nodes}>
              {nodes.map((n) => {
                const state = progress[n.id]?.state ?? "locked";
                return (
                  <li key={n.id} className={s.node} data-state={state}>
                    <span className={s.mark} aria-hidden>{state === "passed" ? "✓" : state === "locked" ? "○" : "●"}</span>
                    {state === "locked" ? (
                      <span className={s.nodeTitle}>{n.title}</span>
                    ) : (
                      <Link href={`/lesson/${n.id}`} className={s.nodeTitle}>{n.title}</Link>
                    )}
                    <span className={p.mono}>{state === "passed" ? "done" : state === "locked" ? "locked" : `${n.estMinutes} min`}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      <section className={p.section}>
        <div className={p.sectionHead}>
          <h2 className={p.sectionTitle}>Capstones</h2>
          <span className={p.mono}>{tp.capstonesSolved} of {tp.capstonesTotal} solved</span>
        </div>
        <div className={p.grid}>
          {capstones.map((c) => {
            const open = challengeOpen(progress, c.unlockAfter);
            const solved = challenges[c.id]?.solved;
            return (
              <div key={c.id} className={p.panel}>
                <div className={p.stack}>
                  <div className={p.row} style={{ justifyContent: "space-between" }}>
                    <span className="label">{KIND_COPY[c.kind].label}</span>
                    {solved ? <Chip tone="measure" dot>solved</Chip> : !open && <Chip>locked</Chip>}
                  </div>
                  <h3 className={s.capTitle}>{c.title}</h3>
                  <p className={p.muted}>{c.brief}</p>
                  {open ? (
                    <Link href={`/challenges/${c.id}`} className="label">{solved ? "Play again →" : "Open →"}</Link>
                  ) : (
                    <span className={p.mono}>Opens after “{NODES_BY_ID.get(c.unlockAfter)?.title}”</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={p.section}>
        <div className={p.sectionHead}>
          <h2 className={p.sectionTitle}>Completion record</h2>
        </div>
        {!tp.complete ? (
          <p className={p.muted}>
            The record opens when every node and every capstone on this track is done.
            {remaining > 0 && ` ${remaining} to go.`} It lists the track, the date and each node, with a link that shows whether it has been edited.
          </p>
        ) : (
          <div className={`${p.panel} ${p.stack}`}>
            <p className={p.body}>
              Every node and capstone is done. Put a name on the record and send the
              link to whoever asked for it.
            </p>
            <form className={p.row} onSubmit={(e) => { e.preventDefault(); issue(); }}>
              <label className={p.field} style={{ minWidth: "min(100%, 280px)" }}>
                <span className="label">Name on the record</span>
                <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="As your manager knows you" />
              </label>
              <Button variant="primary" size="sm" type="submit" style={{ alignSelf: "flex-end" }}>Issue the record</Button>
            </form>
            {recordUrl && (
              <div className={p.good} role="status">
                <p style={{ overflowWrap: "anywhere" }}>
                  <Link href={recordUrl.replace(window.location.origin, "")}>{recordUrl}</Link>
                </p>
                <div className={p.row} style={{ marginTop: "var(--s-2)" }}>
                  <Button variant="ghost" size="sm" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</Button>
                </div>
              </div>
            )}
            <p className={p.muted}>
              The link checks that the record hasn&apos;t been edited since it was issued.
              It can&apos;t prove who earned it — there are no accounts yet — and the
              record page says so.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
