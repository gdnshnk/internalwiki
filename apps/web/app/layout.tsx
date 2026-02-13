import type { Metadata } from "next";
import type { ReactNode } from "react";
import { assertRuntimeEnvSafety } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "InternalWiki",
  description: "Foundational knowledge infrastructure for modern organizations."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  assertRuntimeEnvSafety();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var stored = localStorage.getItem("internalwiki-theme");
                var valid = stored === "light" || stored === "dark";
                if (valid) {
                  document.documentElement.setAttribute("data-theme", stored);
                  return;
                }
                var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
              })();
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
