import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "@/styles/tokens.css";
import { DEFAULT_THEME, THEME_BOOT } from "@/lib/theme";
import { ServiceWorkerBoot } from "@/components/chrome/ServiceWorkerBoot";
import { AuthBoot } from "@/components/chrome/AuthBoot";

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
  title: "Quriosity — Build a quantum circuit, and find out why it's wrong",
  description:
    "A quantum circuit workbench that teaches. Drag a gate, watch the code write itself, run it, and get told which gate is wrong and on which wire.",
  applicationName: "Quriosity",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // A link pasted into a chat or a submission form should preview as the
  // product rather than as a bare URL.
  openGraph: {
    type: "website",
    siteName: "Quriosity",
    title: "Quriosity — Build a quantum circuit, and find out why it's wrong",
    description:
      "Drag a gate, watch the Qiskit write itself, run it, and be told which gate on which wire is wrong. The simulator and the tutor run on your device.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "A Bloch sphere with a state vector on it" }],
  },
  appleWebApp: { capable: true, title: "Quriosity", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#140a2b",
};

/**
 * Night is the default and is rendered on the server. The boot script may
 * flip data-theme to day before React hydrates, which is why the attribute is
 * exempt from the hydration check.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        {children}
        <ServiceWorkerBoot />
        <AuthBoot />
      </body>
    </html>
  );
}
