"use client";

/**
 * Primitivas de jerarquía del Manual de Identidad PATRIA, en React.
 *
 * Existen porque la plataforma maqueta con estilos inline y no con clases de
 * Tailwind, así que las equivalentes de globals.css (.patria-title /
 * .patria-subtitle / .patria-highlight) no alcanzan a estos componentes.
 * Mantener ambas versiones sincronizadas.
 */
import type { CSSProperties, ReactNode } from "react";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY } from "@/lib/patriaTheme";

interface TitleProps {
  children: ReactNode;
  /** Contenido alineado a la derecha dentro de la misma banda (filtros, tabs, badges). */
  right?: ReactNode;
  style?: CSSProperties;
}

/**
 * Regla 1 — Título principal de documento, tabla o gráfico.
 * Fondo patria-dark-blue, texto blanco en MAYÚSCULAS, Aptos Bold.
 */
export function PatriaTitle({ children, right, style }: TitleProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: right ? "space-between" : "flex-start",
        gap: 12,
        background: PATRIA.darkBlue,
        color: PATRIA.white,
        fontFamily: FONT_PRIMARY,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "8px 14px",
        borderRadius: "8px 8px 0 0",
        ...style,
      }}
    >
      <span>{children}</span>
      {right}
    </div>
  );
}

/**
 * Regla 2 — Subtítulo.
 * Fondo patria-king-blue, texto blanco, Arial Bold.
 */
export function PatriaSubtitle({ children, right, style }: TitleProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: right ? "space-between" : "flex-start",
        gap: 12,
        background: PATRIA.kingBlue,
        color: PATRIA.white,
        fontFamily: FONT_SECONDARY,
        fontWeight: 700,
        fontSize: 10.5,
        letterSpacing: "0.06em",
        padding: "6px 14px",
        ...style,
      }}
    >
      <span>{children}</span>
      {right}
    </div>
  );
}

/**
 * Regla 3 — Destacado / indicador clave.
 * Fondo de variante clara de la paleta y texto patria-dark-blue Arial Bold.
 */
export function PatriaHighlight({
  children,
  bg = PATRIA.skyBlue,
  style,
}: {
  children: ReactNode;
  bg?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: bg,
        color: PATRIA.darkBlue,
        fontFamily: FONT_SECONDARY,
        fontWeight: 700,
        borderRadius: 6,
        padding: "3px 9px",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
