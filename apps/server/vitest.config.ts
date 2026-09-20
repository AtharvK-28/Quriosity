import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    // The same mapping tsconfig.json gives tsx. Vite resolves imports itself
    // and does not read tsconfig paths, so it has to be stated twice — the
    // alternative is the server silently failing to import the curriculum only
    // under test, which is the worst place to find out.
    alias: { "@": path.resolve(__dirname, "../web") },
  },
});
