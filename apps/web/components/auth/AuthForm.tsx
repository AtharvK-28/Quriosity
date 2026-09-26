"use client";

/**
 * Sign in and sign up — PRD E1-S1, /auth/{login,signup}.
 *
 * One short form, and a promise it keeps: anything done as a guest in this
 * browser comes with you into the account. The sync engine merges it on
 * sign-in; nothing here has to ask.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/chrome/TopBar";
import { Button, Input, Registration } from "@/components/ui/primitives";
import { ApiError, useAuth } from "@/stores/authStore";
import s from "./AuthForm.module.css";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { status, login, signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [teaching, setTeaching] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/path");

  // Where to go afterwards. Read from the URL rather than useSearchParams so
  // the page stays static; only same-site paths are honoured.
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNext(n);
  }, []);

  useEffect(() => {
    if (status === "signed-in") router.replace(next);
  }, [status, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await signup({ email: email.trim(), password, displayName: name.trim(), instructorCode: teaching ? code.trim() : undefined });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 0
            ? "Can't reach the server right now. It may be waking up — try again in a minute."
            : err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const signingUp = mode === "signup";

  return (
    <div className="sheet" style={{ minHeight: "100vh" }}>
      <TopBar />
      <main className={s.main}>
        <form className={s.card} onSubmit={submit} noValidate>
          <Registration />
          <span className="label">{signingUp ? "Create an account" : "Sign in"}</span>
          <h1 className={`statement statement--s ${s.title}`}>
            {signingUp ? "Keep your progress everywhere." : "Welcome back."}
          </h1>

          {signingUp && (
            <label className={s.field}>
              <span className="label">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" required />
            </label>
          )}
          <label className={s.field}>
            <span className="label">Email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className={s.field}>
            <span className="label">Password</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signingUp ? "new-password" : "current-password"}
              minLength={signingUp ? 8 : undefined}
              required
            />
            {signingUp && <span className={s.hint}>At least 8 characters.</span>}
          </label>

          {signingUp && (
            <div className={s.teach}>
              <label className={s.check}>
                <input type="checkbox" checked={teaching} onChange={(e) => setTeaching(e.target.checked)} />
                <span>I&apos;m an instructor</span>
              </label>
              {teaching && (
                <label className={s.field}>
                  <span className="label">Instructor code</span>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
                  <span className={s.hint}>From whoever runs Quriosity at your institution.</span>
                </label>
              )}
            </div>
          )}

          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}

          <Button variant="primary" size="lg" type="submit" disabled={busy}>
            {busy ? "One moment…" : signingUp ? "Create account" : "Sign in"}
          </Button>

          <p className={s.switch}>
            {signingUp ? (
              <>Already have one? <Link href={`/auth/login?next=${encodeURIComponent(next)}`}>Sign in</Link></>
            ) : (
              <>New here? <Link href={`/auth/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></>
            )}
          </p>
          <p className={s.note}>
            Progress you made as a guest in this browser comes with you.
          </p>
        </form>
      </main>
    </div>
  );
}
