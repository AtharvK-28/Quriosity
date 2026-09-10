import { notFound } from "next/navigation";
import { TopBar } from "@/components/chrome/TopBar";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { TutorDock } from "@/components/tutor/TutorDock";
import { NODES, NODES_BY_ID } from "@/lib/curriculum/nodes";

export function generateStaticParams() {
  return NODES.map((n) => ({ nodeId: n.id }));
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ nodeId: string }>;
}) {
  const { nodeId } = await params;
  const node = NODES_BY_ID.get(nodeId);
  if (!node) notFound();

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <LessonPlayer node={node} />
      <TutorDock where={{ surface: "lesson", nodeId }} />
    </div>
  );
}
