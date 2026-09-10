import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "@/styles/tokens.css";

/**
 * Three faces, three jobs, no overlap.
 *
 * Instrument Serif carries conceptual statements and nothing else — if a string
 * is not a claim about physics, it is not set in the serif. Space Grotesk is
 * every piece of interface. JetBrains Mono is reserved for things that are
 * literally notation: gates, kets, readouts, axis ticks.
 */
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

const sans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quriosity — build a quantum circuit, and find out why it's wrong",
  description:
    "A quantum circuit workbench that teaches. Drag a gate, watch the code write itself, run it, and get told which gate is wrong and on which wire.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e3ded1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
