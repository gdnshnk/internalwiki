"use client";

import { useState, type FormEvent } from "react";

type FormState =
  | { status: "idle"; message?: string }
  | { status: "submitting"; message?: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function WaitlistForm(props: { sourcePage: string }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state.status === "submitting") {
      return;
    }

    setState({ status: "submitting" });
    try {
      const response = await fetch("/api/marketing/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          company,
          role: role || undefined,
          sourcePage: props.sourcePage,
          website
        })
      });

      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setState({ status: "error", message: payload.error ?? "Unable to join waitlist." });
        return;
      }

      setEmail("");
      setCompany("");
      setRole("");
      setWebsite("");
      setState({ status: "success", message: payload.message ?? "Thanks, you are on the beta list." });
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  return (
    <form className="waitlist-form" onSubmit={(event) => void submit(event)}>
      <label>
        Work email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          required
        />
      </label>
      <label>
        Company
        <input
          type="text"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          placeholder="Company name"
          required
        />
      </label>
      <label>
        Role (optional)
        <input
          type="text"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="Ops, Product, Security..."
        />
      </label>
      <label className="sr-only" aria-hidden>
        Leave blank
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </label>
      <button type="submit" className="ask-submit" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? "Submitting..." : "Join beta waitlist"}
      </button>
      {state.status === "success" ? <p className="waitlist-form__ok">{state.message}</p> : null}
      {state.status === "error" ? <p className="error-banner">{state.message}</p> : null}
    </form>
  );
}
