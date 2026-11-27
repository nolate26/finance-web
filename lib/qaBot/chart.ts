import path from "path";
import { readFileSync } from "fs";
import { PATRIA, TEXT } from "@/lib/patriaTheme";
import { cellValue, type QueryResult } from "@/lib/qaBot/db";

// Gráficos del bot de Q&A de Telegram: SVG armado acá → PNG con resvg (sin dependencias de
// sistema; la fuente va en lib/qaBot/fonts porque Railway no tiene Arial).
//
// Contrato de datos (lo arma el modelo con SQL): la PRIMERA columna es el eje X —fecha
// "YYYY-MM-DD", año o etiqueta— y las demás son las series numéricas, con el nombre de la
// columna como nombre de la serie ("AS \"Modelo\"").
//
// Colores: sólo del manual de PATRIA, en el orden que pasa el validador de paletas (legibilidad,
// daltonismo y contraste sobre blanco): king-blue → pink → dark-sky-blue. Ninguna combinación de
// 4 colores del manual pasa, así que el tope es 3 series. Una barra con valores negativos y una
// sola serie usa la polaridad king-blue (positivo) / pink (negativo).
//
// Diseño en unidades lógicas de 640 px de ancho; resvg lo rasteriza a 1280 px (2x), que es el
// máximo que Telegram muestra sin recomprimir.

export const SERIES_COLORS = [PATRIA.kingBlue, PATRIA.pink, PATRIA.darkSkyBlue];
export const MAX_SERIES = SERIES_COLORS.length;
const POS = PATRIA.kingBlue;
const NEG = PATRIA.pink;
const GRID = "rgba(13,13,56,0.08)";
const BASELINE = "rgba(13,13,56,0.30)";
export const FONT = "Arimo";
const W = 640;
const PAD = 20;

export type ValueFormat = "number" | "percent" | "fraction_percent" | "multiple";
export interface ChartSpec {
  kind: "line" | "bar";
  title: string;
  subtitle: string;
  valueFormat: ValueFormat;
  decimals: number;
  sourceNote: string;
}

// ── Utilidades ──────────────────────────────────────────────────────────────────

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/**
 * Ancho aproximado de un texto en Arimo/Arial, por tipo de carácter (en em): las mayúsculas
 * ocupan bastante más que las minúsculas, y la negrita ~6% más. Se usa para reservar el margen
 * de las etiquetas, así que pecar de ancho es preferible a cortarlas.
 */
export function textW(s: string, size: number, bold = false): number {
  let em = 0;
  for (const ch of s) {
    if (ch === " ") em += 0.28;
    else if (/[MWmw@%]/.test(ch)) em += 0.86;
    else if (/[A-ZÁÉÍÓÚÑ]/.test(ch)) em += 0.68;
    else if (/[0-9]/.test(ch)) em += 0.56;
    else if (/[iljtf.,:;'|!()\-]/.test(ch)) em += 0.3;
    else em += 0.53;
  }
  return em * size * (bold ? 1.06 : 1);
}
export const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

export const nf = (d: number) => new Intl.NumberFormat("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });

export function formatValue(v: number, fmt: ValueFormat, decimals: number): string {
  const d = Math.max(0, Math.min(4, Math.round(decimals)));
  if (fmt === "percent") return `${nf(d).format(v)}%`;
  if (fmt === "fraction_percent") return `${nf(d).format(v * 100)}%`;
  if (fmt === "multiple") return `${nf(d).format(v)}x`;
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(1).format(v / 1e9)} mil M`;
  if (a >= 1e6) return `${nf(1).format(v / 1e6)} M`;
  return nf(a >= 1000 ? 0 : d).format(v);
}

/** Ticks "limpios" (1, 2, 2,5, 5 × 10ⁿ) que cubren [min, max]. */
function niceTicks(min: number, max: number, target = 5): number[] {
  if (min === max) { const d = Math.abs(min) || 1; min -= d * 0.5; max += d * 0.5; }
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let t = lo; t <= hi + step * 1e-9; t += step) out.push(Math.round(t / step) * step);
  return out;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
const dateLabel = (t: number, spanDays: number) => {
  const d = new Date(t);
  return spanDays > 900 ? String(d.getUTCFullYear()) : `${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;
};

// ── Lectura del resultado de la consulta ───────────────────────────────────────────

interface Parsed { x: unknown[]; series: { name: string; values: (number | null)[] }[] }

export function parseChartData(r: QueryResult, kind: "line" | "bar"): Parsed | { error: string } {
  if (r.columns.length < 2) return { error: "La consulta debe devolver una columna para el eje X y al menos una serie numérica." };
  const toNum = (v: unknown) => { const c = cellValue(v); return typeof c === "number" && Number.isFinite(c) ? c : null; };
  const series = r.columns.slice(1).map((name, i) => ({ name, values: r.rows.map((row) => toNum(row[i + 1])) }))
    .filter((s) => s.values.some((v) => v != null));
  if (!series.length) return { error: "Ninguna columna después de la primera tiene valores numéricos." };
  if (series.length > MAX_SERIES) return { error: `Máximo ${MAX_SERIES} series por gráfico (se pidieron ${series.length}): divide el gráfico o deja las más importantes.` };
  const x = r.rows.map((row) => cellValue(row[0]));
  if (kind === "line" && x.length < 2) return { error: "Un gráfico de líneas necesita al menos 2 puntos." };
  if (kind === "line" && x.length > 3000) return { error: "Demasiados puntos (máximo 3.000): agrega por mes o acota el período." };
  if (kind === "bar" && x.length > 30) return { error: "Demasiadas barras (máximo 30): deja las principales o usa send_table_file." };
  return { x, series };
}

// ── Encabezado, leyenda y pie ────────────────────────────────────────────────────

function header(spec: ChartSpec, names: string[]): { svg: string; bottom: number } {
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="34" fill="${PATRIA.darkBlue}"/>`);
  parts.push(`<text x="${PAD}" y="22" font-family="${FONT}" font-weight="700" font-size="13" fill="#FFFFFF">${esc(clip(spec.title.toUpperCase(), 70))}</text>`);
  let y = 34;
  if (spec.subtitle.trim()) {
    parts.push(`<text x="${PAD}" y="${y + 18}" font-family="${FONT}" font-size="10.5" fill="${TEXT.label}">${esc(clip(spec.subtitle, 100))}</text>`);
    y += 24;
  }
  if (names.length >= 2) {
    let x = PAD;
    const ly = y + 16;
    names.forEach((n, i) => {
      parts.push(`<rect x="${x}" y="${ly - 7}" width="12" height="4" rx="2" fill="${SERIES_COLORS[i]}"/>`);
      const label = clip(n, 32);
      parts.push(`<text x="${x + 17}" y="${ly - 2}" font-family="${FONT}" font-size="10.5" fill="${PATRIA.darkBlue}">${esc(label)}</text>`);
      x += 17 + textW(label, 10.5) + 18;
    });
    y += 22;
  }
  return { svg: parts.join(""), bottom: y + 10 };
}

const footer = (note: string, h: number) =>
  note.trim()
    ? `<text x="${PAD}" y="${h - 12}" font-family="${FONT}" font-size="9" fill="${TEXT.muted}">${esc(clip(note, 120))}</text>`
    : "";

// ── Líneas ───────────────────────────────────────────────────────────────────────

function lineSvg(spec: ChartSpec, data: Parsed): string {
  const H = 400;
  const head = header(spec, data.series.map((s) => s.name));
  const all = data.series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const tickLabels = ticks.map((t) => formatValue(t, spec.valueFormat, spec.decimals));
  const left = PAD + Math.max(...tickLabels.map((l) => textW(l, 10))) + 8;
  const right = W - PAD - 64;   // espacio para el valor al final de cada línea
  const top = head.bottom + 6, bottom = H - 46;

  // Eje X: tiempo si son fechas; si no, posiciones parejas.
  const dates = data.x.every(isDate);
  const xs = dates ? data.x.map((d) => Date.parse(String(d).slice(0, 10))) : data.x.map((_, i) => i);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const sx = (v: number) => left + ((v - x0) / (x1 - x0 || 1)) * (right - left);
  const sy = (v: number) => bottom - ((v - yMin) / (yMax - yMin || 1)) * (bottom - top);

  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`, head.svg];
  ticks.forEach((t, i) => {
    const y = sy(t);
    parts.push(`<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="${t === 0 && yMin < 0 ? BASELINE : GRID}" stroke-width="1"/>`);
    parts.push(`<text x="${left - 8}" y="${y + 3.5}" text-anchor="end" font-family="${FONT}" font-size="10" fill="${TEXT.label}">${esc(tickLabels[i])}</text>`);
  });

  // Etiquetas del eje X: ~6, sin chocar.
  const nLabels = Math.min(6, xs.length);
  const spanDays = (x1 - x0) / 86_400_000;
  for (let k = 0; k < nLabels; k++) {
    const idx = Math.round((k * (xs.length - 1)) / Math.max(1, nLabels - 1));
    const label = dates ? dateLabel(xs[idx], spanDays) : clip(String(data.x[idx] ?? ""), 12);
    const anchor = k === 0 ? "start" : k === nLabels - 1 ? "end" : "middle";
    parts.push(`<text x="${sx(xs[idx])}" y="${bottom + 16}" text-anchor="${anchor}" font-family="${FONT}" font-size="10" fill="${TEXT.label}">${esc(label)}</text>`);
  }

  // Series: 2 px, puntas redondeadas; los nulos cortan la línea.
  const ends: { y: number; label: string; color: string; x: number }[] = [];
  data.series.forEach((s, i) => {
    const color = SERIES_COLORS[i];
    let d = "", pen = false;
    s.values.forEach((v, j) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${sx(xs[j]).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    const lastIdx = s.values.map((v, j) => (v == null ? -1 : j)).filter((j) => j >= 0).pop();
    if (lastIdx != null) {
      const v = s.values[lastIdx] as number;
      ends.push({ x: sx(xs[lastIdx]), y: sy(v), label: formatValue(v, spec.valueFormat, spec.decimals), color });
    }
  });
  // Punto final con anillo blanco; valor al final sólo si los extremos no se pisan (si no, la
  // leyenda y el texto del mensaje llevan el dato — nunca se apilan etiquetas).
  const collide = ends.some((a, i) => ends.some((b, j) => i < j && Math.abs(a.y - b.y) < 12));
  for (const e of ends) {
    parts.push(`<circle cx="${e.x}" cy="${e.y}" r="4" fill="${e.color}" stroke="#FFFFFF" stroke-width="2"/>`);
    if (!collide) parts.push(`<text x="${e.x + 8}" y="${e.y + 3.5}" font-family="${FONT}" font-weight="700" font-size="10.5" fill="${PATRIA.darkBlue}">${esc(e.label)}</text>`);
  }
  parts.push(footer(spec.sourceNote, H));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

// ── Barras horizontales ─────────────────────────────────────────────────────────────

/** Barra horizontal con la punta (lado opuesto al cero) redondeada 4 px y la base recta. */
function barPath(x0: number, x1: number, y: number, h: number): string {
  const r = Math.min(4, h / 2, Math.abs(x1 - x0));
  if (x1 >= x0) return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
  return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`;
}

function barSvg(spec: ChartSpec, data: Parsed): string {
  const n = data.x.length, k = data.series.length;
  const barH = k === 1 ? 18 : 12, gap = 2;
  const band = k * barH + (k - 1) * gap + 12;
  const head = header(spec, data.series.map((s) => s.name));
  const top = head.bottom + 4;
  const H = Math.round(top + n * band + 46);

  const all = data.series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const vMin = ticks[0], vMax = ticks[ticks.length - 1];
  const cats = data.x.map((c) => clip(String(c ?? "—"), 28));
  const left = PAD + Math.min(220, Math.max(...cats.map((c) => textW(c, 10.5, true)))) + 10;
  const right = W - PAD - 52; // espacio para el valor en la punta
  const sx = (v: number) => left + ((v - vMin) / (vMax - vMin || 1)) * (right - left);
  const zero = sx(0);
  const polarity = k === 1 && all.some((v) => v < 0);

  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`, head.svg];
  const gridBottom = top + n * band;
  ticks.forEach((t) => {
    const x = sx(t);
    parts.push(`<line x1="${x}" x2="${x}" y1="${top}" y2="${gridBottom}" stroke="${t === 0 ? BASELINE : GRID}" stroke-width="1"/>`);
    parts.push(`<text x="${x}" y="${gridBottom + 14}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${TEXT.label}">${esc(formatValue(t, spec.valueFormat, spec.decimals))}</text>`);
  });

  cats.forEach((c, i) => {
    const y0 = top + i * band + 6;
    parts.push(`<text x="${left - 10}" y="${y0 + (k * barH + (k - 1) * gap) / 2 + 3.5}" text-anchor="end" font-family="${FONT}" font-weight="700" font-size="10.5" fill="${PATRIA.kingBlue}">${esc(c)}</text>`);
    data.series.forEach((s, j) => {
      const v = s.values[i];
      if (v == null) return;
      const y = y0 + j * (barH + gap);
      const color = polarity ? (v < 0 ? NEG : POS) : SERIES_COLORS[j];
      parts.push(`<path d="${barPath(zero, sx(v), y, barH)}" fill="${color}"/>`);
      const label = formatValue(v, spec.valueFormat, spec.decimals);
      const tx = v >= 0 ? sx(v) + 5 : sx(v) - 5;
      parts.push(`<text x="${tx}" y="${y + barH / 2 + 3.5}" text-anchor="${v >= 0 ? "start" : "end"}" font-family="${FONT}" font-size="10" fill="${PATRIA.darkBlue}">${esc(label)}</text>`);
    });
  });
  parts.push(footer(spec.sourceNote, H));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

// ── Render ───────────────────────────────────────────────────────────────────────

let fontFiles: string[] | null = null;
const fonts = () => (fontFiles ??= ["Arimo-Regular.ttf", "Arimo-Bold.ttf"].map((f) => {
  const p = path.join(process.cwd(), "lib", "qaBot", "fonts", f);
  readFileSync(p, { flag: "r" }); // falla temprano y claro si el archivo no viajó en el deploy
  return p;
}));

export function chartSvg(spec: ChartSpec, data: Parsed): string {
  return spec.kind === "line" ? lineSvg(spec, data) : barSvg(spec, data);
}

/** SVG → PNG al doble de su tamaño lógico. resvg se importa en diferido: es un binario nativo. */
export async function renderSvgPng(svg: string): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const png = new Resvg(svg, {
    fitTo: { mode: "zoom", value: 2 },
    background: "#FFFFFF",
    font: { fontFiles: fonts(), loadSystemFonts: false, defaultFontFamily: FONT },
  }).render().asPng();
  return Buffer.from(png);
}

/** PNG de 1280 px de ancho (el gráfico mide 640 lógicos). */
export async function renderChartPng(spec: ChartSpec, data: Parsed): Promise<Buffer> {
  return renderSvgPng(chartSvg(spec, data));
}
