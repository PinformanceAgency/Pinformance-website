"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import type { WorkspaceIssue } from "@/hooks/use-org";

/**
 * What to show when `useOrg()` came back without an org or a user.
 *
 * The case worth naming is `no_profile`: the magic link worked, the session is
 * real, and there is simply no row in `public.users` for this account — which
 * happens whenever the login is sent before the invite exists, because the
 * profile is only ever created from a pending `org_invites` row (the signup
 * trigger and /auth/callback both key on it). Every screen then renders as if
 * the app were broken, and nothing anywhere says the account was never linked.
 *
 * The retry button posts to /api/auth/setup-profile, which is exactly the step
 * that was missed: once an agency admin has added the invite, the person in
 * front of the screen can finish it themselves without a fresh magic link.
 */
export function WorkspaceIssueNotice({
  issue,
  authEmail,
}: {
  issue: WorkspaceIssue;
  authEmail: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/auth/setup-profile", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
      };
      if (res.ok && (body.status === "created" || body.status === "already_exists")) {
        window.location.reload();
        return;
      }
      setResult(
        body.error ||
          "There is still no invite for this address. Ask an agency admin to add it first."
      );
    } catch {
      setResult("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (issue === "no_profile") {
    return (
      <Frame title="This account is not linked to a workspace yet">
        <p>
          You are signed in
          {authEmail ? (
            <>
              {" "}
              as <span className="font-medium text-foreground">{authEmail}</span>
            </>
          ) : null}
          , so the login link itself worked. What is missing is the invite that
          puts your account in an organisation — without it there is no
          workspace to load.
        </p>
        <p>
          An agency admin adds it under{" "}
          <span className="font-medium text-foreground">Settings → Team → Invite</span>{" "}
          with this exact email address. Once they have, press the button below;
          you do not need a new login link.
        </p>
        <button
          onClick={retry}
          disabled={busy}
          className="mt-1 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {busy ? "Checking…" : "Finish setup"}
        </button>
        {result ? <p className="text-xs">{result}</p> : null}
      </Frame>
    );
  }

  if (issue === "no_org") {
    return (
      <Frame title="Your workspace could not be opened">
        <p>
          Your account is linked to an organisation that could not be read. That
          is an agency-side problem, not something you can fix from here — send
          this screen to an agency admin.
        </p>
      </Frame>
    );
  }

  if (issue === "not_authenticated") {
    return (
      <Frame title="You are not signed in">
        <p>
          The session has expired.{" "}
          <a href="/login" className="underline">
            Sign in again
          </a>
          .
        </p>
      </Frame>
    );
  }

  return (
    <Frame title="Unable to load your workspace">
      <p>Reload the page; if it keeps happening, send this screen to an agency admin.</p>
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex max-w-lg flex-col gap-3 rounded-xl border bg-card p-6">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground [&_p]:leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}
