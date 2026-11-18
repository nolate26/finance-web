"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Ajuste de las tablas anchas en pantallas táctiles. Dos modos:
 *
 * ── HORIZONTAL (táctil) — shrink-to-fit ──────────────────────────────────────
 * En un iPhone o iPad en horizontal, una tabla de 1600px dentro de un contenedor
 * de 800px se muestra parcial y hay que arrastrar. Este componente la encoge con
 * CSS `zoom` para que todas las columnas entren de una vez, y deja que el pinch
 * del navegador —que es otra capa, independiente— acerque una celda si hace
 * falta.
 *
 * ── TELÉFONO VERTICAL (≤640px) — compactar + primera columna fija ────────────
 * En 390px encoger una tabla de 1600px a que entre entera la deja ilegible. Acá
 * el zoom tiene piso alto (PHONE_MIN_ZOOM): las tablas que "casi caben" (las de
 * 450–480px, muy comunes) entran enteras, y las anchas quedan un 20% más densas
 * y siguen scrolleando. Para que ese scroll no pierda el contexto, la primera
 * columna de la tabla (el nombre de la fila) queda fija a la izquierda: se le
 * marca `data-stick` y globals.css la vuelve `sticky`. Como una celda sticky
 * transparente deja ver lo que pasa por debajo, se le pinta el fondo opaco
 * EFECTIVO (el color de la fila compuesto sobre los de sus ancestros).
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
 * ocuparía la mitad de su padre. Un contenedor con `.no-fit` queda afuera (las
 * vistas que ya tienen su propio layout de teléfono).
 *
 * CÓMO SE MIDE: reset a zoom 1 → `scrollWidth` (ancho natural del contenido) →
 * `clientWidth / scrollWidth` → aplicar. Los tres pasos son síncronos dentro de
 * un mismo frame, así que el navegador no pinta el estado intermedio. El reset
 * es necesario porque `scrollWidth` nunca baja de `clientWidth`: sin él, una
 * tabla que se ANGOSTA (un grupo de columnas que se contrae) se quedaría con el
 * zoom viejo, más chica de lo necesario.
 *
 * ── ESCRITORIO (mouse) — sólo los que optan con `.fit-desktop` ───────────────
 * Con mouse no se encoge nada por defecto (el scroll horizontal es cómodo), salvo
 * los contenedores marcados `.fit-desktop`: Stock Selection con "Ver todo en
 * detalle" y su tabla de índices y fondos, que el usuario quiere ver enteras de
 * una vez. Mismo algoritmo, con piso DESKTOP_MIN_ZOOM para que siga legible; por
 * debajo de ese piso vuelve a sobresalir y scrollea.
 *
 * El factor queda publicado como `--fit-zoom` en el contenedor para quien
 * necesite compensarlo: un `top: 64px` sticky dentro de un elemento con zoom
 * 0.5 se pega a 32px de pantalla, así que StockSelectionV1 escribe
 * `top: calc(64px / var(--fit-zoom, 1))`.
 */

// Táctil + horizontal. Se engancha a `pointer: coarse` y no al ancho: un iPad
// Pro horizontal (1366px) también encoge, y un monitor angosto con mouse no.
const LANDSCAPE_QUERY = "(pointer: coarse) and (orientation: landscape)";
// Teléfono vertical. Por ancho y no por puntero: también lo ve quien angosta
// la ventana del escritorio para revisar cómo queda. Los iPhone en horizontal
// miden 667–932px, así que nunca caen acá.
const PHONE_QUERY = "(max-width: 640px)";

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
// pestañas (son blancos de toque), los velos de modal que scrollean y lo que
// opta por salir con `.no-fit`.
const EXCLUDE = ".nav-root, .tab-rail, .modal-overlay--scroll, .no-fit";

// Debajo de esto la tabla es ilegible incluso como mapa; se vuelve al scroll.
// Un iPhone SE horizontal (667px) con Stock Selection completa (~2400px) da
// 0.27 y entra; un contenedor de 100px con una tabla no.
const MIN_ZOOM = 0.2;
// En vertical el texto de 12–13px baja a ~10px: el límite de lo cómodo.
const PHONE_MIN_ZOOM = 0.8;
// Escritorio: 11px × 0.6 ≈ 6.6px es el mínimo que se lee en un monitor.
const DESKTOP_MIN_ZOOM = 0.6;
const DESKTOP_SELECTOR = ".fit-desktop";

const ATTR  = "data-fit-zoom";
const STICK = "data-stick";
const STICK_BG = "data-stick-bg";

type Mode = "landscape" | "phone" | "desktop";

function unstick(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>(`[${STICK}]`).forEach((c) => {
    c.removeAttribute(STICK);
    if (c.hasAttribute(STICK_BG)) { c.style.backgroundColor = ""; c.removeAttribute(STICK_BG); }
  });
}

function clear(el: HTMLElement) {
  for (const c of Array.from(el.children) as HTMLElement[]) c.style.zoom = "";
  el.style.removeProperty("--fit-zoom");
  el.removeAttribute(ATTR);
  unstick(el);
}

// ── Fondo opaco efectivo ─────────────────────────────────────────────────────
function parseRgba(s: string): [number, number, number, number] | null {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

/** Compone los fondos desde `cell` hacia arriba hasta dar con uno opaco. */
function effectiveBg(cell: HTMLElement): string | null {
  const layers: [number, number, number, number][] = [];
  let n: HTMLElement | null = cell;
  while (n) {
    const c = parseRgba(getComputedStyle(n).backgroundColor);
    if (c && c[3] > 0) {
      if (n === cell && c[3] >= 1) return null;   // ya es opaca: no se toca
      layers.push(c);
      if (c[3] >= 1) break;
    }
    n = n.parentElement;
  }
  let [r, g, b] = [255, 255, 255];
  for (let i = layers.length - 1; i >= 0; i--) {
    const [lr, lg, lb, la] = layers[i];
    r = lr * la + r * (1 - la); g = lg * la + g * (1 - la); b = lb * la + b * (1 - la);
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Fija la primera columna de la tabla principal del contenedor. */
function stickFirstColumn(el: HTMLElement) {
  const table = el.querySelector("table");
  if (!table || table.closest(SELECTOR) !== el) return;
  // Las tablas que ya fijan su propia primera columna se respetan.
  const first = table.rows[0]?.cells[0];
  if (!first || getComputedStyle(first).position === "sticky" && getComputedStyle(first).left !== "auto") return;
  for (const row of Array.from(table.rows)) {
    const cell = row.cells[0];
    // Una fila de sección (una celda que abarca todo) no se fija: no se puede
    // mover y su `left` no haría nada útil.
    if (!cell || cell.colSpan > 1) continue;
    if (!cell.hasAttribute(STICK)) cell.setAttribute(STICK, "");
  }
  // El fondo se resuelve después de marcar, todo junto: el `getComputedStyle`
  // fuerza layout y conviene pagarlo una vez.
  for (const cell of Array.from(table.querySelectorAll<HTMLElement>(`[${STICK}]`))) {
    if (cell.hasAttribute(STICK_BG)) continue;
    const bg = effectiveBg(cell);
    if (bg) { cell.style.backgroundColor = bg; cell.setAttribute(STICK_BG, ""); }
  }
}

function fit(el: HTMLElement, mode: Mode) {
  const kids = Array.from(el.children) as HTMLElement[];
  for (const c of kids) c.style.zoom = "";
  const avail   = el.clientWidth;
  const natural = el.scrollWidth;
  // Oculto (pestaña inactiva) o ya cabe: sin zoom.
  if (avail === 0 || natural <= avail + 1) { clear(el); return; }
  const floor = mode === "phone" ? PHONE_MIN_ZOOM : mode === "desktop" ? DESKTOP_MIN_ZOOM : MIN_ZOOM;
  const z = Math.max(floor, avail / natural);
  if (z >= 1) { clear(el); return; }
  for (const c of kids) c.style.zoom = String(z);
  el.style.setProperty("--fit-zoom", String(z));
  el.setAttribute(ATTR, z.toFixed(3));
  // Sigue scrolleando después del zoom → la primera columna se fija.
  if (mode === "phone" && el.scrollWidth > el.clientWidth + 1) stickFirstColumn(el);
  else unstick(el);
}

function clearAll() {
  document.querySelectorAll<HTMLElement>(`[${ATTR}]`).forEach(clear);
}

function fitAll(mode: Mode) {
  document.querySelectorAll<HTMLElement>(mode === "desktop" ? DESKTOP_SELECTOR : SELECTOR).forEach((el) => {
    if (el.closest(EXCLUDE)) { if (el.hasAttribute(ATTR)) clear(el); return; }
    fit(el, mode);
  });
}

export default function FitTablesLandscape() {
  const pathname = usePathname();

  useEffect(() => {
    const land  = window.matchMedia(LANDSCAPE_QUERY);
    const phone = window.matchMedia(PHONE_QUERY);
    // Siempre hay un modo: en escritorio sólo se miden los `.fit-desktop` (pocos y baratos).
    const mode = (): Mode => land.matches ? "landscape" : phone.matches ? "phone" : "desktop";
    let raf = 0;
    let observer: MutationObserver | null = null;

    // Coalesce: React dispara decenas de mutaciones por render; se procesa una
    // vez por frame, después de que el DOM quedó quieto.
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; fitAll(mode()); });
    };

    const start = () => {
      if (observer) { clearAll(); schedule(); return; }
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

    // Al cambiar de modo, start() limpia los zoom del modo anterior y vuelve a medir.
    const onChange = () => start();
    onChange();

    land.addEventListener("change", onChange);
    phone.addEventListener("change", onChange);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      land.removeEventListener("change", onChange);
      phone.removeEventListener("change", onChange);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      stop();
    };
  }, [pathname]);   // cada ruta monta tablas nuevas: se vuelve a medir

  return null;
}
