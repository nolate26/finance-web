"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import type { FichaRow } from "@/app/api/fichas/route";
import { FONT_SECONDARY } from "@/lib/patriaTheme";

// Botón "Download last ficha" para la barra de acciones del modelo (compañías y
// bancos). Se pinta SÓLO si la empresa tiene al menos una ficha: mientras carga o
// si no hay nada, no renderiza nada, así la barra no salta ni muestra un botón
// muerto. GET /api/fichas ya viene ordenado por created_at desc → [0] es la última.

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function LastFichaButton({ ticker }: { ticker: string }) {
  const [ficha, setFicha] = useState<FichaRow | null>(null);

  useEffect(() => {
    if (!ticker) { setFicha(null); return; }
    let cancelled = false;
    fetch(`/api/fichas?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { fichas?: FichaRow[] }) => { if (!cancelled) setFicha(d.fichas?.[0] ?? null); })
      .catch(() => { if (!cancelled) setFicha(null); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (!ficha) return null;

  return (
    <a
      href={ficha.file_url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${ficha.title} · uploaded ${fmtDate(ficha.created_at)}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 12px", borderRadius: 5, cursor: "pointer",
        background: "rgba(248,72,94,0.07)", color: "#F8485E",
        border: "1px solid rgba(248,72,94,0.30)",
        fontWeight: 700, fontSize: 11, letterSpacing: "0.02em",
        textDecoration: "none", whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(248,72,94,0.13)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(248,72,94,0.07)"; }}
    >
      <FileText size={12} style={{ flexShrink: 0 }} />
      Last ficha
      <span style={{ fontWeight: 600, opacity: 0.75, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
        {fmtDate(ficha.created_at)}
      </span>
    </a>
  );
}
