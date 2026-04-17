"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Download, Upload } from "lucide-react";
import CreatePresentationModal, { type Presentation } from "@/components/CreatePresentationModal";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHILE_FUNDS = ["Pionero", "MRV", "Orange"];
const LATAM_FUNDS = ["MLE", "MSC", "Glory", "Mercer"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── File row ─────────────────────────────────────────────────────────────────

function FileRow({ pres }: { pres: Presentation }) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 last:border-0 transition-colors"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.02)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {/* PDF icon */}
      <div
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg"
        style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)" }}
      >
        <FileText size={16} style={{ color: "#DC2626" }} />
      </div>

      {/* Title + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "#0F172A" }}>
          {pres.title}
        </p>
        {pres.description && (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#64748B" }}>
            {pres.description}
          </p>
        )}
      </div>

      {/* Company / fund chip */}
      {pres.company_name && (
        <span
          className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md"
          style={{
            background: "rgba(43,92,224,0.07)",
            color: "#2B5CE0",
            border: "1px solid rgba(43,92,224,0.15)",
            whiteSpace: "nowrap",
          }}
        >
          {pres.company_name}
        </span>
      )}

      {/* Date */}
      <span
        className="font-mono text-xs flex-shrink-0"
        style={{ color: "#94A3B8", minWidth: 100, textAlign: "right" }}
      >
        {formatDate(pres.created_at)}
      </span>

      {/* Download button */}
      <a
        href={pres.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
        style={{
          background: "rgba(43,92,224,0.08)",
          color: "#2B5CE0",
          border: "1px solid rgba(43,92,224,0.20)",
          textDecoration: "none",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.14)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.08)")}
      >
        <Download size={11} />
        PDF
      </a>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PresentationsPage() {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [loading,        setLoading]       = useState(true);
  const [showModal,      setShowModal]     = useState(false);

  const [mainCategory, setMainCategory] = useState<"investment_cases" | "client_presentations">("investment_cases");
  const [region,       setRegion]       = useState<"chile" | "latam">("chile");
  const [fundFilter,   setFundFilter]   = useState("All");

  // ── Fetch from DB ───────────────────────────────────────────────────────────
  const fetchPresentations = useCallback(async () => {
    try {
      const res  = await fetch("/api/presentations");
      const data = await res.json() as { presentations?: Presentation[] };
      setPresentations(data.presentations ?? []);
    } catch {
      setPresentations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPresentations(); }, [fetchPresentations]);

  // ── Filter controls ─────────────────────────────────────────────────────────
  function handleMainCategory(cat: "investment_cases" | "client_presentations") {
    setMainCategory(cat);
    setFundFilter("All");
  }
  function handleRegion(r: "chile" | "latam") {
    setRegion(r);
    setFundFilter("All");
  }

  // ── After atomic save: prepend to list, close modal, update filters ─────────
  function handleSaved(pres: Presentation) {
    setPresentations((prev) => [pres, ...prev]);
    setShowModal(false);
    setMainCategory(pres.category as "investment_cases" | "client_presentations");
    setRegion(pres.region as "chile" | "latam");
    setFundFilter("All");
  }

  // ── Filtered list ───────────────────────────────────────────────────────────
  const displayFiles = presentations.filter((p) => {
    if (p.category !== mainCategory) return false;
    if (p.region   !== region)       return false;
    if (mainCategory === "client_presentations" && fundFilter !== "All") {
      return p.company_name === fundFilter;
    }
    return true;
  });

  const fundOptions = region === "chile" ? CHILE_FUNDS : LATAM_FUNDS;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }}
          />
          <p className="text-sm font-mono" style={{ color: "#64748B" }}>
            Loading presentations…
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Modal — rendered at top level so it sits above everything */}
      {showModal && (
        <CreatePresentationModal
          defaultCategory={mainCategory}
          defaultRegion={region}
          onSave={handleSaved}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="max-w-[1200px] mx-auto px-6 py-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
              Presentations
            </h1>
            <p className="text-xs mt-1" style={{ color: "#64748B" }}>
              Research reports and investor presentations
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowModal(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "7px 15px", borderRadius: 8,
                background: "#2B5CE0", border: "none",
                color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Upload size={14} />
              Upload
            </button>
            <span
              className="text-xs font-mono px-2 py-1 rounded"
              style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
            >
              {displayFiles.length} document{displayFiles.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* ── Level 1: Category tabs ──────────────────────────────────────── */}
        <div
          className="flex items-center gap-1 p-1 rounded-lg mb-4"
          style={{
            background: "rgba(15,23,42,0.04)",
            border: "1px solid rgba(15,23,42,0.08)",
            width: "fit-content",
          }}
        >
          {([
            { key: "investment_cases",     label: "Investment Cases" },
            { key: "client_presentations", label: "Client Presentations" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleMainCategory(key)}
              className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
              style={{
                background: mainCategory === key ? "rgba(43,92,224,0.10)" : "transparent",
                color:      mainCategory === key ? "#1E3A8A" : "#64748B",
                border:     mainCategory === key ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Level 2: Region + fund filter ──────────────────────────────── */}
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          <div
            className="flex items-center gap-1 p-0.5 rounded-md"
            style={{ background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.08)" }}
          >
            {(["chile", "latam"] as const).map((r) => (
              <button
                key={r}
                onClick={() => handleRegion(r)}
                className="px-4 py-1 rounded text-xs font-semibold transition-all"
                style={{
                  background: region === r ? "#fff" : "transparent",
                  color:      region === r ? "#1E3A8A" : "#64748B",
                  boxShadow:  region === r ? "0 1px 3px rgba(15,23,42,0.10)" : "none",
                }}
              >
                {r === "chile" ? "Chile" : "LATAM"}
              </button>
            ))}
          </div>

          {mainCategory === "client_presentations" && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>Fund:</span>
              <select
                value={fundFilter}
                onChange={(e) => setFundFilter(e.target.value)}
                style={{
                  padding: "4px 10px", borderRadius: 6, background: "#F8FAFF",
                  border: "1px solid rgba(15,23,42,0.10)", color: "#334155",
                  fontSize: 12, cursor: "pointer", outline: "none",
                }}
              >
                <option value="All">All Funds</option>
                {fundOptions.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* ── File list ──────────────────────────────────────────────────── */}
        {displayFiles.length === 0 ? (
          <div
            className="card flex flex-col items-center justify-center py-20 gap-4"
            style={{ color: "#94A3B8" }}
          >
            <FileText size={40} style={{ opacity: 0.3 }} />
            <p className="text-sm">No documents found for this selection.</p>
          </div>
        ) : (
          <div className="card overflow-hidden" style={{ padding: 0 }}>
            {displayFiles.map((pres) => (
              <FileRow key={pres.id} pres={pres} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
