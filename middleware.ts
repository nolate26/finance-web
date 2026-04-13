import { withAuth } from "next-auth/middleware";

// ── Route guard ───────────────────────────────────────────────────────────────
// withAuth wraps the middleware. If the user has no valid JWT, they are
// redirected to the `signIn` page defined in authOptions.

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

// ── Protected routes ──────────────────────────────────────────────────────────
// Only routes listed here are matched by this middleware.
// Public routes (/, /login, /api/auth/...) are intentionally excluded.

export const config = {
  matcher: [
    // All UI routes that require authentication
    "/companies/:path*",
    "/chile/:path*",
    "/latam/:path*",
    "/economia/:path*",
    "/fondos/:path*",
    "/presentations/:path*",
    "/projections/:path*",
    "/quant/:path*",
    "/macro/:path*",

    // Private API routes
    "/api/companies/:path*",
    "/api/reports/:path*",
    "/api/chile/:path*",
    "/api/latam/:path*",
  ],
};
