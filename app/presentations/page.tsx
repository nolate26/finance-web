"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { FileText, Download, Upload, Trash2, Search } from "lucide-react";
import CreatePresentationModal, { type Presentation } from "@/components/CreatePresentationModal";
import type { FichaRow as Ficha } from "@/app/api/fichas/route";
import { useIsAdmin, useIsSignedIn } from "@/lib/useIsAdmin";
import { countryName } from "@/lib/countryNames";
import { quarterKey } from "@/lib/quarters";

// ── Constants ─────────────────────────────────────────────────────────────────

type MainCategory = "investment_cases" | "fichas" | "client_presentations" | "sell_side";

const MAIN_TABS: { key: MainCategory; label: string }[] = [
  { key: "investment_cases",     label: "Investment Cases"     },
  { key: "fichas",               label: "Fichas"               },
  { key: "client_presentations", label: "Client Presentations" },
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

// ── Shared bits ───────────────────────────────────────────────────────────────

const PILL_WRAP: React.CSSProperties = { background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.08)", width: "fit-content" };

function pillStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "#fff" : "transparent",
    color:      active ? "#001EAF" : "rgba(13,13,56,0.62)",
    boxShadow:  active ? "0 1px 3px rgba(13,13,56,0.10)" : "none",
    whiteSpace: "nowrap",
  };
}

function PdfIcon() {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg"
      style={{ background: "rgba(248,72,94,0.08)", border: "1px solid rgba(248,72,94,0.15)" }}
    >
      <FileText size={16} style={{ color: "#F8485E" }} />
    </div>
  );
}

function PdfLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
      style={{ background: "rgba(32,68,220,0.08)", color: "#2044DC", border: "1px solid rgba(32,68,220,0.20)", textDecoration: "none" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.14)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.08)")}
    >
      <Download size={11} /> PDF
    </a>
  );
}

// ── Presentation row ──────────────────────────────────────────────────────────

function FileRow({ pres }: { pres: Presentation }) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 border-b border-patria-dark-blue/[0.06] last:border-0 transition-colors"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.02)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <PdfIcon />

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

      <PdfLink href={pres.file_url} />
    </div>
  );
}

// ── Ficha row ─────────────────────────────────────────────────────────────────

function FichaRowView({
  ficha, isAdmin, deleting, onDelete,
}: {
  ficha: Ficha; isAdmin: boolean; deleting: boolean; onDelete: (f: Ficha) => void;
}) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 border-b border-patria-dark-blue/[0.06] last:border-0 transition-colors"
      style={{ opacity: deleting ? 0.45 : 1 }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.02)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <PdfIcon />

      {/* Company + title */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "#0D0D38" }}>{ficha.company_name}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(13,13,56,0.62)" }}>
          {ficha.title}
          {ficha.description && <span style={{ color: "rgba(13,13,56,0.40)" }}> · {ficha.description}</span>}
        </p>
      </div>

      {/* Ticker BBG */}
      <span className="flex-shrink-0 text-xs font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.45)", whiteSpace: "nowrap" }}>
        {ficha.ticker}
      </span>

      {/* Quarter del informe — el dato que ordena las fichas */}
      <span
        className="flex-shrink-0 text-xs font-bold font-secondary tabular-nums px-2 py-0.5 rounded-md"
        style={{ background: "rgba(13,13,56,0.06)", color: "#0D0D38", border: "1px solid rgba(13,13,56,0.14)", whiteSpace: "nowrap", letterSpacing: "0.02em" }}
      >
        {ficha.quarter_label}
      </span>

      {/* Country badge */}
      <span
        className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md"
        style={{ background: "rgba(32,68,220,0.07)", color: "#2044DC", border: "1px solid rgba(32,68,220,0.18)", whiteSpace: "nowrap" }}
      >
        {countryName(ficha.country)}
      </span>

      {/* Date */}
      <span className="font-secondary tabular-nums text-xs flex-shrink-0" style={{ color: "rgba(13,13,56,0.28)", minWidth: 90, textAlign: "right" }}>
        {formatDate(ficha.created_at)}
      </span>

      <PdfLink href={ficha.file_url} />

      {/* Delete (admin) */}
      {isAdmin && (
        <button
          type="button"
          title="Delete ficha"
          disabled={deleting}
          onClick={() => onDelete(ficha)}
          className="flex-shrink-0 inline-flex items-center justify-center rounded-md transition-all"
          style={{ width: 30, height: 30, background: "transparent", border: "1px solid rgba(248,72,94,0.18)", color: "#F8485E", cursor: deleting ? "not-allowed" : "pointer" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(248,72,94,0.08)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PresentationsPage() {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [fichas,        setFichas]        = useState<Ficha[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  // Subir es de todo el equipo; borrar, sólo admin.
  const isAdmin   = useIsAdmin();
  const canUpload = useIsSignedIn();

  const [mainCategory, setMainCategory] = useState<MainCategory>("investment_cases");
  // For investment_cases / sell_side
  const [subFilter,    setSubFilter]    = useState<string>("chile");
  // For client_presentations — two-level: region → fund
  const [cpRegion,     setCpRegion]     = useState<"chile" | "latam">("chile");
  const [cpFund,       setCpFund]       = useState<string>("All");
  // For fichas — country (code) + quarter + free text over company / ticker / title
  const [fichaCountry, setFichaCountry] = useState<string>("All");
  const [fichaQuarter, setFichaQuarter] = useState<string>("All");
  const [fichaSearch,  setFichaSearch]  = useState("");
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [deleteError,  setDeleteError]  = useState<string | null>(null);
  // Un error de la API NO debe verse como "no hay documentos": son dos cosas
  // distintas y confundirlas manda a buscar el problema al lado equivocado.
  const [fichasError,  setFichasError]  = useState<string | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [pres, fic] = await Promise.all([
      fetch("/api/presentations")
        .then((r) => r.json() as Promise<{ presentations?: Presentation[] }>)
        .catch(() => ({} as { presentations?: Presentation[] })),
      fetch("/api/fichas")
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((d as { error?: string }).error ?? `HTTP ${r.status}`);
          return d as { fichas?: Ficha[] };
        })
        .catch((e: unknown) => ({ error: e instanceof Error ? e.message : "Failed to load fichas" })),
    ]);
    setPresentations(pres.presentations ?? []);
    if ("error" in fic) { setFichas([]); setFichasError(fic.error as string); }
    else                { setFichas(fic.fichas ?? []); setFichasError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Tab switch ────────────────────────────────────────────────────────────
  function handleMainCategory(cat: MainCategory) {
    setMainCategory(cat);
    setSubFilter("chile");   // for investment_cases / sell_side
    setCpRegion("chile");    // for client_presentations
    setCpFund("All");
    setFichaCountry("All");
    setFichaQuarter("All");
    setFichaSearch("");
    setDeleteError(null);
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

  function handleFichaSaved(f: Ficha) {
    // Una ficha viva por ticker: la nueva reemplaza a la anterior de esa empresa,
    // igual que hizo el servidor.
    setFichas((prev) => [f, ...prev.filter((x) => x.ticker.toUpperCase() !== f.ticker.toUpperCase())]);
    setShowModal(false);
    setMainCategory("fichas");
    setFichaCountry(f.country);
    setFichaQuarter("All");
    setFichaSearch("");
  }

  // ── Delete ficha (admin) ──────────────────────────────────────────────────
  async function handleDeleteFicha(f: Ficha) {
    if (!window.confirm(`Delete the ${f.quarter_label} ficha of ${f.company_name} (${f.ticker})? The PDF will be removed from storage.`)) return;
    setDeletingId(f.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/fichas/${encodeURIComponent(f.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(error ?? `HTTP ${res.status}`);
      }
      setFichas((prev) => prev.filter((x) => x.id !== f.id));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete ficha");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Filtered lists ────────────────────────────────────────────────────────
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

  // Países presentes en las fichas, con conteo, ordenados por nombre visible.
  const fichaCountries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of fichas) counts.set(f.country, (counts.get(f.country) ?? 0) + 1);
    return [...counts.entries()]
      .map(([code, n]) => ({ code, label: countryName(code), n }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [fichas]);

  // Quarters presentes, del más nuevo al más viejo, con su conteo.
  const fichaQuarters = useMemo(() => {
    const counts = new Map<string, { label: string; key: number; n: number }>();
    for (const f of fichas) {
      const prev = counts.get(f.quarter_label);
      if (prev) prev.n++;
      else counts.set(f.quarter_label, { label: f.quarter_label, key: quarterKey(f.fiscal_year, f.quarter), n: 1 });
    }
    return [...counts.values()].sort((a, b) => b.key - a.key);
  }, [fichas]);

  const displayFichas = useMemo(() => {
    const q = fichaSearch.trim().toLowerCase();
    return fichas.filter((f) => {
      if (fichaCountry !== "All" && f.country !== fichaCountry) return false;
      if (fichaQuarter !== "All" && f.quarter_label !== fichaQuarter) return false;
      if (q && !(
        f.company_name.toLowerCase().includes(q) ||
        f.ticker.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [fichas, fichaCountry, fichaQuarter, fichaSearch]);

  // Agrupadas por país (sólo cuando se ve "All"); dentro del país, por empresa.
  const fichaGroups = useMemo(() => {
    const byCountry = new Map<string, Ficha[]>();
    for (const f of displayFichas) {
      const arr = byCountry.get(f.country) ?? [];
      arr.push(f);
      byCountry.set(f.country, arr);
    }
    return [...byCountry.entries()]
      .map(([code, rows]) => ({
        code,
        label: countryName(code),
        // Quarter más nuevo primero; dentro del quarter, por empresa.
        rows: [...rows].sort((a, b) =>
          quarterKey(b.fiscal_year, b.quarter) - quarterKey(a.fiscal_year, a.quarter) ||
          a.company_name.localeCompare(b.company_name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [displayFichas]);

  const isFichas = mainCategory === "fichas";
  const docCount = isFichas ? displayFichas.length : displayFiles.length;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80dvh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(32,68,220,0.15)", borderTopColor: "#2044DC" }} />
          <p className="text-sm font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.62)" }}>Loading presentations…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Un solo uploader: abre en la categoría de la pestaña activa, pero el admin
          puede cambiarla adentro (Fichas incluida). */}
      {showModal && canUpload && (
        <CreatePresentationModal
          defaultCategory={mainCategory}
          defaultRegion={subFilter}
          onSave={handleSaved}
          onSaveFicha={handleFichaSaved}
          existingFichas={fichas}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="max-w-[1200px] mx-auto page-shell">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>Presentations</h1>
            <p style={{ fontSize: 12, marginTop: 5, color: "rgba(13,13,56,0.62)", fontWeight: 500, letterSpacing: "0.01em" }}>Research reports · Company fichas · Investor presentations</p>
          </div>
          <div className="flex items-center gap-3">
            {canUpload && (
              <button
                onClick={() => setShowModal(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 15px", borderRadius: 8, background: "#2044DC", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                <Upload size={14} /> Upload
              </button>
            )}
            <span className="text-xs font-secondary tabular-nums px-2 py-1 rounded" style={{ background: "rgba(32,68,220,0.08)", color: "#2044DC" }}>
              {docCount} document{docCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* ── Level 1: Category tabs ──────────────────────────────────── */}
        <div className="tab-rail flex items-center mb-4" style={{ gap: 2, padding: "3px", borderRadius: 10, background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.08)", width: "fit-content" }}>
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
                  whiteSpace: "nowrap",
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
                <div className="flex items-center gap-1 p-0.5 rounded-md" style={PILL_WRAP}>
                  {(["chile", "latam"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleCpRegion(r)}
                      className="px-4 py-1 rounded text-xs font-semibold transition-all"
                      style={pillStyle(cpRegion === r)}
                    >
                      {r === "chile" ? "Chile" : "LatAm"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: fund buttons for the selected region */}
              <div className="tab-rail flex items-center gap-1 p-0.5 rounded-md" style={PILL_WRAP}>
                <button
                  onClick={() => setCpFund("All")}
                  className="px-3 py-1 rounded text-xs font-semibold transition-all"
                  style={pillStyle(cpFund === "All")}
                >
                  All
                </button>
                {(cpRegion === "chile" ? CP_CHILE_FUNDS : CP_LATAM_FUNDS).map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setCpFund(f.value)}
                    className="px-3 py-1 rounded text-xs font-semibold transition-all"
                    style={pillStyle(cpFund === f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Investment Cases & Sell Side → Chile / LatAm */}
          {(mainCategory === "investment_cases" || mainCategory === "sell_side") && (
            <div className="flex items-center gap-1 p-0.5 rounded-md" style={PILL_WRAP}>
              {[{ value: "chile", label: "Chile" }, { value: "latam", label: "LatAm" }].map((r) => (
                <button
                  key={r.value}
                  onClick={() => setSubFilter(r.value)}
                  className="px-4 py-1 rounded text-xs font-semibold transition-all"
                  style={pillStyle(subFilter === r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {/* Fichas → country chips + quarter chips + search */}
          {isFichas && (
            <>
              {/* Row 1: país */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(13,13,56,0.45)", minWidth: 52 }}>Country</span>
                <div className="tab-rail flex items-center gap-1 p-0.5 rounded-md" style={PILL_WRAP}>
                  <button
                    onClick={() => setFichaCountry("All")}
                    className="px-3 py-1 rounded text-xs font-semibold transition-all"
                    style={pillStyle(fichaCountry === "All")}
                  >
                    All
                  </button>
                  {fichaCountries.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setFichaCountry(c.code)}
                      className="px-3 py-1 rounded text-xs font-semibold transition-all"
                      style={pillStyle(fichaCountry === c.code)}
                    >
                      {c.label}
                      <span className="font-secondary tabular-nums" style={{ marginLeft: 5, opacity: 0.55, fontWeight: 500 }}>{c.n}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: quarter del informe + buscador */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(13,13,56,0.45)", minWidth: 52 }}>Quarter</span>
                <div className="tab-rail flex items-center gap-1 p-0.5 rounded-md" style={PILL_WRAP}>
                  <button
                    onClick={() => setFichaQuarter("All")}
                    className="px-3 py-1 rounded text-xs font-semibold transition-all"
                    style={pillStyle(fichaQuarter === "All")}
                  >
                    All
                  </button>
                  {fichaQuarters.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => setFichaQuarter(q.label)}
                      className="px-3 py-1 rounded text-xs font-semibold font-secondary tabular-nums transition-all"
                      style={pillStyle(fichaQuarter === q.label)}
                    >
                      {q.label}
                      <span className="font-secondary tabular-nums" style={{ marginLeft: 5, opacity: 0.55, fontWeight: 500 }}>{q.n}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 px-2.5 rounded-md" style={{ background: "#F5F7FD", border: "1px solid rgba(13,13,56,0.12)", height: 30, minWidth: 220, flex: "1 1 220px", maxWidth: 360 }}>
                  <Search size={13} style={{ color: "rgba(13,13,56,0.40)", flexShrink: 0 }} />
                  <input
                    value={fichaSearch}
                    onChange={(e) => setFichaSearch(e.target.value)}
                    placeholder="Company, ticker or title…"
                    className="font-secondary"
                    style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "#0D0D38" }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {deleteError && (
          <div className="mb-4 px-3 py-2 rounded-md text-xs" style={{ background: "rgba(248,72,94,0.05)", border: "1px solid rgba(248,72,94,0.18)", color: "#F8485E" }}>
            {deleteError}
          </div>
        )}

        {/* ── File list ────────────────────────────────────────────────── */}
        {isFichas ? (
          fichasError ? (
            <div className="card flex flex-col items-center justify-center py-16 gap-3 text-center" style={{ color: "#F8485E" }}>
              <FileText size={34} style={{ opacity: 0.4 }} />
              <p className="text-sm font-semibold">Could not load fichas.</p>
              <p className="text-xs font-secondary" style={{ color: "rgba(13,13,56,0.62)", maxWidth: 460 }}>{fichasError}</p>
            </div>
          ) : displayFichas.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-20 gap-4" style={{ color: "rgba(13,13,56,0.45)" }}>
              <FileText size={40} style={{ opacity: 0.3 }} />
              <p className="text-sm">{fichas.length === 0 ? "No fichas uploaded yet." : "No fichas match this selection."}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {fichaGroups.map((g) => (
                <div key={g.code}>
                  {/* Section header: sólo aporta cuando hay más de un país en pantalla */}
                  {fichaCountry === "All" && (
                    <div className="flex items-baseline gap-2 mb-2 px-1">
                      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(13,13,56,0.62)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{g.label}</span>
                      <span className="font-secondary tabular-nums" style={{ fontSize: 11, color: "rgba(13,13,56,0.40)" }}>{g.rows.length}</span>
                    </div>
                  )}
                  <div className="card overflow-hidden" style={{ padding: 0 }}>
                    {g.rows.map((f) => (
                      <FichaRowView
                        key={f.id}
                        ficha={f}
                        isAdmin={isAdmin}
                        deleting={deletingId === f.id}
                        onDelete={handleDeleteFicha}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : displayFiles.length === 0 ? (
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
