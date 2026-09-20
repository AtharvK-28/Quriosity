"use client";

/**
 * The instruction beat, expanded — a video behind a disclosure on the pass
 * screen.
 *
 * Four rules this component exists to hold:
 *
 *   1. OPT-IN. Collapsed by default, never autoplaying, and never on the way
 *      into a node. A learner who ignores it has lost nothing — the node
 *      already taught the concept by making them build it.
 *   2. FREE UNTIL OPENED. `Disclosure` does not mount its children while
 *      closed, and `preload="none"` means even an opened player fetches
 *      nothing until play is pressed. A 20MB file is never pulled for someone
 *      who did not ask for it.
 *   3. THE TRANSCRIPT OUTLIVES THE VIDEO. VTTs are committed, MP4s are not, so
 *      on a fresh checkout the video fails and the transcript still reads. That
 *      is the honest fallback, not a broken player.
 *   4. ABSENT MEANS ABSENT. Ten nodes have no recording yet and two never will.
 *      This renders null for all of them — no placeholder, no "coming soon".
 */

import { useEffect, useRef, useState } from "react";
import { Button, Disclosure } from "@/components/ui/primitives";
import { track } from "@/lib/analytics";
import { NODES_BY_ID } from "@/lib/curriculum/nodes";
import {
  posterSrc,
  runtimeLabel,
  transcriptParagraphs,
  transcriptSrc,
  videoFor,
  videoSrc,
  type LessonVideo,
} from "@/lib/curriculum/media";
import s from "./VideoDisclosure.module.css";

export function VideoDisclosure({ nodeId }: { nodeId: string }) {
  const video = videoFor(nodeId);
  if (!video) return null;

  return (
    <Disclosure label={`Watch the explanation · ${runtimeLabel(video.seconds)}`}>
      <Body video={video} nodeId={nodeId} />
    </Disclosure>
  );
}

function Body({ video, nodeId }: { video: LessonVideo; nodeId: string }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [showText, setShowText] = useState(false);

  // Mounting means the disclosure was opened — Disclosure does not render
  // children while closed, so this fires once per open and never on page load.
  // The ref is what keeps it once: Strict Mode runs effects twice in
  // development, and an open rate that doubles itself is worse than no open
  // rate at all. It is per-instance, so a genuine second open still counts.
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    track("lesson_video_opened", { node_id: nodeId, video_id: video.id });
  }, [nodeId, video.id]);

  // Nodes that share this video, named rather than listed as ids.
  const alsoCovers = video.covers
    .filter((id) => id !== nodeId)
    .map((id) => NODES_BY_ID.get(id)?.title)
    .filter((t): t is string => Boolean(t));

  return (
    <div className={s.wrap}>
      {videoFailed ? (
        <p className={s.missing}>
          The video file is not on this machine. The transcript below is the
          whole of what it says.
        </p>
      ) : (
        <video
          className={s.player}
          controls
          preload="none"
          playsInline
          poster={posterSrc(video)}
          onError={() => setVideoFailed(true)}
        >
          <source src={videoSrc(video)} type="video/mp4" />
          <track
            kind="captions"
            srcLang="en"
            label="English"
            src={transcriptSrc(video)}
            default
          />
        </video>
      )}

      <div className={s.meta}>
        <span className={s.title}>{video.title}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowText((v) => !v)}
          aria-expanded={showText}
        >
          {showText ? "Hide transcript" : "Read the transcript"}
        </Button>
      </div>

      {alsoCovers.length > 0 && (
        <p className={s.alsoCovers}>
          Also covers “{alsoCovers.join("”, “")}”.
        </p>
      )}

      {showText && <Transcript video={video} />}
    </div>
  );
}

/** Fetched on demand, never with the page. */
function Transcript({ video }: { video: LessonVideo }) {
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(transcriptSrc(video))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (live) setParagraphs(transcriptParagraphs(text));
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [video]);

  if (failed) return <p className={s.missing}>The transcript could not be loaded.</p>;
  if (!paragraphs) return <p className={s.missing}>Loading the transcript…</p>;

  return (
    <div className={s.transcript}>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
