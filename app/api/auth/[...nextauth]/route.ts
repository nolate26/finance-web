import NextAuth, { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// ── Auth configuration (exported for use in Server Components / API routes) ───

const authOptions: AuthOptions = {
  // PrismaAdapter handles Account/Session persistence (needed even with JWT)
  adapter: PrismaAdapter(prisma) as AuthOptions["adapter"],

  // JWT strategy: sessions are stored in a signed cookie, not the DB.
  // This is faster and avoids the Session table for every request.
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
        // ── Defensive checks ─────────────────────────────────────────────────
        if (!credentials?.email || !credentials?.password) return null;

        // ── Database lookup ───────────────────────────────────────────────────
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          select: { id: true, email: true, name: true, password: true },
        });

        // Return null (not an error) to avoid timing oracle on user existence
        if (!user || !user.password) return null;

        // ── Constant-time password comparison ─────────────────────────────────
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return { id: user.id, email: user.email ?? "", name: user.name ?? "" };
      },
    }),
  ],

  callbacks: {
    // Persist user.id into the JWT payload on first sign-in
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id;
        token.name = user.name;
      }
      return token;
    },

    // Expose token.id on the client-visible session object
    async session({ session, token }) {
      if (session.user) {
        session.user.id   = token.id   as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
};

// ── Route handler ─────────────────────────────────────────────────────────────

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
