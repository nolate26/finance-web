/**
 * Manual de Identidad Corporativa — PATRIA INVESTMENTS / MONEDA PATRIA INVESTMENTS.
 *
 * Fuente única de verdad para todo lo que se pinta con estilos inline: Recharts,
 * exportaciones a Excel/PPT y tablas con color calculado en runtime. Los mismos
 * valores viven como clases Tailwind (patria-*) y CSS vars (--patria-*).
 *
 * Prohibido usar los colores por defecto de la librería de gráficos.
 */
import type { CSSProperties } from 'react';

export const PATRIA = {
  // Main blues
  darkBlue:       '#0D0D38',
  blue:           '#001EAF',
  kingBlue:       '#2044DC',
  darkSkyBlue:    '#4571FF',
  skyBlue:        '#88AAFF',
  // Secondary
  orange:         '#FF6B06',
  lightOrange:    '#FFBB8D',
  pink:           '#F8485E',
  lightPink:      '#FF99AF',
  turquoise:      '#46E8E0',
  lightTurquoise: '#B6FFE3',
  white:          '#FFFFFF',
} as const;

export const FONT_PRIMARY   = "Aptos, 'Aptos Display', 'Segoe UI', system-ui, sans-serif";
export const FONT_SECONDARY = 'Arial, Helvetica, sans-serif';

/**
 * Orden de priorización de series según el fondo del componente.
 *
 * onLight: arranca en dark-blue → blue → king-blue y sigue con el resto.
 * onDark : sobre fondo patria-dark-blue hay que contrastar, así que arranca en
 *          los azules claros y los secundarios (nunca dark-blue ni blue, que se
 *          pierden contra el fondo).
 */
export const CHART_SERIES_ON_LIGHT: string[] = [
  PATRIA.darkBlue,
  PATRIA.blue,
  PATRIA.kingBlue,
  PATRIA.darkSkyBlue,
  PATRIA.orange,
  PATRIA.pink,
  PATRIA.turquoise,
  PATRIA.skyBlue,
  PATRIA.lightOrange,
  PATRIA.lightPink,
];

export const CHART_SERIES_ON_DARK: string[] = [
  PATRIA.skyBlue,
  PATRIA.turquoise,
  PATRIA.lightOrange,
  PATRIA.darkSkyBlue,
  PATRIA.lightPink,
  PATRIA.lightTurquoise,
  PATRIA.orange,
  PATRIA.pink,
  PATRIA.kingBlue,
  PATRIA.white,
];

export type Surface = 'light' | 'dark';

/**
 * Colores de los "slots" de índice comparables en Market Overview.
 *
 * La tabla de valuación pinta el badge del índice y la página pinta el gráfico
 * de ese mismo índice: si las dos listas se separan, el badge y su serie dejan
 * de coincidir. Vive acá para que exista una sola definición.
 */
export const SLOT_COLORS: string[] = [PATRIA.darkBlue, PATRIA.kingBlue, PATRIA.orange];

/* ══════════════════════════════════════════════════════════════════════════════
   TOKENS SEMÁNTICOS
   Reemplazan a la escala de grises de Tailwind (slate-900 … slate-300) que
   estaba hardcodeada por toda la plataforma. Todos derivan de patria-dark-blue
   con alpha, así que nunca introducen un color fuera del manual.
   ══════════════════════════════════════════════════════════════════════════ */

/** Texto sobre fondo claro. `body` es el default de Regla 4. */
export const TEXT = {
  body:     PATRIA.darkBlue,            // Regla 4
  label:    'rgba(13,13,56,0.62)',      // etiquetas, ejes, texto secundario
  muted:    'rgba(13,13,56,0.45)',      // captions, unidades, notas al pie
  disabled: 'rgba(13,13,56,0.28)',      // celdas vacías, guiones "—"
} as const;

/** Texto sobre fondo patria-dark-blue. */
export const TEXT_ON_DARK = {
  body:     PATRIA.white,
  label:    'rgba(255,255,255,0.72)',
  muted:    'rgba(255,255,255,0.52)',
  disabled: 'rgba(255,255,255,0.32)',
} as const;

export const BORDER = {
  strong: 'rgba(13,13,56,0.16)',
  base:   'rgba(13,13,56,0.10)',
  subtle: 'rgba(13,13,56,0.06)',
  onDark: 'rgba(255,255,255,0.14)',
} as const;

export const SURFACE = {
  card:      '#FFFFFF',
  /** Relleno suave para cards y zebra striping — dark-blue al 3%. */
  subtle:    '#F5F7FD',
  zebra:     'rgba(13,13,56,0.022)',
  hover:     'rgba(32,68,220,0.06)',
  selected:  'rgba(32,68,220,0.10)',
  dark:      PATRIA.darkBlue,
} as const;

/**
 * Positivo / negativo.
 *
 * El manual no incluye verde ni rojo, así que la dupla es azul profundo vs
 * rosado corporativo sobre fondo claro (contraste 12:1 y 4:1 respectivamente),
 * y turquesa vs rosado claro sobre fondo dark-blue, donde ambos destacan.
 */
export const SENTIMENT = {
  light: { positive: PATRIA.blue,      negative: PATRIA.pink,      neutral: TEXT.muted },
  dark:  { positive: PATRIA.turquoise, negative: PATRIA.lightPink, neutral: TEXT_ON_DARK.muted },
} as const;

/** Color de un delta según su signo. `0` y `null` caen en neutral. */
export function sentimentColor(v: number | null | undefined, surface: Surface = 'light'): string {
  const s = SENTIMENT[surface];
  if (v == null || v === 0 || Number.isNaN(v)) return s.neutral;
  return v > 0 ? s.positive : s.negative;
}

/**
 * Numeración tabular en Arial: mantiene las columnas alineadas sin recurrir a
 * una mono, que Regla 4 no permite dentro de tablas.
 */
export const NUM: CSSProperties = {
  fontFamily: FONT_SECONDARY,
  fontVariantNumeric: 'tabular-nums',
};

/** Color de la serie i-ésima, ciclando si hay más series que colores. */
export function seriesColor(index: number, surface: Surface = 'light'): string {
  const palette = surface === 'dark' ? CHART_SERIES_ON_DARK : CHART_SERIES_ON_LIGHT;
  return palette[index % palette.length];
}

/**
 * Defaults de Recharts (ejes, grid, tooltip, leyenda) en Arial y en los tonos
 * de la paleta. Uso: <XAxis {...chartAxis()} /> y <Tooltip {...chartTooltip()} />.
 */
export function chartAxis(surface: Surface = 'light') {
  const tick = surface === 'dark' ? PATRIA.skyBlue : PATRIA.darkBlue;
  return {
    tick: { fill: tick, fontSize: 11, fontFamily: FONT_SECONDARY },
    axisLine: { stroke: surface === 'dark' ? 'rgba(255,255,255,0.20)' : 'rgba(13,13,56,0.15)' },
    tickLine: false as const,
  };
}

export function chartGrid(surface: Surface = 'light') {
  return {
    stroke: surface === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(13,13,56,0.08)',
    strokeDasharray: '3 3',
    vertical: false as const,
  };
}

export function chartTooltip(surface: Surface = 'light') {
  return {
    contentStyle: {
      background: surface === 'dark' ? PATRIA.darkBlue : PATRIA.white,
      border: `1px solid ${surface === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(13,13,56,0.12)'}`,
      borderRadius: 8,
      fontFamily: FONT_SECONDARY,
      fontSize: 12,
      color: surface === 'dark' ? PATRIA.white : PATRIA.darkBlue,
    },
    labelStyle: {
      fontFamily: FONT_SECONDARY,
      fontWeight: 700,
      color: surface === 'dark' ? PATRIA.skyBlue : PATRIA.kingBlue,
    },
  };
}

export function chartLegend(surface: Surface = 'light') {
  return {
    wrapperStyle: {
      fontFamily: FONT_SECONDARY,
      fontSize: 11,
      color: surface === 'dark' ? PATRIA.white : PATRIA.darkBlue,
    },
  };
}
