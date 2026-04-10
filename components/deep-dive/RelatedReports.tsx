"use client";

import { useState } from "react";
import { FileText, Upload, X, ExternalLink } from "lucide-react";

// ── Mock data ─────────────────────────────────────────────────────────────────

interface Report {
  id:     number;
  title:  string;
  author: string;
  date:   string;
  url:    string;
}

const MOCK_REPORTS: Report[] = [
  { id: 1, title: "Q1 2026 Earnings Preview",   author: "Banchile Inversiones",  date: "2026-04-05", url: "#" },
  { id: 2, title: "Initiation of Coverage",      author: "JPMorgan",              date: "2026-03-12", url: "#" },
  { id: 3, title: "Macro Impact on Margins",     author: "Internal Quant Team",   date: "2026-02-28", url: "#" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  // "2026-04-05" → "05 Apr"
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[parseInt(m, 10) - 1]}`;
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(15,23,42,0.35)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="relative rounded-xl shadow-2xl p-8 flex flex-col items-center gap-4"
        style={{
          background: "#fff",
          border: "1px solid rgba(15,23,42,0.10)",
          width: 360,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={15} />
        </button>

        {/* Icon */}
        <div
          className="rounded-full flex items-center justify-center"
          style={{ width: 52, height: 52, background: "rgba(43,92,224,0.08)", border: "1px solid rgba(43,92,224,0.18)" }}
        >
          <Upload size={22} color="#2B5CE0" />
        </div>

        <div className="text-center">
          <div className="text-sm font-bold text-slate-800 mb-1">Upload Report</div>
          <div className="text-xs text-slate-400">
            PDF upload not yet connected to the backend.
          </div>
        </div>

        {/* Drop-zone placeholder */}
        <div
          className="w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 py-6 cursor-not-allowed"
          style={{ borderColor: "rgba(43,92,224,0.20)", background: "rgba(43,92,224,0.03)" }}
        >
          <FileText size={24} color="#94A3B8" />
          <span className="text-xs text-slate-400">Drop PDF here · Coming soon</span>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: "rgba(15,23,42,0.06)", color: "#64748B" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RelatedReports() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      {modalOpen && <UploadModal onClose={() => setModalOpen(false)} />}

      <div className="flex flex-col h-full">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
            Related Reports
          </span>

          {/* Upload button */}
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all"
            style={{
              background: "rgba(43,92,224,0.07)",
              border: "1px solid rgba(43,92,224,0.18)",
              color: "#2B5CE0",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.13)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.07)";
            }}
          >
            <Upload size={10} />
            Upload
          </button>
        </div>

        {/* ── Report list ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 divide-y divide-slate-100">
          {MOCK_REPORTS.map((report) => (
            <a
              key={report.id}
              href={report.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2.5 py-2.5 px-2 -mx-2 rounded-lg cursor-pointer transition-colors hover:bg-slate-50 no-underline"
            >
              {/* PDF icon */}
              <div
                className="flex-shrink-0 mt-0.5 rounded flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  background: "rgba(220,38,38,0.07)",
                  border: "1px solid rgba(220,38,38,0.15)",
                }}
              >
                <FileText size={13} color="#DC2626" />
              </div>

              {/* Text block */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  {/* Title */}
                  <span
                    className="text-[11px] font-semibold leading-tight truncate group-hover:text-blue-700 transition-colors"
                    style={{ color: "#0F172A", maxWidth: "80%" }}
                  >
                    {report.title}
                  </span>

                  {/* External link icon — visible on hover */}
                  <ExternalLink
                    size={10}
                    className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity"
                    color="#2B5CE0"
                  />
                </div>

                {/* Author + date row */}
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-slate-400 truncate">{report.author}</span>
                  <span
                    className="text-[9px] flex-shrink-0 ml-2 font-mono"
                    style={{ color: "#94A3B8" }}
                  >
                    {fmtDate(report.date)}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>

        {/* ── Footer hint ─────────────────────────────────────────────────────── */}
        <div className="mt-3 pt-2.5 border-t border-slate-100">
          <span className="text-[9px] text-slate-300 font-mono">
            {MOCK_REPORTS.length} documents · API integration pending
          </span>
        </div>

      </div>
    </>
  );
}
