"use client";

import { useEffect, useState } from "react";

/**
 * Consulta de media query desde React.
 *
 * Casi toda la adaptación a tablet/teléfono de la plataforma se hace en CSS
 * (ver el bloque "TABLET Y TELÉFONO" de globals.css): es más barato y no
 * re-renderiza. Este hook existe sólo para los casos donde el cambio no es de
 * estilo sino de ESTRUCTURA — un panel lateral que pasa a ser un cajón, una
 * grilla de dos columnas que pasa a ser un acordeón — porque ahí hay estado
 * (abierto / cerrado) que CSS no puede sostener.
 *
 * Arranca en `false` a propósito: en el servidor no hay ventana que medir, y
 * devolver `false` significa "asumí escritorio". Así el HTML del servidor y el
 * del primer render del cliente coinciden, y la corrección llega en el efecto
 * —un frame después— sin error de hidratación.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * Los tres cortes de la plataforma. Coinciden con los del CSS a propósito: si
 * acá dice 1024 y allá 1023, aparece una franja de un píxel donde el layout
 * está en un modo y los estilos en el otro.
 */
export const BREAKPOINT = {
  phone:  640,   // .page-shell chico, modales como hoja inferior
  tablet: 1024,  // paneles laterales pasan a cajón
  nav:    1280,  // el navbar pasa a hamburguesa
} as const;

/** `true` en teléfono (≤640px). */
export const usePhone  = () => useMediaQuery(`(max-width: ${BREAKPOINT.phone}px)`);
/** `true` en teléfono y tablet (≤1024px) — el corte de los paneles laterales. */
export const useCompact = () => useMediaQuery(`(max-width: ${BREAKPOINT.tablet}px)`);
