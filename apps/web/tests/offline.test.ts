/**
 * The offline shell.
 *
 * `public/sw.js` cannot import the curriculum — it is a plain script served at
 * the origin root, outside the bundle — so its precache list is written by
 * hand. That is exactly the kind of list that silently falls behind: add a
 * twentieth node and it is simply not there when someone opens the app on a
 * train.
 *
 * These tests read the real file and hold it to the real curriculum.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NODES } from "@/lib/curriculum/nodes";

const PUBLIC = path.resolve(__dirname, "..", "public");
const SW = readFileSync(path.join(PUBLIC, "sw.js"), "utf8");

/** The PRECACHE array, read out of the source rather than re-declared here. */
function precacheList(): string[] {
  const block = SW.match(/const PRECACHE = \[([\s\S]*?)\];/);
  if (!block) throw new Error("PRECACHE array not found in sw.js");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("the precache list", () => {
  const urls = precacheList();

  it("covers every lesson node", () => {
    for (const node of NODES) {
      expect(urls, `no offline entry for ${node.id}`).toContain(`/lesson/${node.id}`);
    }
  });

  it("does not list a lesson that no longer exists", () => {
    const ids = new Set(NODES.map((n) => n.id));
    for (const url of urls) {
      const m = url.match(/^\/lesson\/(.+)$/);
      if (m) expect(ids.has(m[1]), `${url} is precached but is not a node`).toBe(true);
    }
  });

  it("covers the surfaces the demo walks through", () => {
    for (const route of ["/", "/path", "/build", "/challenges", "/review"]) {
      expect(urls).toContain(route);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("lists only same-origin absolute paths", () => {
    for (const url of urls) expect(url.startsWith("/")).toBe(true);
  });
});

describe("what the shell refuses to cache", () => {
  it("never caches the tutor endpoint, which streams", () => {
    expect(SW).toMatch(/pathname\.startsWith\("\/api\/"\)/);
    expect(urlsBypassed()).toContain("/api/");
  });

  it("never caches lesson videos, which are several megabytes each", () => {
    expect(urlsBypassed()).toContain("/video/");
  });

  it("leaves the manifest to the browser, which fetches it without credentials", () => {
    expect(SW).toMatch(/pathname === "\/manifest\.webmanifest"\)\s*return;/);
  });

  it("never caches a redirect's destination under the address that redirected", () => {
    expect(SW).toMatch(/!fresh\.redirected/);
  });

  it("fails an uncached request like the browser would, not with an uncaught rejection", () => {
    expect(SW).not.toMatch(/throw new Error/);
    expect(SW).toMatch(/return Response\.error\(\)/);
  });

  /** Paths the fetch handler returns from without responding. */
  function urlsBypassed(): string[] {
    const handler = SW.slice(SW.indexOf('addEventListener("fetch"'));
    return [...handler.matchAll(/pathname\.startsWith\("([^"]+)"\)\)\s*return;/g)].map((m) => m[1]);
  }
});

describe("the installable manifest", () => {
  it("ships every icon the manifest and the head reference", () => {
    for (const icon of ["icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon-32.png"]) {
      expect(existsSync(path.join(PUBLIC, icon)), `missing ${icon}`).toBe(true);
    }
  });

  it("generates icons that are real PNGs", () => {
    const png = readFileSync(path.join(PUBLIC, "icon-512.png"));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR carries the dimensions, big-endian, right after the signature.
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
  });
});
