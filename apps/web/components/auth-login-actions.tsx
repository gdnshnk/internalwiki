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
  const panelTitle = intent === "login" ? "Sign in to InternalWiki" : "Create your workspace account";
  const panelSubtitle =
    intent === "login"
      ? "Use your work email and password, or continue with Google SSO."
      : "Create a secure account using your company email, then connect your sources.";

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
    <section className="auth-shell">
      <aside className="auth-shell__intro">
        <p className="auth-shell__eyebrow">Authentication</p>
        <h1 className="auth-shell__title">Secure, permission-aware access</h1>
        <p className="auth-shell__subtitle">
          InternalWiki signs in with work identity, enforces organization boundaries, and returns citation-backed
          summaries from approved sources.
        </p>

        <div className="auth-status-grid" aria-label="Authentication method status">
          <div className="auth-status-pill">
            <span>Password auth</span>
            <strong>{props.canUsePassword ? "Ready" : "Setup required"}</strong>
          </div>
          <div className="auth-status-pill">
            <span>Google SSO</span>
            <strong>{props.canUseGoogle ? "Ready" : "Optional setup"}</strong>
          </div>
        </div>

        <ul className="auth-feature-list">
          <li>Work-email only account creation.</li>
          <li>Session controls and organization policy enforcement.</li>
          <li>Permission-aware retrieval and citation verification.</li>
        </ul>
      </aside>

      <div className="auth-shell__panel">
        <header className="auth-panel-header">
          <h2>{panelTitle}</h2>
          <p>{panelSubtitle}</p>
        </header>

        <div className="auth-intent-toggle" role="tablist" aria-label="Authentication intent">
          <button
            type="button"
            role="tab"
            aria-selected={intent === "login"}
            className={`auth-intent-toggle__button ${intent === "login" ? "is-active" : ""}`}
            onClick={() => setIntent("login")}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={intent === "register"}
            className={`auth-intent-toggle__button ${intent === "register" ? "is-active" : ""}`}
            onClick={() => setIntent("register")}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={(event) => void submitPasswordAuth(event)}>
          {intent === "register" ? (
            <div className="auth-field-row">
              <div>
                <label htmlFor="first-name" className="auth-field-label">
                  First name
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
                  Last name
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
            Work email
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
                Confirm password
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

          <button type="submit" className="auth-primary-button" disabled={!props.canUsePassword || busy !== null}>
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
          <div className="auth-form auth-form--subtle">
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

        <div className="auth-divider" role="separator" aria-label="Alternative sign in">
          <span>or continue with</span>
        </div>

        <button
          type="button"
          className="auth-oauth-button"
          disabled={!props.canUseGoogle || busy !== null}
          onClick={() => void startGoogleOAuth()}
        >
          {busy === "google"
            ? intent === "register"
              ? "Starting registration..."
              : "Connecting Google..."
            : intent === "register"
              ? "Sign up with Google"
              : "Sign in with Google"}
        </button>

        {props.showDevBootstrap ? (
          <button
            type="button"
            className="auth-dev-button"
            disabled={!props.canUseBootstrap || busy !== null}
            onClick={() => void bootstrapLocalSession()}
          >
            {busy === "bootstrap" ? "Bootstrapping..." : "Bootstrap local session"}
          </button>
        ) : null}

        {!props.canUseGoogle ? <p className="auth-config-note">Google login is unavailable until OAuth env vars are configured.</p> : null}
        {!props.canUsePassword ? <p className="auth-config-note">Email/password login is unavailable until `DATABASE_URL` is configured.</p> : null}
        {props.showDevBootstrap && !props.canUseBootstrap ? (
          <p className="auth-config-note">Local bootstrap is unavailable until `DATABASE_URL` is configured.</p>
        ) : null}

        {derivedError ? <p className="error-banner">{derivedError}</p> : null}
        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </section>
  );
}
