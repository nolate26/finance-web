// PDF de Last Ficha: el comentario del quarter (Earnings comment de Presentations) y, debajo,
// la ficha completa tal como se ve en pantalla —barras de sección, sub-líneas celestes,
// bandas CFO/CFI/CFF, Var% en azul/rosado— con la columna de comentarios a la derecha.
//
// Las filas llegan ya formateadas desde LastFicha (mismo fmtVal/fmtVar de la tabla), así que
// lo que se imprime es exactamente lo que se ve. Esto sólo dibuja.

type RGB = [number, number, number];
const DARK_BLUE: RGB = [13, 13, 56];     // #0D0D38
const TINT: RGB      = [225, 233, 255];  // #E1E9FF sub-líneas
const BAND: RGB      = [70, 232, 224];   // sky blue, bandas CFO/CFI/CFF
const POS: RGB       = [0, 30, 175];     // patria-blue
const NEG: RGB       = [248, 72, 94];    // patria-pink
const ORANGE: RGB    = [255, 107, 6];
const MUTED: RGB     = [110, 110, 140];
const GRID: RGB      = [214, 216, 230];

export interface PdfCell { text: string; tone?: "pos" | "neg" | "muted" | "marked" }
export interface PdfRow {
  kind: "section" | "band" | "value" | "blank";   // band = subtítulo de KPIs (sin valores)
  label: string;            // nombre de la línea o título de la sección
  cells?: PdfCell[];        // una por columna de datos (sin la de la línea ni la de comentarios)
  comment?: string;         // texto de la columna de la derecha
  bold?: boolean;
  indent?: boolean;         // sub-línea celeste
  band?: boolean;           // banda CFO / CFI / CFF
  ruleTop?: boolean;        // raya de subtotal
}
export interface LastFichaPdfInput {
  filename: string;
  title: string;            // nombre de la compañía
  subtitle: string;         // ticker · moneda · trimestre · fecha de la ficha
  earnings: { badge: string; title: string; text: string } | null;
  headers: string[];        // encabezados de las columnas de datos
  rows: PdfRow[];
}

export async function downloadLastFichaPdf(inp: LastFichaPdfInput): Promise<void> {
  // Import dinámico: jsPDF toca window/document, no puede cargarse en SSR.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 26;
  const generated = new Date().toLocaleString("es-CL", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  // ── Cabecera ──
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...DARK_BLUE);
  doc.text(inp.title, margin, margin + 12);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text(inp.subtitle, margin, margin + 26);
  let y = margin + 38;

  // ── Earnings comment (puede ocupar más de una página si es largo) ──
  if (inp.earnings) {
    const w = pageW - margin * 2;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...ORANGE);
    doc.text(`EARNINGS COMMENT · ${inp.earnings.badge}`, margin, y + 8);
    doc.setTextColor(...DARK_BLUE); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(inp.earnings.title, w)[0] ?? "", margin, y + 21);
    y += 30;
    if (inp.earnings.text.trim()) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      const lines: string[] = doc.splitTextToSize(inp.earnings.text.trim(), w - 12);
      const lh = 11.5;
      let start = y;
      for (const ln of lines) {
        if (y + lh > pageH - margin - 10) {
          doc.setDrawColor(...ORANGE); doc.setLineWidth(2); doc.line(margin, start - 2, margin, y);
          doc.addPage(); y = margin; start = y;
        }
        doc.text(ln, margin + 10, y + 8);
        y += lh;
      }
      doc.setDrawColor(...ORANGE); doc.setLineWidth(2); doc.line(margin, start - 2, margin, y);
      y += 10;
    }
  }

  // ── Ficha ──
  const nData = inp.headers.length;
  const fontSize = nData > 16 ? 6 : nData > 12 ? 6.5 : 7.2;
  const toneColor = (t: PdfCell["tone"]): RGB | undefined =>
    t === "pos" ? POS : t === "neg" ? NEG : t === "muted" ? MUTED : t === "marked" ? ORANGE : undefined;

  type Cell = { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const body: Cell[][] = inp.rows.map((r) => {
    if (r.kind === "blank") return [{ content: "", colSpan: nData + 2, styles: { minCellHeight: 6, cellPadding: 0, fillColor: [255, 255, 255], lineWidth: 0 } }];
    if (r.kind === "section") {
      return [
        { content: r.label, styles: { fillColor: DARK_BLUE, textColor: 255, fontStyle: "bold", halign: "left" } },
        ...inp.headers.map((h) => ({ content: h, styles: { fillColor: DARK_BLUE, textColor: 255, fontStyle: "bold", halign: "center" } })),
        { content: "Comment", styles: { fillColor: DARK_BLUE, textColor: 255, fontStyle: "bold", halign: "left" } },
      ];
    }
    // kind "band" = subtítulo de KPIs (fila sola, celeste); r.band = CFO/CFI/CFF con valores.
    const fill: RGB = r.band ? BAND : r.indent || r.kind === "band" ? TINT : [255, 255, 255];
    const bold = r.bold || r.band || r.kind === "band";
    const base = { fillColor: fill, fontStyle: bold ? "bold" : "normal", lineWidth: r.ruleTop ? { top: 0.8 } : 0, lineColor: DARK_BLUE };
    if (r.kind === "band") {
      return [{ content: r.label, colSpan: nData + 2, styles: { ...base, halign: "left" } }];
    }
    return [
      { content: r.label, styles: { ...base, halign: "left", cellPadding: { top: 1.5, bottom: 1.5, left: r.indent ? 12 : 4, right: 4 } } },
      ...(r.cells ?? []).map((c) => {
        const color = toneColor(c.tone);
        return { content: c.text, styles: { ...base, halign: "right", ...(color ? { textColor: color } : {}), ...(c.tone === "marked" ? { fontStyle: "bold" } : {}) } };
      }),
      { content: r.comment ?? "", styles: { ...base, fontStyle: "normal", halign: "left", textColor: DARK_BLUE } },
    ];
  });

  autoTable(doc, {
    startY: y + 4,
    margin: { left: margin, right: margin, top: margin, bottom: margin + 8 },
    body: body as never,
    theme: "plain",
    styles: { font: "helvetica", fontSize, cellPadding: { top: 1.5, bottom: 1.5, left: 4, right: 4 }, textColor: DARK_BLUE, overflow: "linebreak", valign: "middle", lineColor: GRID },
    // Línea y comentario se llevan el ancho que sobra; los números no se parten.
    columnStyles: {
      0: { cellWidth: 118 },
      ...Object.fromEntries(inp.headers.map((_, i) => [i + 1, { cellWidth: "wrap" }])),
      [nData + 1]: { cellWidth: "auto", minCellWidth: 150 },
    },
    didDrawPage: () => {
      const page = doc.getCurrentPageInfo().pageNumber;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MUTED);
      doc.text(`${inp.title} · Last Ficha · generado ${generated}`, margin, pageH - 12);
      doc.text(`Página ${page}`, pageW - margin, pageH - 12, { align: "right" });
    },
  });

  doc.save(`${inp.filename}.pdf`);
}
