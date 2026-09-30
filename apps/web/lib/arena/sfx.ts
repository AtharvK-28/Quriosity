/**
 * Arena sound — synthesised, not sampled.
 *
 * A game without sound feels like a form. These are a handful of short tones
 * built with the Web Audio API on the spot, so there are no files to download
 * and nothing to license. Every sound is short, quiet, and off with one click
 * (remembered per browser). Nothing plays until the player has pressed
 * something — browsers require that, and it is right that they do.
 */

export type Sfx =
  | "tick" | "go" | "match" | "run" | "submit" | "miss" | "oppMiss" | "oppRun"
  | "emote" | "win" | "lose" | "draw" | "rankUp" | "badge";

const MUTE_KEY = "quriosity.arena.mute";
let ctx: AudioContext | null = null;

export function muted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(MUTE_KEY, "1");
    else window.localStorage.removeItem(MUTE_KEY);
  } catch {
    /* this page only */
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One tone: a frequency (or a glide), a shape, a length, a volume. */
function tone(
  a: AudioContext,
  at: number,
  { f, to, dur, type = "sine", vol = 0.08 }: { f: number; to?: number; dur: number; type?: OscillatorType; vol?: number },
) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** A little arpeggio: notes in Hz, spaced `gap` seconds apart. */
function arp(a: AudioContext, t: number, notes: number[], gap: number, opts: { type?: OscillatorType; dur?: number; vol?: number } = {}) {
  notes.forEach((f, i) => tone(a, t + i * gap, { f, dur: opts.dur ?? 0.18, type: opts.type ?? "triangle", vol: opts.vol ?? 0.07 }));
}

export function play(sound: Sfx): void {
  if (muted()) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.01;
  switch (sound) {
    case "tick": return tone(a, t, { f: 660, dur: 0.09, type: "square", vol: 0.035 });
    case "go": return arp(a, t, [523, 784, 1047], 0.06, { type: "square", vol: 0.05, dur: 0.16 });
    case "match": return arp(a, t, [392, 523, 659, 784], 0.07, { vol: 0.06 });
    case "run": return tone(a, t, { f: 420, to: 640, dur: 0.12, type: "sine", vol: 0.05 });
    case "submit": return tone(a, t, { f: 300, to: 900, dur: 0.18, type: "triangle", vol: 0.06 });
    case "miss": return tone(a, t, { f: 220, to: 110, dur: 0.28, type: "sawtooth", vol: 0.045 });
    case "oppMiss": return arp(a, t, [880, 660], 0.07, { type: "sine", vol: 0.04, dur: 0.1 });
    case "oppRun": return tone(a, t, { f: 520, dur: 0.05, type: "sine", vol: 0.02 });
    case "emote": return tone(a, t, { f: 880, to: 1320, dur: 0.1, type: "sine", vol: 0.04 });
    case "win": return arp(a, t, [523, 659, 784, 1047, 1319], 0.09, { vol: 0.08, dur: 0.3 });
    case "lose": return arp(a, t, [392, 349, 311, 262], 0.14, { type: "sine", vol: 0.06, dur: 0.32 });
    case "draw": return arp(a, t, [440, 440, 523], 0.12, { vol: 0.05 });
    case "rankUp": return arp(a, t, [523, 659, 784, 1047, 1319, 1568], 0.07, { type: "square", vol: 0.05, dur: 0.22 });
    case "badge": return arp(a, t, [988, 1319], 0.08, { vol: 0.06, dur: 0.25 });
  }
}
