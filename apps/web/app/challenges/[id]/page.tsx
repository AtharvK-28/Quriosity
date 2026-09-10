import { notFound } from "next/navigation";
import { TopBar } from "@/components/chrome/TopBar";
import { ChallengeRunner } from "@/components/challenge/ChallengeRunner";
import { CHALLENGES, CHALLENGES_BY_ID } from "@/lib/curriculum/challenges";

export function generateStaticParams() {
  return CHALLENGES.map((c) => ({ id: c.id }));
}

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const challenge = CHALLENGES_BY_ID.get(id);
  if (!challenge) notFound();

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <ChallengeRunner challenge={challenge} />
    </div>
  );
}
