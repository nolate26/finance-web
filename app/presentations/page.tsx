"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Download, Upload } from "lucide-react";
import CreatePresentationModal, { type Presentation } from "@/components/CreatePresentationModal";
import { useIsAdmin } from "@/lib/useIsAdmin";

// ── Constants ─────────────────────────────────────────────────────────────────

type MainCategory = "investment_cases" | "client_presentations" | "sell_side";

const MAIN_TABS: { key: MainCategory; label: string }[] = [
  { key: "client_presentations", label: "Client Presentations" },
  { key: "investment_cases",     label: "Investment Cases"     },
  { key: "sell_side",            label: "Sell Side"            },
];

// Fund options for "client_presentations" sub-filter
const CLIENT_FUND_FILTERS = [
  { value: "Pionero/MRV",                              label: "Pionero / MRV",                              group: "Chile" },
  { value: "Orange",                                   label: "Orange",                                     group: "Chile" },
  { value: "LA Equities (LX) / LA Small Cap (LX)",     label: "LA Equities (LX) / LA Small Cap (LX)",       group: "LatAm" },
  { value: "Glory",                                    label: "Glory",                                      group: "LatAm" },
  { value: "Mercer",                                   label: "Mercer",                                     group: "LatAm" },
] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Funds per region (values must match what's stored in DB as `region` for client_presentations)
const CP_CHILE_FUNDS = CLIENT_FUND_FILTERS.filter((f) => f.group === "Chile");
const CP_LATAM_FUNDS = CLIENT_FUND_FILTERS.filter((f) => f.group === "LatAm");

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({ pres }: { pres: Presentation }) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 border-b border-patria-dark-blue/[0.06] last:border-0 transition-colors"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.02)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {/* PDF icon */}
      <div
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg"
        style={{ background: "rgba(248,72,94,0.08)", border: "1px solid rgba(248,72,94,0.15)" }}
      >
        <FileText size={16} style={{ color: "#F8485E" }} />
      </div>

      {/* Title + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "#0D0D38" }}>{pres.title}</p>
        {pres.description && (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(13,13,56,0.62)" }}>{pres.description}</p>
        )}
      </div>

      {/* Origin badge */}
      <span
        className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md"
        style={
          pres.is_sell_side
            ? { background: "rgba(255,107,6,0.08)", color: "#FF6B06", border: "1px solid rgba(255,107,6,0.20)", whiteSpace: "nowrap" }
            : { background: "rgba(32,68,220,0.07)", color: "#2044DC",  border: "1px solid rgba(32,68,220,0.18)", whiteSpace: "nowrap" }
        }
      >
        {pres.is_sell_side ? "Sell Side" : "Moneda"}
      </span>

      {/* Company chip */}
      {pres.company_name && (
        <span className="flex-shrink-0 text-xs font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.45)", whiteSpace: "nowrap" }}>
          {pres.company_name}
        </span>
      )}

      {/* Date */}
      <span className="font-secondary tabular-nums text-xs flex-shrink-0" style={{ color: "rgba(13,13,56,0.28)", minWidth: 90, textAlign: "right" }}>
        {formatDate(pres.created_at)}
      </span>

      {/* Download button */}
      <a
        href={pres.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
        style={{ background: "rgba(32,68,220,0.08)", color: "#2044DC", border: "1px solid rgba(32,68,220,0.20)", textDecoration: "none" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.14)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.08)")}
      >
        <Download size={11} /> PDF
      </a>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PresentationsPage() {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const isAdmin = useIsAdmin();

  const [mainCategory, setMainCategory] = useState<MainCategory>("client_presentations");
  // For investment_cases / sell_side
  const [subFilter,    setSubFilter]    = useState<string>("chile");
  // For client_presentations — two-level: region → fund
  const [cpRegion,     setCpRegion]     = useState<"chile" | "latam">("chile");
  const [cpFund,       setCpFund]       = useState<string>("All");

  // ── Fetch ─────────────────────────────────────────────────────────────────
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

  // ── Tab switch ────────────────────────────────────────────────────────────
  function handleMainCategory(cat: MainCategory) {
    setMainCategory(cat);
    setSubFilter("chile");   // for investment_cases / sell_side
    setCpRegion("chile");    // for client_presentations
    setCpFund("All");
  }

  function handleCpRegion(r: "chile" | "latam") {
    setCpRegion(r);
    setCpFund("All");   // reset fund when switching region
  }

  // ── After save ────────────────────────────────────────────────────────────
  function handleSaved(pres: Presentation) {
    setPresentations((prev) => [pres, ...prev]);
    setShowModal(false);
    const cat = pres.category as MainCategory;
    setMainCategory(cat);
    if (cat === "client_presentations") {
      const isChile = CP_CHILE_FUNDS.some((f) => f.value === pres.region);
      setCpRegion(isChile ? "chile" : "latam");
      setCpFund(pres.region);
    } else {
      setSubFilter(pres.region);
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const activeCpFundValues: string[] = (cpRegion === "chile" ? CP_CHILE_FUNDS : CP_LATAM_FUNDS).map((f) => f.value);

  const displayFiles = presentations.filter((p) => {
    if (p.category !== mainCategory) return false;
    if (mainCategory === "client_presentations") {
      if (!activeCpFundValues.includes(p.region)) return false;
      if (cpFund !== "All" && p.region !== cpFund) return false;
    } else {
      if (p.region !== subFilter) return false;
    }
    return true;
  });

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(32,68,220,0.15)", borderTopColor: "#2044DC" }} />
          <p className="text-sm font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.62)" }}>Loading presentations…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {showModal && isAdmin && (
        <CreatePresentationModal
          defaultCategory={mainCategory}
          defaultRegion={mainCategory === "client_presentations" ? subFilter : subFilter}
          onSave={handleSaved}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="max-w-[1200px] mx-auto px-6 py-6">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>Presentations</h1>
            <p style={{ fontSize: 12, marginTop: 5, color: "rgba(13,13,56,0.62)", fontWeight: 500, letterSpacing: "0.01em" }}>Research reports · Investor presentations</p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setShowModal(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 15px", borderRadius: 8, background: "#2044DC", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                <Upload size={14} /> Upload
              </button>
            )}
            <span className="text-xs font-secondary tabular-nums px-2 py-1 rounded" style={{ background: "rgba(32,68,220,0.08)", color: "#2044DC" }}>
              {displayFiles.length} document{displayFiles.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* ── Level 1: Category tabs ──────────────────────────────────── */}
        <div className="flex items-center mb-4" style={{ gap: 2, padding: "3px", borderRadius: 10, background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.08)", width: "fit-content" }}>
          {MAIN_TABS.map(({ key, label }) => {
            const active = mainCategory === key;
            return (
              <button
                key={key}
                onClick={() => handleMainCategory(key)}
                className="px-5 py-1.5 rounded-lg text-sm transition-all"
                style={{
                  background: active ? "#FFFFFF"  : "transparent",
                  color:      active ? "#0D0D38"  : "rgba(13,13,56,0.62)",
                  border:     active ? "1px solid rgba(13,13,56,0.11)" : "1px solid transparent",
                  boxShadow:  active ? "0 1px 3px rgba(13,13,56,0.09)" : "none",
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Level 2: Sub-filter ─────────────────────────────────────── */}
        <div className="flex flex-col gap-2 mb-5">

          {/* Client Presentations → Chile/LatAm first, then funds inside */}
          {mainCategory === "client_presentations" && (
            <>
              {/* Row 1: Chile / LatAm region toggle */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-0.5 rounded-md" style={{ background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.08)" }}>
                  {(["chile", "latam"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleCpRegion(r)}
                      className="px-4 py-1 rounded text-xs font-semibold transition-all"
                      style={{ background: cpRegion === r ? "#fff" : "transparent", color: cpRegion === r ? "#001EAF" : "rgba(13,13,56,0.62)", boxShadow: cpRegion === r ? "0 1px 3px rgba(13,13,56,0.10)" : "none" }}
                    >
                      {r === "chile" ? "Chile" : "LatAm"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: fund buttons for the selected region */}
              <div className="flex items-center gap-1 p-0.5 rounded-md" style={{ background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.08)", width: "fit-content" }}>
                {/* "All" within this region */}
                <button
                  onClick={() => setCpFund("All")}
                  className="px-3 py-1 rounded text-xs font-semibold transition-all"
                  style={{ background: cpFund === "All" ? "#fff" : "transparent", color: cpFund === "All" ? "#001EAF" : "rgba(13,13,56,0.62)", boxShadow: cpFund === "All" ? "0 1px 3px rgba(13,13,56,0.10)" : "none" }}
                >
                  All
                </button>
                {(cpRegion === "chile" ? CP_CHILE_FUNDS : CP_LATAM_FUNDS).map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setCpFund(f.value)}
                    className="px-3 py-1 rounded text-xs font-semibold transition-all"
                    style={{ background: cpFund === f.value ? "#fff" : "transparent", color: cpFund === f.value ? "#001EAF" : "rgba(13,13,56,0.62)", boxShadow: cpFund === f.value ? "0 1px 3px rgba(13,13,56,0.10)" : "none", whiteSpace: "nowrap" }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Investment Cases & Sell Side → Chile / LatAm */}
          {mainCategory !== "client_presentations" && (
            <div className="flex items-center gap-1 p-0.5 rounded-md" style={{ background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.08)", width: "fit-content" }}>
              {[{ value: "chile", label: "Chile" }, { value: "latam", label: "LatAm" }].map((r) => (
                <button
                  key={r.value}
                  onClick={() => setSubFilter(r.value)}
                  className="px-4 py-1 rounded text-xs font-semibold transition-all"
                  style={{ background: subFilter === r.value ? "#fff" : "transparent", color: subFilter === r.value ? "#001EAF" : "rgba(13,13,56,0.62)", boxShadow: subFilter === r.value ? "0 1px 3px rgba(13,13,56,0.10)" : "none" }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── File list ────────────────────────────────────────────────── */}
        {displayFiles.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-20 gap-4" style={{ color: "rgba(13,13,56,0.45)" }}>
            <FileText size={40} style={{ opacity: 0.3 }} />
            <p className="text-sm">No documents found for this selection.</p>
          </div>
        ) : (
          <div className="card overflow-hidden" style={{ padding: 0 }}>
            {displayFiles.map((pres) => <FileRow key={pres.id} pres={pres} />)}
          </div>
        )}
      </div>
    </>
  );
}
