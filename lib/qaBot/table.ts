import { PATRIA, TEXT } from "@/lib/patriaTheme";
import { cellValue, type QueryResult } from "@/lib/qaBot/db";
import { esc, textW, clip, nf, formatValue, renderSvgPng, FONT } from "@/lib/qaBot/chart";

// Tablas del bot de Q&A como imagen. En Telegram una tabla en texto se desarma: el modelo no
// alinea bien caracteres, y en el celular las líneas largas se cortan. Acá las columnas se miden
// y se alinean en código, con la tabla del manual de PATRIA (.patria-table de globals.css):
// título en banda dark-blue, encabezado king-blue con texto blanco, primera columna en negrita
// king-blue, números a la derecha y en dark-blue.

export const MAX_TABLE_ROWS = 40;
export const MAX_TABLE_COLS = 8;

export type ColumnFormat = "text" | "number" | "compact" | "percent" | "fraction_percent" | "multiple" | "date";
export interface ColumnSpec { format: ColumnFormat; decimals: number }
export interface TableSpec { title: string; subtitle: string; sourceNote: string; columns: ColumnSpec[] }

const PAD = 20;          // margen exterior
const CELL_PAD = 10;     // relleno horizontal de cada celda
const ROW_H = 26;
const BODY_SIZE = 11;
const HEAD_SIZE = 10.5;
const MAX_COL_W = 220;
const MAX_TABLE_W = 1000;
const MIN_W = 420;
const ZEBRA = "#F5F7FD";
const RULE = "rgba(13,13,56,0.08)";

function fmtDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : s;
}

function formatCell(v: unknown, spec: ColumnSpec): { text: string; numeric: boolean } {
  const c = cellValue(v);
  if (c == null || c === "") return { text: "—", numeric: false };
  if (typeof c === "number" && Number.isFinite(c)) {
    const d = Math.max(0, Math.min(4, Math.round(spec.decimals)));
    switch (spec.format) {
      case "compact": return { text: formatValue(c, "number", d), numeric: true };
      case "percent": case "fraction_percent": case "multiple": return { text: formatValue(c, spec.format, d), numeric: true };
      case "text": return { text: String(c), numeric: false };
      default: return { text: nf(d).format(c), numeric: true };
    }
  }
  const s = String(c);
  return { text: spec.format === "date" ? fmtDate(s) : s, numeric: false };
}

/** Parte un encabezado largo en dos líneas por el espacio más cercano al centro. */
function splitHeader(h: string): string[] {
  const spaces = [...h.matchAll(/ /g)].map((m) => m.index!);
  if (!spaces.length) return [h];
  const mid = h.length / 2;
  const at = spaces.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  return [h.slice(0, at), h.slice(at + 1)];
}

export function tableSvg(r: QueryResult, spec: TableSpec): string | { error: string } {
  if (!r.columns.length || !r.rows.length) return { error: "La consulta no devolvió filas." };
  if (r.columns.length > MAX_TABLE_COLS) return { error: `Máximo ${MAX_TABLE_COLS} columnas (llegaron ${r.columns.length}): deja las importantes o usa send_table_file.` };
  if (r.rows.length > MAX_TABLE_ROWS) return { error: `Máximo ${MAX_TABLE_ROWS} filas (llegaron ${r.rows.length}${r.truncated ? " o más" : ""}): usa send_table_file y resume en el mensaje.` };

  // Formato por columna: el que pidió el modelo si calza con las columnas; si no, automático.
  const specs: ColumnSpec[] = r.columns.map((_, j) => spec.columns.length === r.columns.length
    ? spec.columns[j]
    : { format: r.rows.some((row) => typeof cellValue(row[j]) === "number") ? "number" : "text", decimals: 1 });

  const cells = r.rows.map((row) => row.map((v, j) => {
    const f = formatCell(v, specs[j]);
    return { ...f, text: clip(f.text, j === 0 ? 34 : 28) };
  }));
  // Una columna es numérica (alineada a la derecha) si todas sus celdas con dato lo son.
  const numericCol = r.columns.map((_, j) => j > 0 && cells.every((row) => row[j].numeric || row[j].text === "—"));

  // Ancho de columna: el mayor entre el contenido y el encabezado (partido en dos si es largo).
  const headers = r.columns.map((h, j) => {
    const content = Math.max(...cells.map((row) => textW(row[j].text, BODY_SIZE, j === 0)));
    const one = textW(h, HEAD_SIZE, true);
    const lines = one > Math.max(content, 64) ? splitHeader(h).map((l) => clip(l, 24)) : [clip(h, 30)];
    const head = Math.max(...lines.map((l) => textW(l, HEAD_SIZE, true)));
    return { lines, width: Math.min(MAX_COL_W, Math.max(content, head)) + 2 * CELL_PAD };
  });
  const tableW = headers.reduce((a, h) => a + h.width, 0);
  if (tableW > MAX_TABLE_W) return { error: "La tabla es muy ancha para leerse en el celular: quita columnas, acorta los alias o usa send_table_file." };
  const W = Math.round(Math.max(MIN_W, tableW + 2 * PAD));
  const headH = headers.some((h) => h.lines.length > 1) ? 40 : 28;

  const parts: string[] = [];
  // Título (banda dark-blue, mayúsculas) y subtítulo.
  const titleChars = Math.floor((W - 2 * PAD) / 8.6);
  parts.push(`<rect x="0" y="0" width="${W}" height="34" fill="${PATRIA.darkBlue}"/>`);
  parts.push(`<text x="${PAD}" y="22" font-family="${FONT}" font-weight="700" font-size="13" fill="#FFFFFF">${esc(clip(spec.title.toUpperCase(), titleChars))}</text>`);
  let y = 34;
  if (spec.subtitle.trim()) {
    parts.push(`<text x="${PAD}" y="${y + 18}" font-family="${FONT}" font-size="10.5" fill="${TEXT.label}">${esc(clip(spec.subtitle, Math.floor((W - 2 * PAD) / 5.6)))}</text>`);
    y += 24;
  }
  y += 10;

  // Encabezado king-blue.
  const x0 = PAD;
  const colX: number[] = [];
  headers.reduce((x, h) => { colX.push(x); return x + h.width; }, x0);
  parts.push(`<rect x="${x0}" y="${y}" width="${tableW}" height="${headH}" fill="${PATRIA.kingBlue}"/>`);
  headers.forEach((h, j) => {
    const right = numericCol[j];
    const tx = right ? colX[j] + h.width - CELL_PAD : colX[j] + CELL_PAD;
    const firstBase = y + headH / 2 + 3.5 - (h.lines.length - 1) * 6.5;
    h.lines.forEach((line, k) => {
      parts.push(`<text x="${tx}" y="${firstBase + k * 13}" text-anchor="${right ? "end" : "start"}" font-family="${FONT}" font-weight="700" font-size="${HEAD_SIZE}" fill="#FFFFFF">${esc(line)}</text>`);
    });
  });
  y += headH;

  // Filas: cebra suave + filete inferior; primera columna en negrita king-blue.
  cells.forEach((row, i) => {
    if (i % 2 === 1) parts.push(`<rect x="${x0}" y="${y}" width="${tableW}" height="${ROW_H}" fill="${ZEBRA}"/>`);
    parts.push(`<line x1="${x0}" x2="${x0 + tableW}" y1="${y + ROW_H - 0.5}" y2="${y + ROW_H - 0.5}" stroke="${RULE}" stroke-width="1"/>`);
    row.forEach((c, j) => {
      const right = numericCol[j];
      const tx = right ? colX[j] + headers[j].width - CELL_PAD : colX[j] + CELL_PAD;
      const color = c.text === "—" ? TEXT.disabled : j === 0 ? PATRIA.kingBlue : PATRIA.darkBlue;
      parts.push(`<text x="${tx}" y="${y + ROW_H / 2 + 4}" text-anchor="${right ? "end" : "start"}" font-family="${FONT}"${j === 0 ? ' font-weight="700"' : ""} font-size="${BODY_SIZE}" fill="${color}">${esc(c.text)}</text>`);
    });
    y += ROW_H;
  });

  let H = y + 16;
  if (spec.sourceNote.trim()) {
    parts.push(`<text x="${PAD}" y="${y + 20}" font-family="${FONT}" font-size="9" fill="${TEXT.muted}">${esc(clip(spec.sourceNote, Math.floor((W - 2 * PAD) / 4.8)))}</text>`);
    H = y + 32;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#FFFFFF"/>${parts.join("")}</svg>`;
}

export async function renderTablePng(r: QueryResult, spec: TableSpec): Promise<Buffer | { error: string }> {
  const svg = tableSvg(r, spec);
  if (typeof svg !== "string") return svg;
  return renderSvgPng(svg);
}
