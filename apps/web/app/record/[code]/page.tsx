import type { Metadata } from "next";
import { TopBar } from "@/components/chrome/TopBar";
import { RecordView } from "@/components/tracks/RecordView";

export const metadata: Metadata = {
  title: "Completion record — Quriosity",
  description: "A Quriosity track completion record, with a check that it has not been edited.",
};

/** /record/:code — PRD E8-S5's verification URL. */
export default async function RecordPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <RecordView code={decodeURIComponent(code)} />
    </div>
  );
}
