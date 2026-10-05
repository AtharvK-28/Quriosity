"use client";

/**
 * Professional tracks — PRD E6-S6, persona P3 (Ravi).
 *
 * "Tracks show estimated hours, domain framing, and a completion record." The
 * index is for choosing: domain, time box, what you will be able to defend at
 * the end, and how far along each one you already are — because the nodes are
 * shared, work done on one track counts on the others.
 */

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/chrome/TopBar";
import { Button, Chip, Readout, Registration } from "@/components/ui/primitives";
import { NODES } from "@/lib/curriculum/nodes";
import { TRACKS, trackHours, trackProgress } from "@/lib/curriculum/tracks";
import { useSession } from "@/stores/sessionStore";
import p from "@/components/ui/page.module.css";

export default function TracksPage() {
  const router = useRouter();
  const { progress, challenges, trackId, setTrack, hydrate, hydrated } = useSession();

  useEffect(() => { hydrate(); }, [hydrate]);

  if (!hydrated) return <div className="sheet" style={{ minHeight: "100vh" }}><TopBar /></div>;

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <main className={p.main}>
        <header className={p.head}>
          <div>
            <span className="label">Tracks</span>
            <h1 className="statement statement--s" style={{ marginTop: 6, maxWidth: "24ch" }}>
              The same physics, framed for the problem on your desk.
            </h1>
          </div>
        </header>

        <p className={p.body} style={{ marginBottom: "var(--s-6)" }}>
          Every track walks the same {NODES.length} nodes, from “What a qubit is not” to
          the first quantum algorithms, and closes with capstone challenges picked for
          its domain. Work carries between them. Finish one and you get a record you
          can send to whoever asked you to evaluate this.
        </p>

        <div className={p.grid}>
          {TRACKS.map((t) => {
            const tp = trackProgress(t, progress, challenges);
            const following = trackId === t.id;
            return (
              <article key={t.id} className={`${p.panel} ${following ? p.framed : ""}`}>
                <Registration />
                <div className={p.stack}>
                  <div className={p.row} style={{ justifyContent: "space-between" }}>
                    <span className="label">{t.domain}</span>
                    {following && <Chip tone="measure" dot>following</Chip>}
                  </div>
                  <h2 className={p.sectionTitle}>{t.title}</h2>
                  <p className={p.body}>{t.pitch}</p>
                  <div className={p.row} style={{ gap: "var(--s-5)" }}>
                    <Readout value={`~${trackHours(t)}h`} label="estimated" />
                    <Readout value={`${tp.nodesPassed}/${tp.nodesTotal}`} label="nodes" />
                    <Readout value={`${tp.capstonesSolved}/${tp.capstonesTotal}`} label="capstones" tone={tp.complete ? "measure" : undefined} />
                  </div>
                  <span className={p.bar} aria-hidden>
                    <span className={p.barFill} data-done={tp.complete} style={{ width: `${Math.round(tp.fraction * 100)}%` }} />
                  </span>
                  <div className={p.row}>
                    <Button
                      variant={following ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => {
                        setTrack(t.id);
                        router.push(`/tracks/${t.id}`);
                      }}
                    >
                      {following ? "Continue" : tp.nodesPassed > 0 ? "Follow this track" : "Start"}
                    </Button>
                    {!following && (
                      <Link href={`/tracks/${t.id}`} className="label">
                        Look inside →
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
