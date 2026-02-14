"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type OnboardingProgress = {
  connected: boolean;
  synced: boolean;
  askedFirstQuestion: boolean;
};

export function AppOnboardingChecklist(props: {
  forced: boolean;
  initialCompleted: boolean;
  progress: OnboardingProgress;
}) {
  const [completed, setCompleted] = useState(props.initialCompleted);
  const [attemptedCompletion, setAttemptedCompletion] = useState(props.initialCompleted);
  const [completionError, setCompletionError] = useState<string | null>(null);

  const steps = useMemo(
    () => [
      {
        id: "connect",
        title: "Connect your first source",
        description: "Add Google Workspace, Slack, or Microsoft 365 so InternalWiki can ingest trusted company knowledge.",
        done: props.progress.connected,
        href: "/app/settings/connectors",
        cta: "Open connectors"
      },
      {
        id: "sync",
        title: "Run your first sync",
        description: "Index documents so answers can include citations, confidence, and source traceability.",
        done: props.progress.synced,
        href: "/app/settings/connectors",
        cta: "Run sync setup"
      },
      {
        id: "ask",
        title: "Ask your first question",
        description: "Use Ask mode to test retrieval and confirm evidence-backed responses in your workspace.",
        done: props.progress.askedFirstQuestion,
        href: "/app/chat",
        cta: "Open assistant"
      }
    ],
    [props.progress.askedFirstQuestion, props.progress.connected, props.progress.synced]
  );

  const allStepsComplete = props.progress.connected && props.progress.synced && props.progress.askedFirstQuestion;
  const shouldRender = props.forced || (!completed && !allStepsComplete);

  useEffect(() => {
    setCompleted(props.initialCompleted);
    setAttemptedCompletion(props.initialCompleted);
  }, [props.initialCompleted]);

  useEffect(() => {
    let cancelled = false;

    async function completeOnboarding(): Promise<void> {
      setAttemptedCompletion(true);
      setCompletionError(null);
      try {
        const response = await fetch("/api/onboarding/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        });

        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          completed?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? `Failed to complete onboarding (${response.status}).`);
        }

        if (!cancelled) {
          setCompleted(Boolean(payload.completed));
        }
      } catch (error) {
        if (!cancelled) {
          setCompletionError((error as Error).message);
        }
      }
    }

    if (!completed && allStepsComplete && !attemptedCompletion) {
      void completeOnboarding();
    }

    return () => {
      cancelled = true;
    };
  }, [allStepsComplete, attemptedCompletion, completed]);

  if (!shouldRender) {
    return null;
  }

  return (
    <section className="surface-card">
      <p className="workspace-header__eyebrow">Getting started</p>
      <h2 className="surface-title">
        {completed ? "Onboarding completed" : "Set up InternalWiki in three steps"}
      </h2>
      <p className="surface-sub">
        InternalWiki connects your workspace tools, indexes docs, and answers with evidence. If you were redirected
        to login before `/app`, authentication is working as expected and this checklist guides first-time setup.
      </p>

      <ol className="onboarding-list">
        {steps.map((step) => (
          <li key={step.id} className="onboarding-step">
            <div>
              <p className="onboarding-step__title">{step.title}</p>
              <p className="onboarding-step__sub">{step.description}</p>
            </div>

            {step.done ? (
              <span className="data-pill">Done</span>
            ) : (
              <Link href={step.href} className="chip chip--active">
                {step.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>

      {completionError ? <p className="error-banner">{completionError}</p> : null}
    </section>
  );
}
