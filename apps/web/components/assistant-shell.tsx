"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ChatThreadSummary } from "@internalwiki/core";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/app", label: "Assistant" },
  { href: "/app/knowledge", label: "Knowledge" },
  { href: "/app/chat", label: "Conversations" },
  { href: "/app/review", label: "Reviews" }
];

export function AssistantShell(props: { children: ReactNode; recentThreads: ChatThreadSummary[] }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSettingsOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent): void {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (settingsMenuRef.current?.contains(target) || settingsButtonRef.current?.contains(target)) {
        return;
      }

      setSettingsOpen(false);
    }

    function onDocumentKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, []);

  async function logout(): Promise<void> {
    setSettingsOpen(false);
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    }).catch(() => undefined);

    window.location.href = "/auth/login";
  }

  return (
    <div className="assistant-frame">
      <button type="button" className="rail-toggle" onClick={() => setMobileNavOpen(true)}>
        Menu
      </button>

      <button
        type="button"
        aria-label="Close menu"
        className={`rail-overlay ${mobileNavOpen ? "rail-overlay--open" : ""}`}
        onClick={() => {
          setMobileNavOpen(false);
          setSettingsOpen(false);
        }}
      />

      <aside className={`assistant-rail ${mobileNavOpen ? "assistant-rail--open" : ""}`} aria-label="Primary navigation">
        <div className="assistant-rail__top">
          <Link href="/app" className="brand-mark" onClick={() => setMobileNavOpen(false)}>
            <img src="/logo-mark.svg" alt="InternalWiki" className="brand-logo" />
            <span className="sr-only">InternalWiki</span>
          </Link>
        </div>

        <nav className="rail-nav">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rail-nav__item ${active ? "rail-nav__item--active" : ""}`}
                onClick={() => {
                  setMobileNavOpen(false);
                  setSettingsOpen(false);
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="thread-list" aria-label="Recent threads">
          <p className="thread-list__title">Recent</p>
          {props.recentThreads.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.78rem" }}>No recent threads yet</p>
          ) : (
            props.recentThreads.map((thread) => (
              <Link
                key={thread.id}
                href={`/app/chat?thread=${encodeURIComponent(thread.id)}`}
                className="thread-list__item"
                onClick={() => {
                  setMobileNavOpen(false);
                  setSettingsOpen(false);
                }}
              >
                {thread.title}
              </Link>
            ))
          )}
        </div>
      </aside>

      <div className="assistant-content">
        <div className="assistant-content__topbar">
          <div className="assistant-settings">
            <button
              ref={settingsButtonRef}
              type="button"
              className="settings-trigger"
              aria-label="Open settings menu"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="settings-trigger__icon">
                <path
                  d="M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Zm8.01 3.14-1.32-.76a6.98 6.98 0 0 0-.39-.95l.27-1.51a.75.75 0 0 0-.21-.67l-1.1-1.1a.75.75 0 0 0-.67-.21l-1.5.27c-.31-.15-.63-.27-.96-.39l-.76-1.32a.75.75 0 0 0-.65-.37h-1.56a.75.75 0 0 0-.65.37l-.76 1.32c-.33.12-.65.24-.96.39l-1.5-.27a.75.75 0 0 0-.67.21l-1.1 1.1a.75.75 0 0 0-.21.67l.27 1.5c-.15.31-.27.63-.39.96l-1.32.76a.75.75 0 0 0-.37.65v1.56c0 .27.14.52.37.65l1.32.76c.12.33.24.65.39.96l-.27 1.5a.75.75 0 0 0 .21.67l1.1 1.1c.19.19.46.27.73.21l1.5-.27c.31.15.63.27.96.39l.76 1.32c.13.23.38.37.65.37h1.56c.27 0 .52-.14.65-.37l.76-1.32c.33-.12.65-.24.96-.39l1.5.27a.75.75 0 0 0 .67-.21l1.1-1.1a.75.75 0 0 0 .21-.67l-.27-1.5c.15-.31.27-.63.39-.96l1.32-.76a.75.75 0 0 0 .37-.65v-1.56a.75.75 0 0 0-.37-.65Z"
                  fill="currentColor"
                />
              </svg>
            </button>

            {settingsOpen ? (
              <div ref={settingsMenuRef} className="settings-popover" role="menu" aria-label="Settings menu">
                <Link
                  href="/app/settings/connectors"
                  className="settings-popover__item"
                  role="menuitem"
                  onClick={() => {
                    setSettingsOpen(false);
                    setMobileNavOpen(false);
                  }}
                >
                  Integrations
                </Link>
                <Link
                  href="/app/settings/security"
                  className="settings-popover__item"
                  role="menuitem"
                  onClick={() => {
                    setSettingsOpen(false);
                    setMobileNavOpen(false);
                  }}
                >
                  Security
                </Link>
                <Link
                  href="/app/settings/ops"
                  className="settings-popover__item"
                  role="menuitem"
                  onClick={() => {
                    setSettingsOpen(false);
                    setMobileNavOpen(false);
                  }}
                >
                  Operations
                </Link>
                <Link
                  href="/app?onboarding=1"
                  className="settings-popover__item"
                  role="menuitem"
                  onClick={() => {
                    setSettingsOpen(false);
                    setMobileNavOpen(false);
                  }}
                >
                  Getting started
                </Link>
                <div className="settings-popover__item settings-popover__item--control">
                  <ThemeToggle variant="menu" />
                </div>
                <button
                  type="button"
                  className="settings-popover__item settings-popover__item--button"
                  role="menuitem"
                  onClick={() => void logout()}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {props.children}
      </div>
    </div>
  );
}
