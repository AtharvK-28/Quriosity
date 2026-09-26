"use client";

/**
 * Keeping this browser and the account in step.
 *
 * On sign-in: pull the account's copy, merge it with this browser's (see
 * merge.ts — progress only moves forward, so nothing is lost either way), and
 * push the result. From then on, follow the stores and push what changes, a
 * moment after it changes.
 *
 * The browser copy stays the working copy. The simulator, the grader and the
 * path never wait on the network, and a push that fails is retried on the next
 * change — losing the server costs sync, never work.
 *
 * On sign-out the account's data leaves this browser. It is safe on the
 * server, and the next person at a lab machine should not inherit it.
 */

import { api, useAuth } from "@/stores/authStore";
import { sessionDoc, useSession } from "@/stores/sessionStore";
import { useLibrary, type SavedCircuit } from "@/stores/libraryStore";
import { mergeSession, type SessionDoc } from "./merge";

const PUSH_DELAY_MS = 1500;

let running: (() => void) | null = null;

export function startSyncEngine(): void {
  let wasSignedIn = useAuth.getState().status === "signed-in";
  if (wasSignedIn) void begin();

  useAuth.subscribe((s) => {
    const signedIn = s.status === "signed-in";
    if (signedIn && !wasSignedIn) void begin();
    if (!signedIn && wasSignedIn) end(s.status === "guest");
    wasSignedIn = signedIn;
  });
}

async function begin() {
  running?.();
  const user = useAuth.getState().user;
  if (!user) return;

  useSession.getState().hydrate();
  useLibrary.getState().hydrate();

  const stops: Array<() => void> = [];
  running = () => stops.forEach((f) => f());

  try {
    stops.push(await syncSession(user.displayName));
    stops.push(await syncLibrary());
  } catch {
    // Offline or the server is asleep. The browser copy carries on; the next
    // sign-in (or reload) tries again.
  }
}

function end(signedOut: boolean) {
  running?.();
  running = null;
  if (!signedOut) return;
  try {
    window.localStorage.removeItem("quriosity.session.v1");
    window.localStorage.removeItem("quriosity.library.v1");
  } catch {
    /* nothing to clear */
  }
  useSession.getState().reset();
  useSession.getState().setDisplayName("you");
  useLibrary.getState().replaceAll([]);
}

/* -- Progress --------------------------------------------------------------- */

async function syncSession(accountName: string): Promise<() => void> {
  const remote = await api<{ doc: SessionDoc | null }>("/me/documents/session");
  const merged = mergeSession(sessionDoc(useSession.getState()), remote.doc);
  if (merged.displayName === "you") merged.displayName = accountName;
  useSession.getState().applyDoc(merged);

  let pushed = JSON.stringify(merged);
  await api("/me/documents/session", { method: "PUT", body: { doc: merged } });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = useSession.subscribe((s) => {
    if (!s.hydrated) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const doc = sessionDoc(useSession.getState());
      const json = JSON.stringify(doc);
      if (json === pushed) return;
      api("/me/documents/session", { method: "PUT", body: { doc } })
        .then(() => {
          pushed = json;
        })
        .catch(() => {
          /* retried on the next change */
        });
    }, PUSH_DELAY_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

/* -- Saved circuits ------------------------------------------------------------- */

const putCircuit = (c: SavedCircuit) =>
  api(`/me/circuits/${encodeURIComponent(c.id)}`, {
    method: "PUT",
    body: { name: c.name, circuit: c.circuit, savedAt: c.savedAt, updatedAt: c.updatedAt },
  });

async function syncLibrary(): Promise<() => void> {
  const remote = (await api<{ items: SavedCircuit[] }>("/me/circuits")).items;
  const local = useLibrary.getState().items;

  // Union by id; where both have one, the more recently edited wins.
  const byId = new Map<string, SavedCircuit>();
  for (const c of remote) byId.set(c.id, c);
  const toPush: SavedCircuit[] = [];
  for (const c of local) {
    const theirs = byId.get(c.id);
    if (!theirs || c.updatedAt > theirs.updatedAt) {
      byId.set(c.id, c);
      toPush.push(c);
    }
  }
  const merged = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  useLibrary.getState().replaceAll(merged);
  await Promise.all(toPush.map(putCircuit));

  // What the server holds now, by id → updatedAt.
  const synced = new Map(merged.map((c) => [c.id, c.updatedAt]));

  const unsubscribe = useLibrary.subscribe((s) => {
    const items = s.items;
    const ids = new Set(items.map((c) => c.id));
    for (const c of items) {
      if (synced.get(c.id) === c.updatedAt) continue;
      synced.set(c.id, c.updatedAt);
      putCircuit(c).catch(() => synced.delete(c.id));
    }
    for (const id of [...synced.keys()]) {
      if (ids.has(id)) continue;
      synced.delete(id);
      api(`/me/circuits/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
  });

  return unsubscribe;
}
