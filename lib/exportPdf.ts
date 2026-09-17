import type { SheetDef } from "@/lib/exportExcel";

// Espejo de downloadExcel para PDF: recibe las MISMAS hojas (headers + rows, con las
// filas de sección marcadas con "___section" en la primera celda) y arma un PDF
// apaisado con una tabla por hoja. Así cada botón "Excel" del sitio puede tener al
// lado un "PDF" sin duplicar la construcción de los datos.

export interface PdfOptions {
  /** Título grande de la primera página (default: nombre de la primera hoja). */
  title?:    string;
  /** Línea chica bajo el título (fecha de precios, filtros aplicados, etc.). */
  subtitle?: string;
  /** "landscape" (default) para tablas anchas; "portrait" para listas angostas. */
  orientation?: "landscape" | "portrait";
}

// Paleta PATRIA en RGB (jsPDF no acepta rgba/hex con alpha).
const DARK_BLUE: [number, number, number] = [13, 13, 56];     // #0D0D38
const KING_BLUE: [number, number, number] = [0, 30, 175];     // #001EAF
const SECTION:   [number, number, number] = [32, 68, 220];    // #2044DC
const ROW_ALT:   [number, number, number] = [245, 247, 253];  // #F5F7FD
const GRID:      [number, number, number] = [214, 216, 230];
const MUTED:     [number, number, number] = [110, 110, 140];

function fmtCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    // Enteros con separador de miles; decimales con hasta 2 (los porcentajes ya vienen
    // redondeados a 1–2 desde el sitio que arma la hoja).
    return Number.isInteger(v)
      ? v.toLocaleString("en-US")
      : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }
  return String(v);
}

export async function downloadPdf(sheets: SheetDef[], filename: string, opts: PdfOptions = {}): Promise<void> {
  // Import dinámico: jsPDF toca window/document, no puede cargarse en SSR.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const orientation = opts.orientation ?? "landscape";
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 28;
  const generated = new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  sheets.forEach((sheet, idx) => {
    if (idx > 0) doc.addPage();

    // ── Cabecera de página ──
    const title = idx === 0 ? (opts.title ?? sheet.name) : sheet.name;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...DARK_BLUE);
    doc.text(title, margin, margin + 12);

    let cursorY = margin + 18;
    const sub = idx === 0 ? opts.subtitle : undefined;
    if (sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(sub, margin, cursorY + 10);
      cursorY += 14;
    }
    // Si el título de la primera página no es el nombre de la hoja, lo mostramos chico.
    if (idx === 0 && opts.title && opts.title !== sheet.name) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(sheet.name, margin, cursorY + 10);
      cursorY += 14;
    }

    // ── Filas: las de sección se marcan para pintarlas distinto y hacer colSpan ──
    const nCols = sheet.headers.length;
    const body = sheet.rows.map((row) => {
      const first = row[0];
      if (typeof first === "string" && first.endsWith("___section")) {
        return [{
          content: first.replace("___section", ""),
          colSpan: nCols,
          styles:  { fillColor: SECTION, textColor: 255, fontStyle: "bold" as const, halign: "left" as const },
        }];
      }
      return row.map(fmtCell);
    });

    // Columnas numéricas → alineadas a la derecha (se decide por la primera fila con dato).
    const numericCols = new Set<number>();
    for (let c = 0; c < nCols; c++) {
      const sample = sheet.rows.find((r) => r[c] != null && !(typeof r[0] === "string" && r[0].endsWith("___section")));
      if (sample && typeof sample[c] === "number") numericCols.add(c);
    }
    const columnStyles: Record<number, { halign: "right" | "left" }> = {};
    numericCols.forEach((c) => { columnStyles[c] = { halign: "right" }; });

    // Tablas anchas → letra más chica para que entre en la página.
    const fontSize = nCols > 20 ? 6 : nCols > 12 ? 7 : 8;

    autoTable(doc, {
      startY:  cursorY + 6,
      margin:  { left: margin, right: margin, top: margin, bottom: margin + 8 },
      head:    [sheet.headers],
      body,
      theme:   "grid",
      styles: {
        font: "helvetica", fontSize, cellPadding: 3,
        textColor: DARK_BLUE, lineColor: GRID, lineWidth: 0.4, overflow: "linebreak",
      },
      headStyles: { fillColor: KING_BLUE, textColor: 255, fontStyle: "bold", halign: "center", fontSize },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles,
      // Pie de página: nombre de archivo + fecha de generación + página. Se dibuja por
      // página que la tabla ocupa, así las hojas largas también lo tienen.
      didDrawPage: () => {
        const page = doc.getCurrentPageInfo().pageNumber;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(`${filename} · generated ${generated}`, margin, pageH - 12);
        doc.text(`Page ${page}`, pageW - margin, pageH - 12, { align: "right" });
      },
    });
  });

  doc.save(`${filename}.pdf`);
}

// ── Puente para los explorers del modelo ─────────────────────────────────────
// ModelExplorer / BankModelExplorer arman su Excel celda por celda (xlsx-js-style,
// con `v` = texto ya formateado). Este helper toma esa misma grilla y la aplana a
// una SheetDef: la fila `headerRowIdx` es el encabezado (CCY + años) y una fila cuyo
// primer texto viene solo (el resto de celdas vacías) es una sección.

type GridCell = { v?: string | number | null } | null;

export function exportRowsToPdf(
  grid:         GridCell[][],
  headerRowIdx: number,
  filename:     string,
  title:        string,
  meta:         [string, string][],
): Promise<void> {
  const text = (c: GridCell) => (c?.v == null ? "" : String(c.v));
  const headers = grid[headerRowIdx].map(text);
  const rows = grid.slice(headerRowIdx + 1).map((r) => {
    const first = text(r[0]);
    const isSection = first !== "" && r.slice(1).every((c) => text(c) === "");
    return isSection ? [`${first}___section`] : r.map(text);
  });
  // Metadata compacta bajo el título: sólo lo que identifica la foto del modelo.
  const keep = new Set(["Recommendation", "TP", "Analyst", "Updated", "Current price", "Upside (current)"]);
  const subtitle = meta.filter(([k]) => keep.has(k)).map(([k, v]) => `${k}: ${v}`).join("  ·  ");
  return downloadPdf([{ name: "Model", headers, rows }], filename, { title, subtitle });
}
