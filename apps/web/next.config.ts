import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const cspMode = process.env.INTERNALWIKI_CSP_MODE === "report-only" ? "report-only" : "strict";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.openai.com https://oauth2.googleapis.com https://accounts.google.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

const headers = [
  {
    key: cspMode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    value: contentSecurityPolicy
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), usb=()"
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload"
        }
      ]
    : [])
];

const nextConfig: NextConfig = {
  transpilePackages: ["@internalwiki/core", "@internalwiki/ai", "@internalwiki/db", "@internalwiki/connectors"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers
      }
    ];
  }
};

export default nextConfig;
