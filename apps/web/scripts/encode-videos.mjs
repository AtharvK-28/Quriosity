/**
 * Lesson videos, made small enough to ship with the site.
 *
 *   node scripts/encode-videos.mjs
 *
 * Reads the masters in `video-src/` (git-ignored — NotebookLM exports, ~20MB
 * each) and writes web copies to `public/video/`, which are committed and
 * deploy with everything else. Skips any whose web copy is newer than its
 * master, so it is safe to re-run after adding one video.
 *
 * The settings suit narrated slide explainers: H.264 at CRF 28 on the slow
 * preset keeps text and line art visually identical (SSIM ≈ 0.996 against the
 * master) at about a fifth of the size, and mono speech needs no more than
 * 48 kbps AAC. `+faststart` moves the index to the front, so playback starts
 * before the file has finished downloading.
 *
 * Needs ffmpeg on the PATH.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, "video-src");
const OUT = path.join(ROOT, "public", "video");

if (!existsSync(SRC)) {
  console.error(`No masters folder at ${SRC}. Put the original .mp4 files there.`);
  process.exit(1);
}

const masters = readdirSync(SRC).filter((f) => f.endsWith(".mp4")).sort();
if (masters.length === 0) console.log("No .mp4 masters found.");

for (const name of masters) {
  const src = path.join(SRC, name);
  const out = path.join(OUT, name);
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    console.log(`  up to date  ${name}`);
    continue;
  }
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", src,
    "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "48k", "-ac", "1",
    "-movflags", "+faststart",
    out,
  ], { stdio: "inherit" });
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
  console.log(`  encoded     ${name}  ${mb(statSync(src).size)}MB → ${mb(statSync(out).size)}MB`);
}
