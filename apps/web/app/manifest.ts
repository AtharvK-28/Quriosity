import type { MetadataRoute } from "next";

/**
 * The install manifest.
 *
 * Quriosity is installable because it is genuinely offline-capable, not as a
 * badge: there is no backend, the simulator and the tutor's rule engine run on
 * the device, fonts are self-hosted by `next/font`, and nothing in the app
 * requests anything outside the origin. `public/sw.js` is what makes a reload
 * survive; this is what lets it be installed and launched like an app.
 *
 * That matters for where this is meant to be used — a lab or a classroom whose
 * connectivity is not something the lesson should depend on.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quriosity — quantum circuit workbench",
    short_name: "Quriosity",
    description:
      "Build a quantum circuit, run it, and be told which gate on which wire is wrong. The simulator and the tutor run on your device.",
    start_url: "/path",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#140a2b",
    theme_color: "#140a2b",
    categories: ["education", "science"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Drawn inside the safe zone, so a launcher may crop it to a circle.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Your path", url: "/path" },
      { name: "The bench", url: "/build" },
      { name: "Review", url: "/review" },
    ],
  };
}
