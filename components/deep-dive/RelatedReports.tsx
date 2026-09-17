"use client";

import { useEffect, useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import type { Presentation } from "@/components/CreatePresentationModal";
import type { FichaRow } from "@/app/api/fichas/route";
import { FONT_SECONDARY } from "@/lib/patriaTheme";

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// Las fichas son documentos fechados (una foto de la empresa): el año importa.
function fmtDateFull(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Forma mínima que comparten presentaciones y fichas para pintar una fila.
interface DocLike {
  id:          string;
  title:       string;
  description: string | null;
  file_url:    string;
  dateLabel:   string;
}

const presToDoc  = (p: Presentation): DocLike => ({ id: p.id, title: p.title, description: p.description, file_url: p.file_url, dateLabel: fmtDate(p.created_at) });
const fichaToDoc = (f: FichaRow):     DocLike => ({ id: f.id, title: f.title, description: f.description, file_url: f.file_url, dateLabel: fmtDateFull(f.created_at) });

// ── Section divider ────────────────────────────────────────────────────────────

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(13,13,56,0.45)" }}>
        {label}
      </span>
      <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(13,13,56,0.28)", background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.07)", borderRadius: 3, padding: "0px 5px", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
        {count}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(13,13,56,0.06)" }} />
    </div>
  );
}

// ── Report row ─────────────────────────────────────────────────────────────────

function ReportRow({ report }: { report: DocLike }) {
  return (
    <a
      href={report.file_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2.5 py-2 px-2 -mx-2 rounded-lg cursor-pointer transition-colors hover:bg-patria-dark-blue/[0.03] no-underline"
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 mt-0.5 rounded flex items-center justify-center"
        style={{ width: 26, height: 26, background: "rgba(248,72,94,0.07)", border: "1px solid rgba(248,72,94,0.15)" }}
      >
        <FileText size={12} color="#F8485E" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-[11px] font-semibold leading-tight group-hover:text-patria-king-blue transition-colors"
            style={{ color: "#0D0D38", maxWidth: "85%", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {report.title}
          </span>
          <ExternalLink size={10} className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity" color="#2044DC" />
        </div>
        {report.description && (
          <span className="text-[10px] text-patria-dark-blue/45 truncate block mt-0.5">{report.description}</span>
        )}
      </div>

      {/* Date */}
      <span className="flex-shrink-0 text-[9px] font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.45)", marginTop: 2 }}>
        {report.dateLabel}
      </span>
    </a>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyReports() {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-2" style={{ color: "rgba(13,13,56,0.28)" }}>
      <FileText size={22} style={{ opacity: 0.35 }} />
      <p style={{ fontSize: 11, color: "rgba(13,13,56,0.28)", margin: 0 }}>No reports linked to this company</p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

interface Props {
  ticker: string | null;
}

export default function RelatedReports({ ticker }: Props) {
  const [fichas,   setFichas]   = useState<DocLike[]>([]);
  const [moneda,   setMoneda]   = useState<DocLike[]>([]);
  const [sellSide, setSellSide] = useState<DocLike[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!ticker) { setFichas([]); setMoneda([]); setSellSide([]); return; }

    let cancelled = false;
    setLoading(true);
    // Dos fuentes en paralelo: presentaciones (company_name = ticker BBG) y fichas
    // (FK real al ticker). Si una falla, la otra igual se muestra.
    Promise.all([
      fetch(`/api/presentations?company_name=${encodeURIComponent(ticker)}`)
        .then((r) => r.json() as Promise<{ presentations?: Presentation[] }>)
        .then((d) => d.presentations ?? [])
        .catch(() => [] as Presentation[]),
      fetch(`/api/fichas?ticker=${encodeURIComponent(ticker)}`)
        .then((r) => r.json() as Promise<{ fichas?: FichaRow[] }>)
        .then((d) => d.fichas ?? [])
        .catch(() => [] as FichaRow[]),
    ]).then(([pres, fic]) => {
      if (cancelled) return;
      setFichas(fic.map(fichaToDoc));
      setMoneda(pres.filter((p) => !p.is_sell_side).map(presToDoc));
      setSellSide(pres.filter((p) =>  p.is_sell_side).map(presToDoc));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [ticker]);

  const total = fichas.length + moneda.length + sellSide.length;

  // Orden de secciones: Fichas primero, después Sell Sides, después Moneda.
  const sections: { label: string; docs: DocLike[] }[] = [
    { label: "Fichas",     docs: fichas   },
    { label: "Sell Sides", docs: sellSide },
    { label: "Moneda",     docs: moneda   },
  ];

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-widest uppercase text-patria-dark-blue/45">
          Related Reports
        </span>
        {!loading && total > 0 && (
          <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(13,13,56,0.45)", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.08)", borderRadius: 4, padding: "1px 6px" }}>
            {total}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-4 justify-center">
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(32,68,220,0.15)", borderTopColor: "#2044DC", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 11, color: "rgba(13,13,56,0.45)" }}>Loading reports…</span>
        </div>
      )}

      {/* No ticker selected */}
      {!loading && !ticker && (
        <div style={{ fontSize: 11, color: "rgba(13,13,56,0.28)", textAlign: "center", padding: "16px 0" }}>
          Select a company to see related reports
        </div>
      )}

      {/* No reports found */}
      {!loading && ticker && total === 0 && <EmptyReports />}

      {/* Content */}
      {!loading && total > 0 && sections.map(({ label, docs }) => docs.length > 0 && (
        <div key={label} className="mb-2">
          <SectionDivider label={label} count={docs.length} />
          <div className="flex flex-col">
            {docs.map((r) => <ReportRow key={r.id} report={r} />)}
          </div>
        </div>
      ))}

      {/* Footer */}
      {!loading && (
        <div className="mt-auto pt-2.5 border-t border-patria-dark-blue/[0.06]">
          <span className="text-[9px] text-patria-dark-blue/28 font-secondary tabular-nums">
            {ticker ? `${total} document${total !== 1 ? "s" : ""} · filtered by ticker` : "Select a company"}
          </span>
        </div>
      )}
    </div>
  );
}
