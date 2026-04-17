"use client";

import { useEffect, useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import type { Presentation } from "@/components/CreatePresentationModal";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// ── Section divider ────────────────────────────────────────────────────────────

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#94A3B8" }}>
        {label}
      </span>
      <span style={{ fontSize: 9, fontWeight: 600, color: "#CBD5E1", background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.07)", borderRadius: 3, padding: "0px 5px", fontFamily: "JetBrains Mono, monospace" }}>
        {count}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(15,23,42,0.06)" }} />
    </div>
  );
}

// ── Report row ─────────────────────────────────────────────────────────────────

function ReportRow({ report }: { report: Presentation }) {
  return (
    <a
      href={report.file_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2.5 py-2 px-2 -mx-2 rounded-lg cursor-pointer transition-colors hover:bg-slate-50 no-underline"
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 mt-0.5 rounded flex items-center justify-center"
        style={{ width: 26, height: 26, background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)" }}
      >
        <FileText size={12} color="#DC2626" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-[11px] font-semibold leading-tight group-hover:text-blue-700 transition-colors"
            style={{ color: "#0F172A", maxWidth: "85%", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {report.title}
          </span>
          <ExternalLink size={10} className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity" color="#2B5CE0" />
        </div>
        {report.description && (
          <span className="text-[10px] text-slate-400 truncate block mt-0.5">{report.description}</span>
        )}
      </div>

      {/* Date */}
      <span className="flex-shrink-0 text-[9px] font-mono" style={{ color: "#94A3B8", marginTop: 2 }}>
        {fmtDate(report.created_at)}
      </span>
    </a>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyReports() {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-2" style={{ color: "#CBD5E1" }}>
      <FileText size={22} style={{ opacity: 0.35 }} />
      <p style={{ fontSize: 11, color: "#CBD5E1", margin: 0 }}>No reports linked to this company</p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

interface Props {
  ticker: string | null;
}

export default function RelatedReports({ ticker }: Props) {
  const [moneda,   setMoneda]   = useState<Presentation[]>([]);
  const [sellSide, setSellSide] = useState<Presentation[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!ticker) { setMoneda([]); setSellSide([]); return; }

    setLoading(true);
    fetch(`/api/presentations?company_name=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: { presentations?: Presentation[] }) => {
        const all = d.presentations ?? [];
        setMoneda(all.filter((p) => !p.is_sell_side));
        setSellSide(all.filter((p) =>  p.is_sell_side));
      })
      .catch(() => { setMoneda([]); setSellSide([]); })
      .finally(() => setLoading(false));
  }, [ticker]);

  const total = moneda.length + sellSide.length;

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Related Reports
        </span>
        {!loading && total > 0 && (
          <span style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace", background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.08)", borderRadius: 4, padding: "1px 6px" }}>
            {total}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-4 justify-center">
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 11, color: "#94A3B8" }}>Loading reports…</span>
        </div>
      )}

      {/* No ticker selected */}
      {!loading && !ticker && (
        <div style={{ fontSize: 11, color: "#CBD5E1", textAlign: "center", padding: "16px 0" }}>
          Select a company to see related reports
        </div>
      )}

      {/* No reports found */}
      {!loading && ticker && total === 0 && <EmptyReports />}

      {/* Content */}
      {!loading && total > 0 && (
        <>
          {/* Moneda */}
          {moneda.length > 0 && (
            <div className="mb-2">
              <SectionDivider label="Moneda" count={moneda.length} />
              <div className="flex flex-col">
                {moneda.map((r) => <ReportRow key={r.id} report={r} />)}
              </div>
            </div>
          )}

          {/* Sell Sides */}
          {sellSide.length > 0 && (
            <div className="mb-2">
              <SectionDivider label="Sell Sides" count={sellSide.length} />
              <div className="flex flex-col">
                {sellSide.map((r) => <ReportRow key={r.id} report={r} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer */}
      {!loading && (
        <div className="mt-auto pt-2.5 border-t border-slate-100">
          <span className="text-[9px] text-slate-300 font-mono">
            {ticker ? `${total} document${total !== 1 ? "s" : ""} · filtered by ticker` : "Select a company"}
          </span>
        </div>
      )}
    </div>
  );
}
