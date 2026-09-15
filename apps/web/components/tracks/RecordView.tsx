"use client";

/**
 * A completion record, as the person it was sent to sees it — PRD E8-S5.
 *
 * The verdict comes first and says exactly what was checked. "Intact" means
 * the record matches its checksum; it does not mean anyone verified who did
 * the work, and the page says that in the same breath rather than in small
 * print, because a manager deciding what to believe deserves to know.
 */

import Link from "next/link";
import { useMemo } from "react";
import { Registration } from "@/components/ui/primitives";
import { readRecord } from "@/lib/curriculum/record";
import { trackHours } from "@/lib/curriculum/tracks";
import { CHALLENGES_BY_ID } from "@/lib/curriculum/challenges";
import { NODES_BY_ID, UNITS } from "@/lib/curriculum/nodes";
import p from "@/components/ui/page.module.css";
import s from "./RecordView.module.css";

export function RecordView({ code }: { code: string }) {
  const reading = useMemo(() => readRecord(code), [code]);

  if (reading.status === "unreadable") {
    return (
      <main className={`${p.main} ${p.narrow}`}>
        <h1 className="statement statement--s">This isn&apos;t a readable record.</h1>
        <p className={p.body} style={{ marginTop: "var(--s-4)" }}>
          The link may have been cut short when it was copied. Ask for it again.
        </p>
      </main>
    );
  }

  const { record } = reading;
  const track = reading.track;
  const intact = reading.status === "intact";
  // Formatted by hand: this renders on the server and in the browser, and a
  // locale-dependent date would differ between the two.
  const [year, month, day] = record.issued.split("-").map((x) => parseInt(x, 10));
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const issuedText = MONTHS[month - 1] ? `${day} ${MONTHS[month - 1]} ${year}` : record.issued;

  return (
    <main className={`${p.main} ${p.narrow}`}>
      <div className={intact ? p.good : p.bad} role="status" style={{ marginBottom: "var(--s-5)" }}>
        <span className="label" style={{ color: intact ? "var(--measure)" : "var(--error)" }}>
          {intact ? "Intact" : "Altered"}
        </span>
        <p style={{ marginTop: 4 }}>
          {intact
            ? "This record matches its checksum: nothing on it has been edited since it was issued."
            : "This record does not match its checksum. Something on it was changed after it was issued, so treat every line below as unverified."}
        </p>
      </div>

      <article className={`${p.panel} ${p.framed} ${s.record}`}>
        <Registration />
        <span className="label">Quriosity · track completion</span>
        <h1 className={s.name}>{record.name}</h1>
        <p className={s.line}>
          completed the <b>{track?.title ?? record.track}</b> track
          {track && <> ({track.domain.toLowerCase()})</>}, recorded on{" "}
          {issuedText}.
        </p>

        {track && <p className={s.outcome}>{track.outcome}</p>}

        <div className={s.facts}>
          <span><b>{record.nodes.length}</b> nodes</span>
          <span><b>{record.capstones.length}</b> capstones</span>
          <span><b>{record.firstTry}%</b> right first time</span>
          {track && <span><b>~{trackHours(track)}h</b> estimated</span>}
        </div>

        <h2 className="label" style={{ marginTop: "var(--s-5)", display: "block" }}>Nodes</h2>
        <ol className={s.nodes}>
          {record.nodes.map((id) => {
            const node = NODES_BY_ID.get(id);
            const unit = node ? UNITS.find((u) => u.id === node.unitId) : null;
            return (
              <li key={id}>
                <span className={p.mono}>{unit ? `U${unit.ordinal}` : ""}</span> {node?.title ?? id}
              </li>
            );
          })}
        </ol>

        <h2 className="label" style={{ marginTop: "var(--s-4)", display: "block" }}>Capstones</h2>
        <ul className={s.nodes}>
          {record.capstones.map((id) => (
            <li key={id}>{CHALLENGES_BY_ID.get(id)?.title ?? id}</li>
          ))}
        </ul>
      </article>

      <p className={p.muted} style={{ marginTop: "var(--s-5)" }}>
        What this checks, and what it can&apos;t: the record carries its own contents and a
        checksum over them, so editing any line breaks the match. It is not signed by a
        server and it is not tied to an account, so it cannot prove who did the work.
        Every node on it is graded on the state a circuit produces, never on multiple choice.{" "}
        <Link href="/tracks">See the tracks →</Link>
      </p>
    </main>
  );
}
