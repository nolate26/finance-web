import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// ── Route handler ─────────────────────────────────────────────────────────────
// La configuración vive en lib/auth.ts para poder reutilizarla en server-routes
// con getServerSession(authOptions).

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
