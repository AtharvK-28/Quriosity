/**
 * Which arena server the browser opens. A deployment must never fall back to
 * the visitor's own localhost — that was the Vercel bug.
 */

import { afterEach, describe, expect, it } from "vitest";
import { arenaHttpBase, arenaSocketBase, isLocalPage } from "@/lib/arena/server";

const g = globalThis as { window?: unknown };

function servedFrom(hostname: string) {
  g.window = { location: { hostname } };
}

describe("arena server", () => {
  afterEach(() => {
    delete g.window;
    delete process.env.NEXT_PUBLIC_ARENA_URL;
  });

  it("uses the deployed server on a deployed page", () => {
    servedFrom("quriosity.vercel.app");
    expect(isLocalPage()).toBe(false);
    expect(arenaSocketBase()).toBe("wss://quriosity-1.onrender.com");
    expect(arenaHttpBase()).toBe("https://quriosity-1.onrender.com");
  });

  it("uses the local server when the page is on localhost", () => {
    servedFrom("localhost");
    expect(arenaSocketBase()).toBe("ws://localhost:4000");
    expect(arenaHttpBase()).toBe("http://localhost:4000");
  });

  it("honours NEXT_PUBLIC_ARENA_URL, and ignores it when blank", () => {
    servedFrom("localhost");
    process.env.NEXT_PUBLIC_ARENA_URL = "wss://example.test/";
    expect(arenaSocketBase()).toBe("wss://example.test");
    process.env.NEXT_PUBLIC_ARENA_URL = "  ";
    expect(arenaSocketBase()).toBe("ws://localhost:4000");
  });
});
