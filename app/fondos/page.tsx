"use client";

import { PATRIA, FONT_PRIMARY, FONT_SECONDARY } from "@/lib/patriaTheme";

import { useEffect, useState } from "react";
import CarteraView from "@/components/fondos/CarteraView";
import ReturnsDashboard from "@/components/fondos/ReturnsDashboard";
import PerformanceAttribution from "@/components/fondos/PerformanceAttribution";
import { RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";

type Region = "Chile" | "LATAM" | "Brazil";

const REGIONS: { key: Region; label: string }[] = [
  { key: "Chile",  label: "Chile"  },
  { key: "LATAM",  label: "LATAM"  },
  { key: "Brazil", label: "Brazil" },
];

// ── Fund → /api/rentabilidades query ─────────────────────────────────────────
// Chile/LATAM se identifican por page_num. Brasil por moneda (la página del PDF
// puede moverse; ojo que el grupo "BRL Returns" de la página USD NO es Brasil) y
// cada tabla por el fondo Patria que aparece en su dyn_1_label.
const FUND_RETURNS_QUERY: Record<string, string> = {
  Pionero: "page=1",
  Moneda_Renta_Variable: "page=2",
  Orange: "page=2",
  "Moneda_Latin_America_Small_Cap_(LX)": "page=3",
  "Moneda_Latin_America_Equities_(LX)": "page=4",
  Glory: "page=4",
  Mercer: "page=4",
  Patria_Long_Biased_Master_FIM: "currency=BRL&dyn1=LONG%20BIAS",
  Patria_LO_Master_FIA: "currency=BRL&dyn1=LONG%20ONLY",
};

// Brasil trae NAV, since-inception dinámicos, sigma, alpha y beta.
const EXTENDED_RETURNS = new Set(["Patria_Long_Biased_Master_FIM", "Patria_LO_Master_FIA"]);

// Nombre visible para fondos que aún no tienen cartera cargada (la API no los lista).
const FALLBACK_DISPLAY: Record<string, string> = {
  Patria_Long_Biased_Master_FIM: "Patria Long Biased",
  Patria_LO_Master_FIA: "Patria Long Only",
};

// ── Fund → Performance Attribution fund identifier (matches FUND column in CSV)
const FUND_ATTR_MAP: Record<string, string> = {
  Pionero: "PIONERO",
  Moneda_Renta_Variable: "MRV",
  Orange: "ORANGE",
  "Moneda_Latin_America_Small_Cap_(LX)": "MSC - Moneda Small Cap Latinoamérica",
  "Moneda_Latin_America_Equities_(LX)": "MLE",
  Glory: "GLORY",
  Mercer: "MERCER",
  // Brasil: aún sin datos; ajustar al valor de la columna FUND cuando se suba.
  Patria_Long_Biased_Master_FIM: "PATRIA LONG BIASED",
  Patria_LO_Master_FIA: "PATRIA LONG ONLY",
};

// ── Business-ordered fund names per region ────────────────────────────────────
// Todos tienen returns configurados, así que se listan aunque no tengan cartera.
const FUND_ORDER: Record<Region, string[]> = {
  Chile: ["Pionero", "Moneda_Renta_Variable", "Orange"],
  LATAM: ["Moneda_Latin_America_Equities_(LX)", "Moneda_Latin_America_Small_Cap_(LX)", "Glory", "Mercer"],
  Brazil: ["Patria_Long_Biased_Master_FIM", "Patria_LO_Master_FIA"],
};

interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  sector: string;
  macroSector: string;
  delta1W: number | null;
  delta1M: number | null;
}

interface FondoMeta {
  id: string;
  name: string;
  displayName: string;
  date: string;
  region: Region;
}

interface SectorSummary {
  sector: string;
  fundWeight: number;
  benchWeight: number;
  activeWeight: number;
  count: number;
}

interface FondoData extends FondoMeta {
  benchmark: string;
  cartera: CarteraRow[];
  sectorSummary: SectorSummary[];
  error?: string;
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
}

function latestSnapshotId(fondos: FondoMeta[], name: string): string {
  return fondos.filter((f) => f.name === name).sort((a, b) => b.date.localeCompare(a.date))[0]?.id ?? "";
}

export default function FondosPage() {
  const [fondosList, setFondosList] = useState<FondoMeta[]>([]);
  // El fondo se elige por nombre: puede tener returns sin tener cartera (Brasil).
  const [selectedFundName, setSelectedFundName] = useState<string>(FUND_ORDER.Chile[0]);
  // Snapshot de cartera del fondo elegido ("" si no tiene).
  const [selectedId, setSelectedId] = useState<string>("");
  const [fondoData, setFondoData] = useState<FondoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [region, setRegion] = useState<Region>("Chile");
  const [activeTab, setActiveTab] = useState<"cartera" | "returns" | "attribution">("returns");

  useEffect(() => {
    fetch("/api/fondos")
      .then((r) => r.json())
      .then((d: { fondos: FondoMeta[] }) => {
        setFondosList(d.fondos);
        // Most recent snapshot of the first business-ordered Chile fund
        setSelectedId(latestSnapshotId(d.fondos, FUND_ORDER.Chile[0]));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setFondoData(null);
      return;
    }
    setLoadingData(true);
    setFondoData(null);
    fetch(`/api/fondos?fondo=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((d: FondoData) => {
        setFondoData(d);
        setLoadingData(false);
      })
      .catch(() => setLoadingData(false));
  }, [selectedId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80dvh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(32,68,220,0.15)", borderTopColor: "#2044DC" }}
          />
          <p className="text-sm font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.62)" }}>Loading funds...</p>
        </div>
      </div>
    );
  }

  const selectedMeta = fondosList.find((f) => f.id === selectedId);
  const uniqueNames = FUND_ORDER[region];
  const displayNameOf = (name: string) =>
    fondosList.find((f) => f.name === name)?.displayName ?? FALLBACK_DISPLAY[name] ?? name.replace(/_/g, " ");
  const selectedDisplayName = displayNameOf(selectedFundName);
  const snapshots = fondosList
    .filter((f) => f.name === selectedFundName)
    .sort((a, b) => b.date.localeCompare(a.date));

  // snapshots is newest-first; idx 0 = most recent
  const currentSnapshotIdx = snapshots.findIndex((s) => s.id === selectedId);

  function handlePrevDate() {
    // "previous" = older = higher index
    const nextIdx = currentSnapshotIdx + 1;
    if (nextIdx < snapshots.length) setSelectedId(snapshots[nextIdx].id);
  }

  function handleNextDate() {
    // "next" = newer = lower index
    const nextIdx = currentSnapshotIdx - 1;
    if (nextIdx >= 0) setSelectedId(snapshots[nextIdx].id);
  }

  function selectFund(name: string) {
    setSelectedFundName(name);
    setSelectedId(latestSnapshotId(fondosList, name));
  }

  function switchRegion(r: Region) {
    setRegion(r);
    // First business-ordered fund in the new region, at its most recent snapshot
    selectFund(FUND_ORDER[r][0]);
  }

  return (
    <div className="max-w-[1600px] mx-auto page-shell">
      {/* Header */}
      {/* Regla 1 — título principal de la vista: banda dark-blue, Aptos Bold. */}
      <div
        className="flex items-start justify-between mb-6 gap-4 flex-wrap"
        style={{ background: PATRIA.darkBlue, borderRadius: 10, padding: "14px 18px" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: PATRIA.white, fontFamily: FONT_PRIMARY, textTransform: "uppercase", letterSpacing: "0.02em", lineHeight: 1.15, margin: 0 }}>
            Funds
          </h1>
          <p style={{ fontSize: 12, marginTop: 5, color: "rgba(255,255,255,0.72)", fontFamily: FONT_SECONDARY, fontWeight: 500, letterSpacing: "0.01em" }}>
            Portfolio composition · Deviation vs benchmark
          </p>
        </div>
        {selectedMeta && (
          <div className="source-pill source-pill--on-dark">
            <RefreshCw size={10} />
            Data as of {fmtDate(selectedMeta.date)}
          </div>
        )}
      </div>

      {/* Region tabs */}
      <div
        className="tab-rail flex items-center mb-4"
        style={{
          gap: 2, padding: "3px", borderRadius: 10,
          background: "rgba(13,13,56,0.04)",
          border: "1px solid rgba(13,13,56,0.08)",
          width: "fit-content",
        }}
      >
        {REGIONS.map(({ key: r, label }) => (
          <button
            key={r}
            onClick={() => switchRegion(r)}
            className="px-5 py-1.5 rounded-lg text-sm transition-all"
            style={{
              background: region === r ? "#FFFFFF"  : "transparent",
              color:      region === r ? "#0D0D38"  : "rgba(13,13,56,0.62)",
              border:     region === r ? "1px solid rgba(13,13,56,0.11)" : "1px solid transparent",
              boxShadow:  region === r ? "0 1px 3px rgba(13,13,56,0.09)" : "none",
              fontWeight: region === r ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Fund quick-select */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-medium" style={{ color: "rgba(13,13,56,0.45)" }}>Fund:</span>
        {uniqueNames.map((name) => {
          const displayName = displayNameOf(name);
          const isActive = selectedFundName === name;
          return (
            <button
              key={name}
              onClick={() => selectFund(name)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: isActive ? "rgba(32,68,220,0.10)" : "rgba(13,13,56,0.04)",
                color: isActive ? "#2044DC" : "rgba(13,13,56,0.62)",
                border: `1px solid ${isActive ? "rgba(32,68,220,0.25)" : "rgba(13,13,56,0.08)"}`,
              }}
            >
              {displayName}
            </button>
          );
        })}
      </div>

      {/* Internal tab navigation */}
      <div
        className="tab-rail flex items-center mb-5"
        style={{
          gap: 2, padding: "3px", borderRadius: 10,
          background: "rgba(13,13,56,0.04)",
          border: "1px solid rgba(13,13,56,0.08)",
          width: "fit-content",
        }}
      >
        {([
          { key: "returns",     label: "Fund Returns"           },
          { key: "cartera",     label: "Portfolio"              },
          { key: "attribution", label: "Performance Attribution" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-5 py-1.5 rounded-lg text-sm transition-all"
            style={{
              background: activeTab === key ? "#FFFFFF"  : "transparent",
              color:      activeTab === key ? "#0D0D38"  : "rgba(13,13,56,0.62)",
              border:     activeTab === key ? "1px solid rgba(13,13,56,0.11)" : "1px solid transparent",
              boxShadow:  activeTab === key ? "0 1px 3px rgba(13,13,56,0.09)" : "none",
              fontWeight: activeTab === key ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Returns tab ───────────────────────────────────────────────────────── */}
      {activeTab === "returns" && (
        <ReturnsDashboard
          query={FUND_RETURNS_QUERY[selectedFundName] ?? "page=1"}
          fundDisplayName={selectedDisplayName}
          fundKey={selectedFundName}
          columns={EXTENDED_RETURNS.has(selectedFundName) ? "extended" : "standard"}
        />
      )}

      {/* ── Cartera tab ───────────────────────────────────────────────────────── */}
      {activeTab === "cartera" && (
        <>
          {/* Error state */}
          {fondoData?.error && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5"
              style={{ background: "rgba(248,72,94,0.06)", border: "1px solid rgba(248,72,94,0.15)" }}
            >
              <AlertCircle size={16} style={{ color: "#F8485E" }} />
              <p className="text-sm" style={{ color: "#F8485E" }}>
                Could not load fund {fondoData.displayName}: {fondoData.error}
              </p>
            </div>
          )}

          {/* Loading */}
          {loadingData && (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-4">
                <div
                  className="w-8 h-8 rounded-full border-2 animate-spin"
                  style={{ borderColor: "rgba(32,68,220,0.15)", borderTopColor: "#2044DC" }}
                />
                <p className="text-sm font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.62)" }}>
                  Loading {selectedDisplayName}...
                </p>
              </div>
            </div>
          )}

          {fondoData && !loadingData && fondoData.cartera.length > 0 && (
            <>
              {/* Portfolio date stepper */}
              {snapshots.length > 1 && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-medium mr-1" style={{ color: "rgba(13,13,56,0.45)" }}>Portfolio snapshot:</span>
                  <div
                    className="flex items-center rounded-md overflow-hidden"
                    style={{ border: "1px solid rgba(13,13,56,0.10)", background: "#F5F7FD" }}
                  >
                    <button
                      onClick={handlePrevDate}
                      disabled={currentSnapshotIdx >= snapshots.length - 1}
                      title="Previous (older)"
                      className="flex items-center justify-center transition-colors"
                      style={{
                        width: 32, height: 32,
                        borderRight: "1px solid rgba(13,13,56,0.10)",
                        color: currentSnapshotIdx >= snapshots.length - 1 ? "rgba(13,13,56,0.28)" : "rgba(13,13,56,0.62)",
                        cursor: currentSnapshotIdx >= snapshots.length - 1 ? "not-allowed" : "pointer",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (currentSnapshotIdx < snapshots.length - 1)
                          (e.currentTarget as HTMLButtonElement).style.color = "#001EAF";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color =
                          currentSnapshotIdx >= snapshots.length - 1 ? "rgba(13,13,56,0.28)" : "rgba(13,13,56,0.62)";
                      }}
                    >
                      <ChevronLeft size={15} />
                    </button>

                    <select
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                      style={{
                        border: "none", outline: "none", background: "transparent",
                        fontSize: 13, fontWeight: 500, color: "#0D0D38",
                        padding: "0 10px", height: 32, cursor: "pointer",
                        appearance: "none", WebkitAppearance: "none",
                        minWidth: 140, textAlign: "center",
                      }}
                    >
                      {snapshots.map((s) => (
                        <option key={s.id} value={s.id}>{fmtDate(s.date)}</option>
                      ))}
                    </select>

                    <button
                      onClick={handleNextDate}
                      disabled={currentSnapshotIdx <= 0}
                      title="Next (newer)"
                      className="flex items-center justify-center transition-colors"
                      style={{
                        width: 32, height: 32,
                        borderLeft: "1px solid rgba(13,13,56,0.10)",
                        color: currentSnapshotIdx <= 0 ? "rgba(13,13,56,0.28)" : "rgba(13,13,56,0.62)",
                        cursor: currentSnapshotIdx <= 0 ? "not-allowed" : "pointer",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (currentSnapshotIdx > 0)
                          (e.currentTarget as HTMLButtonElement).style.color = "#001EAF";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color =
                          currentSnapshotIdx <= 0 ? "rgba(13,13,56,0.28)" : "rgba(13,13,56,0.62)";
                      }}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  <span className="text-xs font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.45)" }}>
                    {currentSnapshotIdx + 1} / {snapshots.length}
                  </span>
                </div>
              )}

              {/* Sector allocation + drill-down */}
              <CarteraView
                sectorSummary={fondoData.sectorSummary ?? []}
                cartera={fondoData.cartera}
                benchmark={fondoData.benchmark}
                fundName={selectedFundName}
              />
            </>
          )}

          {((fondoData && !loadingData && fondoData.cartera.length === 0 && !fondoData.error) || !selectedId) && (
            <div className="flex items-center justify-center h-64 card">
              <p style={{ color: "rgba(13,13,56,0.62)" }}>No portfolio data found for this fund</p>
            </div>
          )}
        </>
      )}

      {/* ── Attribution tab ───────────────────────────────────────────────────── */}
      {activeTab === "attribution" && (
        <PerformanceAttribution
          fundId={FUND_ATTR_MAP[selectedFundName]}
          displayName={selectedDisplayName}
        />
      )}
    </div>
  );
}
