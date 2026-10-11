"use client";

/**
 * An instructor-authored challenge, played in the standard runner (PRD E8-S6).
 *
 * A static route with the id in the query, because authored challenges are
 * not known at build time: one written in this browser, or one an instructor
 * published to a class this account is in. The id is read from the URL rather
 * than `useSearchParams`, matching the lesson player.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { ChallengeRunner } from "@/components/challenge/ChallengeRunner";
import { TutorDock } from "@/components/tutor/TutorDock";
import { toChallenge, useAuthored } from "@/stores/authoredStore";
import { useClassChallenges } from "@/stores/classChallengesStore";
import { useAuth } from "@/stores/authStore";

export default function AuthoredChallengePage() {
  const { items, hydrated, hydrate } = useAuthored();
  const published = useClassChallenges();
  const authStatus = useAuth((a) => a.status);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
    setId(new URLSearchParams(window.location.search).get("id"));
  }, [hydrate]);

  const isClass = id?.startsWith("class.") ?? false;
  useEffect(() => {
    if (isClass && authStatus !== "unknown") void useClassChallenges.getState().load();
  }, [isClass, authStatus]);

  const challenge = useMemo(() => {
    const found = items.find((x) => x.id === id) ?? published.items.find((x) => x.id === id);
    return found ? toChallenge(found) : null;
  }, [items, published.items, id]);

  const waiting = !hydrated || id === null || (isClass && !challenge && (authStatus === "unknown" || published.status !== "ready" && published.status !== "failed"));

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      {waiting ? null : challenge ? (
        <>
          <ChallengeRunner challenge={challenge} authored />
          <TutorDock where={{ surface: "bench" }} />
        </>
      ) : (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "var(--s-8) clamp(16px, 3vw, 32px)" }}>
          <h1 className="statement statement--s">
            {isClass ? "That class challenge isn't open to this account." : "That challenge isn't in this browser."}
          </h1>
          <p className="prose" style={{ marginTop: "var(--s-4)" }}>
            {isClass ? (
              authStatus === "signed-in"
                ? "It may have been withdrawn, or published to a class you haven't joined. Ask your instructor for the class code."
                : <>Class challenges follow your account. <Link href="/auth/login?next=%2Fchallenges">Sign in</Link> to open it.</>
            ) : (
              "Challenges written on the instructor console stay in the browser that wrote them until they are published to a class. Write it again, or pick one from the built-in set."
            )}
          </p>
          <p style={{ marginTop: "var(--s-5)" }}>
            <Link href="/challenges">Back to challenges →</Link>
          </p>
        </main>
      )}
    </div>
  );
}
