import "next-auth";
import "next-auth/jwt";

// ── Augment the built-in NextAuth types ───────────────────────────────────────
// This lets TypeScript know that session.user.id and token.id exist.

declare module "next-auth" {
  interface Session {
    user: {
      id:    string;
      name:  string;
      email: string;
      image?: string | null;
    };
  }

  interface User {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id:   string;
    name: string;
  }
}
