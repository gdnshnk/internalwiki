"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";

function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  return choice;
}

function labelFor(choice: ThemeChoice): string {
  if (choice === "system") {
    return "Theme: System";
  }
  if (choice === "dark") {
    return "Theme: Dark";
  }
  return "Theme: Light";
}

function nextTheme(choice: ThemeChoice): ThemeChoice {
  if (choice === "system") {
    return "dark";
  }
  if (choice === "dark") {
    return "light";
  }
  return "system";
}

export function ThemeToggle({ variant = "pill" }: { variant?: "pill" | "menu" }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem("internalwiki-theme") as ThemeChoice | null;
    const initial = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    setChoice(initial);
    document.documentElement.dataset.theme = resolveTheme(initial);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(choice);
    };

    apply();
    media.addEventListener("change", apply);

    return () => media.removeEventListener("change", apply);
  }, [choice]);

  return (
    <button
      type="button"
      className={variant === "menu" ? "theme-toggle theme-toggle--menu" : "theme-toggle"}
      onClick={() => {
        const newChoice = nextTheme(choice);
        setChoice(newChoice);
        window.localStorage.setItem("internalwiki-theme", newChoice);
        document.documentElement.dataset.theme = resolveTheme(newChoice);
      }}
    >
      {labelFor(choice)}
    </button>
  );
}
