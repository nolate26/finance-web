"use client";

import { Download, FileText } from "lucide-react";
import { downloadExcel, type SheetDef } from "@/lib/exportExcel";
import { downloadPdf, type PdfOptions } from "@/lib/exportPdf";

// Par de botones "Excel" + "PDF" que exportan LAS MISMAS hojas. `sheets` es una
// función para que la hoja se arme recién al hacer click (con lo filtrado/ordenado
// en ese momento) y no en cada render.

interface Props {
  sheets:    () => SheetDef[];
  filename:  string;
  /** Título/subtítulo de la primera página del PDF. */
  pdf?:      PdfOptions;
  /** Se muestra entre paréntesis en el botón de Excel (p.ej. filas exportadas). */
  count?:    number;
  /** Estilo del botón: "ghost" (default, azul claro) o "solid" (relleno). */
  variant?:  "ghost" | "solid";
  style?:    React.CSSProperties;
}

const GHOST: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  fontSize: 11, fontWeight: 600, color: "#001EAF",
  background: "rgba(0,30,175,0.07)", border: "1px solid rgba(0,30,175,0.22)",
  borderRadius: 7, padding: "5px 14px", cursor: "pointer", transition: "all 0.12s",
  whiteSpace: "nowrap",
};

const SOLID: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  fontSize: 11, fontWeight: 700, color: "#FFFFFF", letterSpacing: "0.02em",
  background: "#001EAF", border: "none",
  borderRadius: 5, padding: "5px 12px", cursor: "pointer", outline: "none",
  whiteSpace: "nowrap",
};

export default function ExportButtons({ sheets, filename, pdf, count, variant = "ghost", style }: Props) {
  const base  = variant === "solid" ? SOLID : GHOST;
  const hover = variant === "solid" ? "#0030D0" : "rgba(0,30,175,0.13)";
  const rest  = String(base.background);

  const btn = (label: React.ReactNode, onClick: () => void, title: string) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={base}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hover; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = rest; }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
      {btn(
        <><Download size={12} /> Excel{count != null ? ` (${count})` : ""}</>,
        () => { void downloadExcel(sheets(), filename); },
        "Download as Excel",
      )}
      {btn(
        <><FileText size={12} /> PDF</>,
        () => { void downloadPdf(sheets(), filename, pdf); },
        "Download as PDF",
      )}
    </div>
  );
}
