"use client";

import { useSession } from "next-auth/react";

/**
 * Hook cliente: true si el usuario autenticado es admin.
 * El rol viaja en la sesión gracias a los callbacks jwt/session de lib/auth.ts.
 * Requiere que el árbol esté envuelto por <SessionProvider> (components/AuthProvider.tsx).
 */
export function useIsAdmin(): boolean {
  const { data } = useSession();
  return data?.user?.role === "admin";
}
