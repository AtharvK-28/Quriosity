"use client";

/**
 * The account, in Settings: who you are, which classes you are in, and the
 * two irreversible things — signing out of this browser, and deleting the
 * account (PRD E1-S7), which asks for the password rather than a checkbox.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Chip, Input } from "@/components/ui/primitives";
import { api, ApiError, useAuth } from "@/stores/authStore";
import p from "@/components/ui/page.module.css";

interface CohortSummary {
  id: string;
  name: string;
  members: number;
  role: "instructor" | "member";
  joinCode?: string;
}

const message = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong.");

export function AccountPanel() {
  const { status, user, logout, deleteAccount } = useAuth();
  const [cohorts, setCohorts] = useState<CohortSummary[] | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ cohorts: CohortSummary[] }>("/cohorts")
      .then((r) => setCohorts(r.cohorts))
      .catch(() => setCohorts([]));
  }, []);

  useEffect(() => {
    if (status === "signed-in") load();
  }, [status, load]);

  if (status === "unknown") return <div className={p.panel}><p className={p.muted}>Checking your session…</p></div>;

  if (status === "guest" || !user) {
    return (
      <div className={`${p.panel} ${p.stack}`}>
        <p className={p.body}>
          You&apos;re using Quriosity as a guest. Everything works; your progress just lives in
          this browser. An account keeps it on every device, lets you join a class, and opens
          ranked matches in the arena.
        </p>
        <div className={p.row}>
          <Link href="/auth/signup?next=/settings"><Button variant="primary" size="sm">Create an account</Button></Link>
          <Link href="/auth/login?next=/settings"><Button variant="ghost" size="sm">Sign in</Button></Link>
        </div>
      </div>
    );
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    try {
      const r = await api<{ cohort: { name: string } }>("/cohorts/join", { method: "POST", body: { code } });
      setNote(`Joined ${r.cohort.name}.`);
      setCode("");
      load();
    } catch (err) {
      setNote(message(err));
    }
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await deleteAccount(password);
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <div className={`${p.panel} ${p.stack}`}>
      <div className={p.row} style={{ justifyContent: "space-between" }}>
        <div>
          <p className={p.body} style={{ color: "var(--ink)" }}>{user.displayName}</p>
          <p className={p.mono}>{user.email}</p>
        </div>
        <div className={p.row}>
          <Chip>{user.role}</Chip>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>Sign out</Button>
        </div>
      </div>
      <p className={p.muted}>
        Progress and saved circuits sync to this account. Signing out removes them from this
        browser; they stay safe in the account.
      </p>

      <div className={p.stack} style={{ borderTop: "1px solid var(--rule)", paddingTop: "var(--s-4)" }}>
        <span className="label">Classes</span>
        {cohorts && cohorts.length > 0 ? (
          <ul className={p.list}>
            {cohorts.map((c) => (
              <li key={c.id} className={p.listRow}>
                <span>{c.name}</span>
                <span className={p.mono}>
                  {c.role === "instructor" ? `you teach · ${c.members} students · code ${c.joinCode}` : "member"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={p.muted}>{cohorts ? "Not in a class yet." : "Loading…"}</p>
        )}
        <form className={p.row} onSubmit={join}>
          <label className={p.field} style={{ minWidth: "min(100%, 220px)" }}>
            <span className="label">Join with a code</span>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="ABC234" />
          </label>
          <Button variant="secondary" size="sm" type="submit" disabled={!code.trim()} style={{ alignSelf: "flex-end" }}>
            Join
          </Button>
        </form>
        {note && <p className={p.muted} role="status">{note}</p>}
        {(user.role === "instructor" || user.role === "admin") && (
          <p className={p.muted}>
            Create a class and see its progress in the <Link href="/teach" style={{ color: "var(--ink)" }}>instructor console</Link>.
          </p>
        )}
      </div>

      <div className={p.stack} style={{ borderTop: "1px solid var(--rule)", paddingTop: "var(--s-4)" }}>
        {!deleting ? (
          <div>
            <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>Delete account</Button>
          </div>
        ) : (
          <form className={p.stack} onSubmit={remove}>
            <p className={p.body}>
              This deletes the account, its synced progress, saved circuits and class
              memberships. Arena matches stay on the ladder as &ldquo;Deleted player&rdquo;, so
              your opponents&apos; ratings still add up. It can&apos;t be undone.
            </p>
            <label className={p.field} style={{ maxWidth: 320 }}>
              <span className="label">Your password, to confirm</span>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
            {error && <p className={p.bad} role="alert">{error}</p>}
            <div className={p.row}>
              <Button variant="danger" size="sm" type="submit" disabled={!password}>Delete it</Button>
              <Button variant="ghost" size="sm" onClick={() => { setDeleting(false); setPassword(""); setError(null); }}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
