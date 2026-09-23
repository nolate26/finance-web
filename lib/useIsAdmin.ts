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

/**
 * Hook cliente: true si hay sesión, sea admin o no.
 *
 * Es el gate de las acciones que puede hacer TODO el equipo (subir a Presentations),
 * frente a useIsAdmin() que sigue cubriendo lo destructivo (borrar). Devuelve false
 * mientras la sesión carga, así un botón no parpadea antes de saber quién mira.
 */
export function useIsSignedIn(): boolean {
  const { status } = useSession();
  return status === "authenticated";
}
