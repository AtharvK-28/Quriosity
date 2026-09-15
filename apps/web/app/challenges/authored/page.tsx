"use client";

/**
 * An instructor-authored challenge, played in the standard runner (PRD E8-S6).
 *
 * A static route with the id in the query, because authored challenges exist
 * only in this browser and cannot be generated at build time. The id is read
 * from the URL rather than `useSearchParams`, matching the lesson player.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { ChallengeRunner } from "@/components/challenge/ChallengeRunner";
import { TutorDock } from "@/components/tutor/TutorDock";
import { toChallenge, useAuthored } from "@/stores/authoredStore";

export default function AuthoredChallengePage() {
  const { items, hydrated, hydrate } = useAuthored();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
    setId(new URLSearchParams(window.location.search).get("id"));
  }, [hydrate]);

  const challenge = useMemo(() => {
    const found = items.find((x) => x.id === id);
    return found ? toChallenge(found) : null;
  }, [items, id]);

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      {!hydrated || id === null ? null : challenge ? (
        <>
          <ChallengeRunner challenge={challenge} authored />
          <TutorDock where={{ surface: "bench" }} />
        </>
      ) : (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "var(--s-8) clamp(16px, 3vw, 32px)" }}>
          <h1 className="statement statement--s">That challenge isn&apos;t in this browser.</h1>
          <p className="prose" style={{ marginTop: "var(--s-4)" }}>
            Authored challenges live where they were written until there is a server
            to share them from. Write it again on the instructor console, or pick one
            from the built-in set.
          </p>
          <p style={{ marginTop: "var(--s-5)" }}>
            <Link href="/challenges">Back to challenges →</Link>
          </p>
        </main>
      )}
    </div>
  );
}
