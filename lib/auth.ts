import { type AuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Auth configuration ────────────────────────────────────────────────────────
// Centralizada aquí para poder reutilizarla tanto en el route handler de NextAuth
// (app/api/auth/[...nextauth]/route.ts) como en cualquier API route que necesite
// leer la sesión del servidor con getServerSession(authOptions).

export const authOptions: AuthOptions = {
  // PrismaAdapter handles Account/Session persistence (needed even with JWT)
  adapter: PrismaAdapter(prisma) as AuthOptions["adapter"],

  // JWT strategy: sessions are stored in a signed cookie, not the DB.
  session: { strategy: "jwt" },

  // Custom pages — NextAuth will redirect here instead of its default UI
  pages: { signIn: "/login" },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where:  { email: credentials.email.toLowerCase().trim() },
          select: { id: true, email: true, name: true, password: true, role: true },
        });

        // Return null (not an error) to avoid timing oracle on user existence
        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return {
          id:    user.id,
          email: user.email ?? "",
          name:  user.name ?? "",
          role:  user.role ?? "user",
        };
      },
    }),
  ],

  callbacks: {
    // Persist user.id and role into the JWT payload on first sign-in
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id;
        token.name = user.name ?? "";
        // `role` viene del authorize; se persiste en el token para las peticiones siguientes.
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },

    // Expose token.id / token.role on the client-visible session object.
    // Revalidamos contra la DB en cada lectura de sesión: el `role` sale SIEMPRE
    // de la base (no de la cookie), así los cambios de rol y los borrados aplican
    // al instante. Si el usuario ya no existe, cae a "user" (pierde permisos admin).
    async session({ session, token }) {
      if (session.user) {
        session.user.id   = token.id   as string;
        session.user.name = token.name as string;

        const dbUser = token.id
          ? await prisma.user.findUnique({
              where:  { id: token.id as string },
              select: { role: true },
            })
          : null;

        session.user.role = dbUser?.role ?? "user";
      }
      return session;
    },
  },
};

// ── Server-side role helpers ──────────────────────────────────────────────────

/** Devuelve el usuario de la sesión del servidor, o null si no hay sesión. */
export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

/** true si el usuario autenticado tiene rol admin. */
export async function isAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  return user?.role === "admin";
}

/**
 * Guard para API routes mutantes. Úsalo al inicio del handler:
 *   const deny = await requireAdmin();
 *   if (deny) return deny;
 * Devuelve una NextResponse (401/403) si NO es admin, o null si puede continuar.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Requiere permisos de administrador" }, { status: 403 });
  }
  return null;
}
