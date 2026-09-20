/**
 * The lesson-video manifest, and the transcript parser.
 *
 * The manifest is hand-maintained data pointing at files that are gitignored,
 * which is exactly the shape of thing that drifts without anyone noticing. The
 * checks here are the ones that would otherwise be caught by a learner: a
 * `covers` entry naming a node that does not exist, two videos claiming the
 * same node, or a video attached to one of the two nodes that must never have
 * one.
 *
 * The transcript files ARE committed, so they can be parsed for real rather
 * than against a fixture.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NODES, NODES_BY_ID } from "@/lib/curriculum/nodes";
import {
  NO_VIDEO_BY_DESIGN,
  VIDEOS,
  posterSrc,
  runtimeLabel,
  transcriptParagraphs,
  transcriptSrc,
  videoFor,
} from "@/lib/curriculum/media";

const PUBLIC = path.resolve(__dirname, "..", "public");

describe("the video manifest", () => {
  it("only covers nodes that exist", () => {
    for (const v of VIDEOS) {
      for (const nodeId of v.covers) {
        expect(NODES_BY_ID.has(nodeId), `${v.id} covers unknown node ${nodeId}`).toBe(true);
      }
    }
  });

  it("is named for the first node it covers", () => {
    for (const v of VIDEOS) expect(v.id).toBe(v.covers[0]);
  });

  it("never covers the same node twice", () => {
    const seen = new Set<string>();
    for (const v of VIDEOS) {
      for (const nodeId of v.covers) {
        expect(seen.has(nodeId), `${nodeId} is covered by two videos`).toBe(false);
        seen.add(nodeId);
      }
    }
  });

  it("covers nodes in curriculum order within one video", () => {
    const ordinal = (id: string) => NODES.findIndex((n) => n.id === id);
    for (const v of VIDEOS) {
      const positions = v.covers.map(ordinal);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("leaves the two unscaffolded consolidation nodes alone", () => {
    // u1.n6 is "No hints on this one"; u2.n5 is "no scaffolding". A video on
    // either contradicts the node's own design — see media.ts.
    for (const nodeId of NO_VIDEO_BY_DESIGN) {
      expect(NODES_BY_ID.has(nodeId)).toBe(true);
      expect(videoFor(nodeId)).toBeNull();
    }
  });

  it("resolves a shared video from every node it covers", () => {
    const shared = VIDEOS.find((v) => v.covers.length > 1);
    expect(shared, "expected at least one video covering two nodes").toBeDefined();
    for (const nodeId of shared!.covers) {
      expect(videoFor(nodeId)?.id).toBe(shared!.id);
    }
  });

  it("has a committed transcript and poster for every entry", () => {
    // MP4s are gitignored; VTTs and posters are not, and are what makes a fresh
    // checkout still able to show the content and not look broken.
    for (const v of VIDEOS) {
      expect(existsSync(path.join(PUBLIC, transcriptSrc(v))), `missing transcript for ${v.id}`).toBe(true);
      expect(existsSync(path.join(PUBLIC, posterSrc(v))), `missing poster for ${v.id}`).toBe(true);
    }
  });
});

describe("runtimeLabel", () => {
  it("reads in seconds below ninety and minutes above", () => {
    expect(runtimeLabel(45)).toBe("45 sec");
    expect(runtimeLabel(89)).toBe("89 sec");
    expect(runtimeLabel(90)).toBe("2 min");
    expect(runtimeLabel(310)).toBe("5 min");
  });
});

describe("the transcript parser", () => {
  it("drops the header and the timing lines", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00.000 --> 00:04.000",
      "A fair coin is unpredictable.",
      "",
      "00:04.000 --> 00:09.000",
      "And completely lawful.",
    ].join("\n");
    expect(transcriptParagraphs(vtt)).toEqual([
      "A fair coin is unpredictable.",
      "And completely lawful.",
    ]);
  });

  it("joins a cue that wraps across lines", () => {
    const vtt = "WEBVTT\n\n00:00.000 --> 00:04.000\nProbability is the\nsquare of the amplitude.";
    expect(transcriptParagraphs(vtt)).toEqual(["Probability is the square of the amplitude."]);
  });

  it("discards a cue identifier sitting above the timing line", () => {
    const vtt = "WEBVTT\n\ncue-7\n00:00.000 --> 00:04.000\nThe text.";
    expect(transcriptParagraphs(vtt)).toEqual(["The text."]);
  });

  it("strips inline tags and skips NOTE blocks", () => {
    const vtt = "WEBVTT\n\nNOTE generated\n\n00:00.000 --> 00:04.000\n<v Narrator>An <b>even</b> lean.";
    expect(transcriptParagraphs(vtt)).toEqual(["An even lean."]);
  });

  it("survives CRLF line endings and trailing blank lines", () => {
    const vtt = "WEBVTT\r\n\r\n00:00.000 --> 00:04.000\r\nOne cue.\r\n\r\n\r\n";
    expect(transcriptParagraphs(vtt)).toEqual(["One cue."]);
  });

  it("returns nothing for an empty or header-only file", () => {
    expect(transcriptParagraphs("")).toEqual([]);
    expect(transcriptParagraphs("WEBVTT\n")).toEqual([]);
  });

  it("parses every committed transcript into readable prose", () => {
    for (const v of VIDEOS) {
      const raw = readFileSync(path.join(PUBLIC, transcriptSrc(v)), "utf8");
      const paragraphs = transcriptParagraphs(raw);
      expect(paragraphs.length, `${v.id} parsed to nothing`).toBeGreaterThan(3);
      for (const p of paragraphs) {
        expect(p).not.toContain("-->");
        expect(p).not.toContain("WEBVTT");
        expect(p.trim()).not.toBe("");
      }
    }
  });
});
