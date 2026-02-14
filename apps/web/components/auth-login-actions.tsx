"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuthErrorCode, AuthIntent, AuthStartRequest, AuthStartResponse } from "@internalwiki/core";

const authErrorCopy: Record<AuthErrorCode, string> = {
  no_account: "No account membership found for this workspace. Register a new workspace account or ask your admin for an invite.",
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
  canUsePassword: boolean;
  canUseBootstrap: boolean;
  authErrorCode?: string;
  defaultIntent?: AuthIntent;
}) {
  const router = useRouter();
  const [intent, setIntent] = useState<AuthIntent>(props.defaultIntent ?? "login");
  const [inviteCode, setInviteCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "bootstrap" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const derivedError = useMemo(() => errorMessage(props.authErrorCode), [props.authErrorCode]);

  async function startGoogleOAuth(): Promise<void> {
    if (busy) {
      return;
    }

    if (intent === "register" && inviteCode.trim().length > 0 && inviteCode.trim().length < 6) {
      setError("Invite code must be at least 6 characters when provided.");
      return;
    }

    setError(null);
    setBusy("google");
    try {
      const body: AuthStartRequest = {
        next: props.nextPath,
        intent,
        inviteCode: intent === "register" && inviteCode.trim().length >= 6 ? inviteCode.trim() : undefined
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

  async function submitPasswordAuth(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) {
      return;
    }

    if (!props.canUsePassword) {
      setError("Email/password login is unavailable until DATABASE_URL is configured.");
      return;
    }

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    if (intent === "register") {
      if (!firstName.trim() || !lastName.trim()) {
        setError("First and last name are required.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Password confirmation does not match.");
        return;
      }
    }

    setError(null);
    setBusy("password");
    try {
      const endpoint = intent === "register" ? "/api/auth/password/register" : "/api/auth/password/login";
      const body =
        intent === "register"
          ? {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim(),
              password,
              confirmPassword,
              next: props.nextPath
            }
          : {
              email: email.trim(),
              password,
              next: props.nextPath
            };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const payload = (await response.json()) as { ok?: boolean; redirectTo?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.redirectTo) {
        throw new Error(payload.error ?? `Authentication failed (${response.status}).`);
      }

      router.push(payload.redirectTo);
      router.refresh();
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
      <p className="surface-sub">
        Sign in to access your InternalWiki assistant workspace. If you were redirected from `/app`, the app is
        running; sign in or bootstrap a local session.
      </p>

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

      <form className="auth-register-box" onSubmit={(event) => void submitPasswordAuth(event)}>
        {intent === "register" ? (
          <div className="auth-field-row">
            <div>
              <label htmlFor="first-name" className="auth-field-label">
                First Name
              </label>
              <input
                id="first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First name"
                className="auth-field-input"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label htmlFor="last-name" className="auth-field-label">
                Last Name
              </label>
              <input
                id="last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last name"
                className="auth-field-input"
                autoComplete="family-name"
              />
            </div>
          </div>
        ) : null}

        <label htmlFor="work-email" className="auth-field-label">
          Work Email
        </label>
        <input
          id="work-email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          className="auth-field-input"
          type="email"
          autoComplete="email"
        />

        <label htmlFor="auth-password" className="auth-field-label">
          Password
        </label>
        <input
          id="auth-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={intent === "register" ? "Create password" : "Enter password"}
          className="auth-field-input"
          type="password"
          autoComplete={intent === "register" ? "new-password" : "current-password"}
        />

        {intent === "register" ? (
          <>
            <label htmlFor="confirm-password" className="auth-field-label">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              className="auth-field-input"
              type="password"
              autoComplete="new-password"
            />
          </>
        ) : (
          <a href="/contact" className="auth-secondary-link">
            Forgot your password?
          </a>
        )}

        <button type="submit" className="ask-submit" disabled={!props.canUsePassword || busy !== null}>
          {busy === "password"
            ? intent === "register"
              ? "Creating account..."
              : "Signing in..."
            : intent === "register"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      {intent === "register" ? (
        <div className="auth-register-box" style={{ marginTop: "0.8rem" }}>
          <label htmlFor="invite-code" className="auth-field-label">
            Invite code (optional)
          </label>
          <input
            id="invite-code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="Use this when joining an existing workspace"
            className="auth-field-input"
          />
        </div>
      ) : null}

      <p className="auth-divider">or</p>

      <div className="chip-row">
        <button type="button" className="ask-submit" disabled={!props.canUseGoogle || busy !== null} onClick={() => void startGoogleOAuth()}>
          {busy === "google"
            ? intent === "register"
              ? "Starting registration..."
              : "Connecting Google..."
            : intent === "register"
              ? "Sign up with Google"
              : "Sign in with Google"}
        </button>
      </div>

      {props.showDevBootstrap ? (
        <div className="chip-row" style={{ marginTop: "0.5rem" }}>
          <button
            type="button"
            className="chip chip--active"
            disabled={!props.canUseBootstrap || busy !== null}
            onClick={() => void bootstrapLocalSession()}
          >
            {busy === "bootstrap" ? "Bootstrapping..." : "Bootstrap Local Session"}
          </button>
        </div>
      ) : null}

      {!props.canUseGoogle ? (
        <p className="surface-sub" style={{ marginTop: "0.8rem" }}>
          Google login is unavailable until required environment variables are configured.
        </p>
      ) : null}

      {!props.canUsePassword ? (
        <p className="surface-sub" style={{ marginTop: "0.8rem" }}>
          Email/password login is unavailable until `DATABASE_URL` is configured.
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
