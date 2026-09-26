"use client";

/**
 * Who is signed in, and the one function that talks to the account API.
 *
 * TRD §13.4: the access token is held in memory only — never localStorage —
 * and lasts 15 minutes. The refresh token is an httpOnly cookie the page
 * cannot read at all. A reload therefore starts with no access token and
 * trades the cookie for a new one.
 *
 * Guests are first-class. Nothing on the path, the bench or the challenges
 * needs an account; signing in adds sync, cohorts and the ranked arena. So a
 * guest's page load makes no API call at all — a small flag remembers whether
 * there is a session worth refreshing, and the offline demo stays offline.
 */

import { create } from "zustand";

export type Role = "student" | "instructor" | "admin";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export type AuthStatus = "unknown" | "guest" | "signed-in";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = "/api/server";
/** Not a credential: only "is a refresh worth attempting on load". */
const HINT = "quriosity.signed-in";

let token: string | null = null;
let refreshing: Promise<boolean> | null = null;

function setHint(on: boolean) {
  try {
    if (on) window.localStorage.setItem(HINT, "1");
    else window.localStorage.removeItem(HINT);
  } catch {
    /* storage blocked: every load will simply try the refresh */
  }
}

function hinted(): boolean {
  try {
    return window.localStorage.getItem(HINT) === "1";
  } catch {
    return true;
  }
}

async function raw(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.auth !== false && token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Your work in this browser is safe.");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, typeof body.error === "string" ? body.error : `Request failed (${res.status}).`);
  return body;
}

/** Trades the refresh cookie for an access token. One at a time. */
function refresh(): Promise<boolean> {
  refreshing ??= raw("/auth/refresh", { method: "POST", auth: false })
    .then((body) => {
      token = String(body.accessToken);
      useAuth.setState({ status: "signed-in", user: body.user as User });
      return true;
    })
    .catch((e) => {
      // Offline is not signed out: keep the hint so the next load retries.
      if (!(e instanceof ApiError && e.status === 0)) {
        token = null;
        setHint(false);
      }
      useAuth.setState({ status: "guest", user: null });
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Calls the API as the signed-in user, refreshing once if the token lapsed. */
export async function api<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  try {
    return (await raw(path, init)) as T;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await refresh())) return (await raw(path, init)) as T;
    throw e;
  }
}

/** For the arena socket, which cannot send a header. */
export async function freshToken(): Promise<string | null> {
  if (!token && !(await refresh())) return null;
  return token;
}

interface AuthState {
  status: AuthStatus;
  user: User | null;
  boot(): void;
  signup(input: { email: string; password: string; displayName: string; instructorCode?: string }): Promise<User>;
  login(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  deleteAccount(password: string): Promise<void>;
}

let booted = false;

export const useAuth = create<AuthState>((set) => {
  async function start(body: Record<string, unknown>): Promise<User> {
    token = String(body.accessToken);
    const user = body.user as User;
    setHint(true);
    set({ status: "signed-in", user });
    return user;
  }

  return {
    status: "unknown",
    user: null,

    boot() {
      if (booted) return;
      booted = true;
      if (hinted()) void refresh();
      else set({ status: "guest" });
    },

    async signup(input) {
      return start(await raw("/auth/signup", { method: "POST", body: input, auth: false }));
    },

    async login(email, password) {
      return start(await raw("/auth/login", { method: "POST", body: { email, password }, auth: false }));
    },

    async logout() {
      await raw("/auth/logout", { method: "POST", auth: false }).catch(() => {});
      token = null;
      setHint(false);
      set({ status: "guest", user: null });
    },

    async deleteAccount(password) {
      await api("/me", { method: "DELETE", body: { password } });
      token = null;
      setHint(false);
      set({ status: "guest", user: null });
    },
  };
});
