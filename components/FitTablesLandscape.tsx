"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Shrink-to-fit de las tablas anchas en táctil horizontal.
 *
 * En un iPhone o iPad en horizontal, una tabla de 1600px dentro de un contenedor
 * de 800px se muestra parcial y hay que arrastrar. Este componente la encoge con
 * CSS `zoom` para que todas las columnas entren de una vez, y deja que el pinch
 * del navegador —que es otra capa, independiente— acerque una celda si hace
 * falta.
 *
 * POR QUÉ `zoom` Y NO `transform: scale`: `zoom` afecta el LAYOUT. Una tabla con
 * zoom 0.5 mide la mitad, así que el contenedor deja de scrollear, no queda un
 * hueco a la derecha, y los encabezados `position: sticky` siguen pegándose
 * donde corresponde. `transform` es sólo visual: el elemento sigue ocupando su
 * ancho original y el sticky se rompe.
 *
 * QUÉ TOCA: los mismos contenedores que la capa responsive de globals.css (los
 * `.scroll-x`, los `overflowX: "auto"` inline heredados, los `.grid-table-wrap`)
 * más los que opten con `.fit-width` — el caso de la tabla de Stock Selection,
 * que no está en un contenedor de scroll porque su encabezado sticky necesita
 * `overflow: visible` (ver StockSelectionV1). El zoom va en los HIJOS del
 * contenedor, nunca en el contenedor: un contenedor `width: 100%` con zoom 0.5
 * ocuparía la mitad de su padre.
 *
 * CÓMO SE MIDE: reset a zoom 1 → `scrollWidth` (ancho natural del contenido) →
 * `clientWidth / scrollWidth` → aplicar. Los tres pasos son síncronos dentro de
 * un mismo frame, así que el navegador no pinta el estado intermedio. El reset
 * es necesario porque `scrollWidth` nunca baja de `clientWidth`: sin él, una
 * tabla que se ANGOSTA (un grupo de columnas que se contrae) se quedaría con el
 * zoom viejo, más chica de lo necesario.
 *
 * El factor queda publicado como `--fit-zoom` en el contenedor para quien
 * necesite compensarlo: un `top: 64px` sticky dentro de un elemento con zoom
 * 0.5 se pega a 32px de pantalla, así que StockSelectionV1 escribe
 * `top: calc(64px / var(--fit-zoom, 1))`.
 */

// Táctil + horizontal. Se engancha a `pointer: coarse` y no al ancho: un iPad
// Pro horizontal (1366px) también encoge, y un monitor angosto con mouse no.
const QUERY = "(pointer: coarse) and (orientation: landscape)";

const SELECTOR = [
  ".scroll-x",
  ".grid-table-wrap",
  ".fit-width",
  ".overflow-x-auto",
  ".overflow-auto",
  // Las dos grafías de cada valor: React serializa sin espacio en SSR y con
  // espacio desde el cliente (mismo motivo que en globals.css).
  '[style*="overflow-x:auto"]',
  '[style*="overflow-x: auto"]',
  '[style*="overflow:auto"]',
  '[style*="overflow: auto"]',
].join(",");

// Lo que scrollea a propósito y no debe encogerse: el navbar, los rieles de
// pestañas (son blancos de toque) y los velos de modal que scrollean.
const EXCLUDE = ".nav-root, .tab-rail, .modal-overlay--scroll";

// Debajo de esto la tabla es ilegible incluso como mapa; se vuelve al scroll.
// Un iPhone SE horizontal (667px) con Stock Selection completa (~2400px) da
// 0.27 y entra; un contenedor de 100px con una tabla no.
const MIN_ZOOM = 0.2;

const ATTR = "data-fit-zoom";

function clear(el: HTMLElement) {
  for (const c of Array.from(el.children) as HTMLElement[]) c.style.zoom = "";
  el.style.removeProperty("--fit-zoom");
  el.removeAttribute(ATTR);
}

function fit(el: HTMLElement) {
  const kids = Array.from(el.children) as HTMLElement[];
  for (const c of kids) c.style.zoom = "";
  const avail   = el.clientWidth;
  const natural = el.scrollWidth;
  // Oculto (pestaña inactiva) o ya cabe: sin zoom.
  if (avail === 0 || natural <= avail + 1) { clear(el); return; }
  const z = Math.max(MIN_ZOOM, avail / natural);
  if (z >= 1) { clear(el); return; }
  for (const c of kids) c.style.zoom = String(z);
  el.style.setProperty("--fit-zoom", String(z));
  el.setAttribute(ATTR, z.toFixed(3));
}

function clearAll() {
  document.querySelectorAll<HTMLElement>(`[${ATTR}]`).forEach(clear);
}

function fitAll() {
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    if (el.closest(EXCLUDE)) return;
    fit(el);
  });
}

export default function FitTablesLandscape() {
  const pathname = usePathname();

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    let raf = 0;
    let observer: MutationObserver | null = null;

    // Coalesce: React dispara decenas de mutaciones por render; se procesa una
    // vez por frame, después de que el DOM quedó quieto.
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (mq.matches) fitAll(); });
    };

    const start = () => {
      if (observer) return;
      // Sólo childList: filas y columnas que aparecen o desaparecen. NO
      // `attributes`, porque escribir `style.zoom` es una mutación de atributo
      // y el observer se llamaría a sí mismo en bucle.
      observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      schedule();
    };
    const stop = () => {
      observer?.disconnect();
      observer = null;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      clearAll();
    };

    const onChange = () => { if (mq.matches) start(); else stop(); };
    onChange();

    mq.addEventListener("change", onChange);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      stop();
    };
  }, [pathname]);   // cada ruta monta tablas nuevas: se vuelve a medir

  return null;
}
