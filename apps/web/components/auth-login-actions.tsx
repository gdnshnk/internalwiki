"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthErrorCode, AuthIntent, AuthStartRequest, AuthStartResponse } from "@internalwiki/core";

const authErrorCopy: Record<AuthErrorCode, string> = {
  no_account: "No account membership found for this workspace. Use Register with a valid invite.",
  invalid_invite: "Invite code is invalid or already used. Request a new invite from an admin.",
  domain_not_allowed: "Your company email domain is not allowed for this organization.",
  invite_expired: "Invite code expired. Request a fresh invite from an admin."
};

function errorMessage(code: string | undefined): string | null {
  if (!code) {
    return null;
  }

  if (code in authErrorCopy) {
    return authErrorCopy[code as AuthErrorCode];
  }

  return "Authentication failed. Try again.";
}

export function AuthLoginActions(props: {
  nextPath: string;
  showDevBootstrap: boolean;
  canUseGoogle: boolean;
  canUseBootstrap: boolean;
  authErrorCode?: string;
  defaultIntent?: AuthIntent;
}) {
  const router = useRouter();
  const [intent, setIntent] = useState<AuthIntent>(props.defaultIntent ?? "login");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState<"google" | "bootstrap" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const derivedError = useMemo(() => errorMessage(props.authErrorCode), [props.authErrorCode]);

  async function startGoogleOAuth(): Promise<void> {
    if (busy) {
      return;
    }

    if (intent === "register" && inviteCode.trim().length < 6) {
      setError("Invite code is required for registration.");
      return;
    }

    setError(null);
    setBusy("google");
    try {
      const body: AuthStartRequest = {
        next: props.nextPath,
        intent,
        inviteCode: intent === "register" ? inviteCode.trim() : undefined
      };

      const response = await fetch("/api/auth/google/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const payload = (await response.json()) as Partial<AuthStartResponse> & { error?: string };
      if (!response.ok || !payload.authorizeUrl) {
        throw new Error(payload.error ?? `Failed to start Google OAuth (${response.status}).`);
      }

      window.location.href = payload.authorizeUrl;
    } catch (requestError) {
      setError((requestError as Error).message);
      setBusy(null);
    }
  }

  async function bootstrapLocalSession(): Promise<void> {
    if (busy) {
      return;
    }

    setError(null);
    setBusy("bootstrap");
    try {
      const response = await fetch("/api/dev/bootstrap-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          next: props.nextPath
        })
      });

      const payload = (await response.json()) as { ok?: boolean; redirectTo?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.redirectTo) {
        throw new Error(payload.error ?? `Failed to bootstrap local session (${response.status}).`);
      }

      router.push(payload.redirectTo);
      router.refresh();
    } catch (requestError) {
      setError((requestError as Error).message);
      setBusy(null);
    }
  }

  return (
    <section className="surface-card">
      <p className="workspace-header__eyebrow">Authentication</p>
      <h1 className="surface-title">Login required</h1>
      <p className="surface-sub">Sign in to access your InternalWiki assistant workspace.</p>

      <div className="auth-tabs" role="tablist" aria-label="Authentication intent">
        <button
          type="button"
          role="tab"
          aria-selected={intent === "login"}
          className={`mode-chip ${intent === "login" ? "mode-chip--active" : ""}`}
          onClick={() => setIntent("login")}
        >
          Login
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={intent === "register"}
          className={`mode-chip ${intent === "register" ? "mode-chip--active" : ""}`}
          onClick={() => setIntent("register")}
        >
          Register
        </button>
      </div>

      {intent === "register" ? (
        <div className="auth-register-box">
          <label htmlFor="invite-code" className="auth-field-label">
            Invite code
          </label>
          <input
            id="invite-code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="Enter organization invite code"
            className="auth-field-input"
          />
          <p className="surface-sub">Registration requires a valid invite and approved company email domain.</p>
        </div>
      ) : (
        <p className="surface-sub" style={{ marginTop: "0.8rem" }}>
          Login is for existing organization members with approved work email access.
        </p>
      )}

      <div className="chip-row" style={{ marginTop: "0.9rem" }}>
        <button type="button" className="ask-submit" disabled={!props.canUseGoogle || busy !== null} onClick={() => void startGoogleOAuth()}>
          {busy === "google"
            ? intent === "register"
              ? "Starting registration..."
              : "Connecting Google..."
            : intent === "register"
              ? "Register with Google"
              : "Sign in with Google"}
        </button>

        {props.showDevBootstrap ? (
          <button
            type="button"
            className="chip chip--active"
            disabled={!props.canUseBootstrap || busy !== null}
            onClick={() => void bootstrapLocalSession()}
          >
            {busy === "bootstrap" ? "Bootstrapping..." : "Bootstrap Local Session"}
          </button>
        ) : null}
      </div>

      {!props.canUseGoogle ? (
        <p className="surface-sub" style={{ marginTop: "0.8rem" }}>
          Google login is unavailable until required environment variables are configured.
        </p>
      ) : null}

      {props.showDevBootstrap && !props.canUseBootstrap ? (
        <p className="surface-sub" style={{ marginTop: "0.8rem" }}>
          Local bootstrap is unavailable until `DATABASE_URL` is configured.
        </p>
      ) : null}

      {derivedError ? <p className="error-banner">{derivedError}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
    </section>
  );
}
