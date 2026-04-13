"use client";

import { SessionProvider } from "next-auth/react";

// ── SessionProvider wrapper ───────────────────────────────────────────────────
// Root layout is a Server Component, so SessionProvider (a client component)
// must live in a separate file. This wrapper is imported into the root layout.

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
