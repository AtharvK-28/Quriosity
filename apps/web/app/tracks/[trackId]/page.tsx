import { notFound } from "next/navigation";
import { TopBar } from "@/components/chrome/TopBar";
import { TrackView } from "@/components/tracks/TrackView";
import { TRACKS, TRACKS_BY_ID } from "@/lib/curriculum/tracks";

export function generateStaticParams() {
  return TRACKS.map((t) => ({ trackId: t.id }));
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId } = await params;
  if (!TRACKS_BY_ID.has(trackId)) notFound();

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <TrackView trackId={trackId} />
    </div>
  );
}
