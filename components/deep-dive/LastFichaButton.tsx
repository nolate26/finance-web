"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, FileX } from "lucide-react";
import type { FichaRow } from "@/app/api/fichas/route";
import { PATRIA, FONT_SECONDARY, TEXT, BORDER } from "@/lib/patriaTheme";

// Última ficha de la empresa, para la barra del modelo (compañías y bancos). En color
// y clickeable si hay una; en gris avisando si no. Ojo con el error: "no se pudo
// consultar" no es lo mismo que "no tiene ficha", y decir lo segundo sería falso.
// GET /api/fichas ya viene ordenado por created_at desc → [0] es la última.

type State = "loading" | "none" | "error" | FichaRow;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const chip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 30, boxSizing: "border-box",
  padding: "0 11px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
};

const GRAY_MSG: Record<Exclude<State, FichaRow>, string> = {
  loading: "Checking…",
  none:    "No ficha uploaded",
  error:   "Could not check",
};

export default function LastFichaButton({ ticker }: { ticker: string }) {
  const [ficha, setFicha] = useState<State>("loading");

  useEffect(() => {
    setFicha("loading");
    if (!ticker) { setFicha("none"); return; }
    let cancelled = false;
    fetch(`/api/fichas?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { fichas?: FichaRow[] }) => { if (!cancelled) setFicha(d.fichas?.[0] ?? "none"); })
      .catch(() => { if (!cancelled) setFicha("error"); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (typeof ficha === "string") {
    return (
      <span style={{ ...chip, background: "rgba(13,13,56,0.04)", color: TEXT.muted, border: `1px solid ${BORDER.base}` }}>
        {ficha !== "loading" && <FileX size={13} style={{ flexShrink: 0 }} />}
        {GRAY_MSG[ficha]}
      </span>
    );
  }

  return (
    <a
      href={ficha.file_url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${ficha.title} · uploaded ${fmtDate(ficha.created_at)}`}
      style={{
        ...chip, cursor: "pointer", textDecoration: "none",
        background: "rgba(32,68,220,0.08)", color: PATRIA.kingBlue,
        border: "1px solid rgba(32,68,220,0.30)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.14)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.08)"; }}
    >
      <FileText size={13} style={{ flexShrink: 0 }} />
      <span style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>{fmtDate(ficha.created_at)}</span>
      <ExternalLink size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
    </a>
  );
}
