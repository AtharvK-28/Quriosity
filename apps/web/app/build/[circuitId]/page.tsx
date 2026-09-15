import type { Metadata } from "next";
import { TopBar } from "@/components/chrome/TopBar";
import { SharedCircuit } from "@/components/share/SharedCircuit";

export const metadata: Metadata = {
  title: "A shared circuit — Quriosity",
  description: "A quantum circuit shared by link. Open it, run it, and fork it into your own workbench.",
};

/**
 * /build/:circuitId — PRD E11-S2. The id is the circuit itself, encoded, so
 * the page needs nothing but the URL to open it.
 */
export default async function SharedCircuitPage({
  params,
}: {
  params: Promise<{ circuitId: string }>;
}) {
  const { circuitId } = await params;
  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <SharedCircuit code={circuitId} />
    </div>
  );
}
