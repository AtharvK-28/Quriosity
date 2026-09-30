"use client";

/**
 * A rank, drawn. A hexagonal frame in the tier's colour with the division as
 * orbiting dots — one for III, two for II, three for I — and a Bloch-sphere
 * core, because a rank here is still a quantum one.
 */

import type { Rank } from "@/lib/arena/tiers";
import s from "./TierBadge.module.css";

export function TierBadge({ rank, size = 56, title }: { rank: Rank; size?: number; title?: string }) {
  const dots = rank.division === "I" ? 3 : rank.division === "II" ? 2 : rank.division === "III" ? 1 : 0;
  return (
    <span className={s.badge} data-tier={rank.tier.id} style={{ width: size, height: size }} title={title ?? rank.label} role="img" aria-label={rank.label}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <polygon className={s.frame} points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" />
        <polygon className={s.inner} points="32,10 51,21 51,43 32,54 13,43 13,21" />
        <ellipse className={s.orbit} cx="32" cy="32" rx="13" ry="5" />
        <line className={s.axis} x1="32" y1="19" x2="32" y2="45" />
        <circle className={s.core} cx="32" cy="32" r="4.5" />
        {Array.from({ length: dots }, (_, i) => {
          const a = (-90 + (i - (dots - 1) / 2) * 34) * (Math.PI / 180);
          return <circle key={i} className={s.dot} cx={32 + 19 * Math.cos(a)} cy={32 + 19 * Math.sin(a)} r="2.6" />;
        })}
        {rank.tier.id === "quantum" && <circle className={s.halo} cx="32" cy="32" r="24" />}
      </svg>
    </span>
  );
}
