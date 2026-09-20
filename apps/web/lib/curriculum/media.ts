/**
 * Lesson videos — the instruction beat, expanded.
 *
 * A video is never the way INTO a node. The authoring rules at the top of
 * `nodes.ts` put instruction after the attempt, so these play from a collapsed
 * disclosure on the pass screen and nowhere else. A learner who never opens one
 * has still been taught the concept, by building it.
 *
 * Files live in `public/video/`, named for the first node they cover. The MP4s
 * are gitignored (~20MB each) and fetched separately; the VTT transcripts are
 * small and committed, which is why a transcript stays readable on a checkout
 * with no video files at all.
 *
 * Ten of the fourteen are not recorded yet. Everything here returns null for
 * those rather than rendering a placeholder — see docs/05-Video-Production-Guide.md.
 */

export interface LessonVideo {
  /** Basename without extension, and the id of the first node it covers. */
  id: string;
  title: string;
  /** Runtime in seconds. Labels the disclosure before anything is fetched. */
  seconds: number;
  /** Nodes this video is the instruction for, in curriculum order. */
  covers: string[];
}

/** Delivered and reviewed against docs/05-Video-Production-Guide.md §5. */
export const VIDEOS: LessonVideo[] = [
  { id: "u0.n1", title: "An honest coin", seconds: 310, covers: ["u0.n1"] },
  { id: "u0.n2", title: "A lean, not an answer", seconds: 256, covers: ["u0.n2"] },
  { id: "u0.n3", title: "Where the coin analogy dies", seconds: 317, covers: ["u0.n3"] },
  { id: "u1.n1", title: "X, H, and two right answers", seconds: 346, covers: ["u1.n1", "u1.n2"] },
];

/**
 * Nodes that will never have one, and must not be "fixed" later.
 *
 * Both are unscaffolded consolidation nodes — u1.n6 opens "No hints on this
 * one" and u2.n5 opens "Everything from Unit 2, no scaffolding". Attaching an
 * explainer to either contradicts the node's own design.
 */
export const NO_VIDEO_BY_DESIGN = new Set(["u1.n6", "u2.n5"]);

const BY_NODE = new Map<string, LessonVideo>();
for (const v of VIDEOS) {
  for (const nodeId of v.covers) BY_NODE.set(nodeId, v);
}

export function videoFor(nodeId: string): LessonVideo | null {
  return BY_NODE.get(nodeId) ?? null;
}

export function videoSrc(v: LessonVideo): string {
  return `/video/${v.id}.mp4`;
}

export function transcriptSrc(v: LessonVideo): string {
  return `/video/${v.id}.vtt`;
}

/**
 * The title card, pulled from two seconds in.
 *
 * Without it `preload="none"` leaves an empty black rectangle where the player
 * is, which reads as broken rather than as unloaded. ~50KB, committed alongside
 * the transcript for the same reason: it works on a checkout with no MP4s.
 */
export function posterSrc(v: LessonVideo): string {
  return `/video/${v.id}.jpg`;
}

/** "5 min" / "45 sec". Shown on the closed disclosure, so it cannot be measured. */
export function runtimeLabel(seconds: number): string {
  return seconds < 90 ? `${Math.round(seconds)} sec` : `${Math.round(seconds / 60)} min`;
}

/**
 * WebVTT → readable paragraphs, one per cue.
 *
 * Deliberately not a general parser: no regions, no style blocks, no cue
 * settings. These files come from one generator in one shape, and the only job
 * here is to drop the header and the timing lines so the text can be read
 * rather than scrubbed. Anything before a cue's `-->` line is an identifier and
 * goes with it.
 */
export function transcriptParagraphs(vtt: string): string[] {
  return vtt
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length || lines[0].startsWith("WEBVTT") || lines[0].startsWith("NOTE")) return "";
      const timing = lines.findIndex((l) => l.includes("-->"));
      if (timing === -1) return "";
      return lines
        .slice(timing + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .trim();
    })
    .filter(Boolean);
}
