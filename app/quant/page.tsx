"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, ReferenceArea,
} from "recharts";
import type { DeepDivePayload } from "@/app/api/companies/[ticker]/route";
import type { UniverseItem } from "@/app/api/analysis/universe/route";
import { computeBands } from "@/lib/stats";

// ── Design tokens ─────────────────────────────────────────────────────────────
const PALETTE  = ["#2563EB", "#DC2626", "#16A34A", "#D97706", "#7C3AED", "#0891B2"];
const TEXT1    = "#0F172A";
const TEXT2    = "#64748B";
const TEXT3    = "#94A3B8";
const BLUE     = "#2563EB";
const BORDER   = "rgba(15,23,42,0.08)";
const CARD: React.CSSProperties = {
  background:   "#FFFFFF",
  border:       `1px solid ${BORDER}`,
  borderRadius: 12,
  boxShadow:    "0 1px 4px rgba(15,23,42,0.06)",
};

const MAX_COMPANIES = 5;

// ── Metric config ─────────────────────────────────────────────────────────────
type MetricKey = "evEbitda" | "pe" | "pbv" | "price" | "conEbitda" | "conNI";

interface MetricCfg {
  key:   MetricKey;
  label: string;
  fmt:   (v: number) => string;
  note?: string;
}

const METRICS: MetricCfg[] = [
  { key: "evEbitda",  label: "EV / EBITDA",   fmt: v => v.toFixed(1) + "x" },
  { key: "pe",        label: "P / E",          fmt: v => v.toFixed(1) + "x" },
  { key: "pbv",       label: "P / BV",         fmt: v => v.toFixed(2) + "x" },
  { key: "price",     label: "Price",          fmt: v => v.toFixed(1), note: "Base 100 at first data point" },
  { key: "conEbitda", label: "EBITDA Est",     fmt: v => v.toLocaleString("en-US", { maximumFractionDigits: 0 }), note: "Bloomberg 1FY consensus — local currency thousands" },
  { key: "conNI",     label: "NI Est",         fmt: v => v.toLocaleString("en-US", { maximumFractionDigits: 0 }), note: "Bloomberg 1FY consensus — local currency thousands" },
];

// ── Time period filter ────────────────────────────────────────────────────────
type TimePeriod = "all" | "10y" | "5y" | "3y" | "1y" | "6m" | "3m";

const TIME_PERIODS: { key: TimePeriod; label: string }[] = [
  { key: "all", label: "All" },
  { key: "10y", label: "10Y" },
  { key: "5y",  label: "5Y"  },
  { key: "3y",  label: "3Y"  },
  { key: "1y",  label: "1Y"  },
  { key: "6m",  label: "6M"  },
  { key: "3m",  label: "3M"  },
];

const PERIOD_MONTHS: Record<Exclude<TimePeriod, "all">, number> = {
  "10y": 120, "5y": 60, "3y": 36, "1y": 12, "6m": 6, "3m": 3,
};

function getCutoff(period: TimePeriod): string | null {
  if (period === "all") return null;
  const d = new Date();
  d.setMonth(d.getMonth() - PERIOD_MONTHS[period]);
  return d.toISOString().slice(0, 10);
}

// ── Data extraction ───────────────────────────────────────────────────────────
function getPoints(payload: DeepDivePayload, metric: MetricKey): { date: string; v: number | null }[] {
  switch (metric) {
    case "evEbitda": return payload.valuationHistory.map(p => ({ date: p.date, v: p.evEbitdaFwd }));
    case "pe":       return payload.valuationHistory.map(p => ({ date: p.date, v: p.peFwd }));
    case "pbv":      return payload.valuationHistory.map(p => ({ date: p.date, v: p.pbv }));
    case "price": {
      const pts = payload.priceVsEarnings;
      if (!pts.length) return [];
      const base = pts[0].pxLast;
      return pts.map(p => ({ date: p.date, v: base > 0 ? (p.pxLast / base) * 100 : null }));
    }
    case "conEbitda": {
      const all = payload.consensusEstimates
        .filter(c => c.metric === "EBITDA")
        .sort((a, b) => a.date.localeCompare(b.date));
      const byDate = new Map<string, number>();
      for (const c of all) {
        if (!byDate.has(c.date) || c.period === "1FY") byDate.set(c.date, c.value);
      }
      return Array.from(byDate.entries()).map(([date, v]) => ({ date, v: v / 1_000 }));
    }
    case "conNI": {
      const all = payload.consensusEstimates
        .filter(c => c.metric === "NET_INCOME")
        .sort((a, b) => a.date.localeCompare(b.date));
      const byDate = new Map<string, number>();
      for (const c of all) {
        if (!byDate.has(c.date) || c.period === "1FY") byDate.set(c.date, c.value);
      }
      return Array.from(byDate.entries()).map(([date, v]) => ({ date, v: v / 1_000 }));
    }
  }
}

function buildChartData(
  companies: CompanyState[],
  metric:    MetricKey,
  cutoff:    string | null,
): Record<string, unknown>[] {
  const allDates = new Set<string>();
  const datasets: { ticker: string; pts: Map<string, number | null> }[] = [];

  for (const c of companies) {
    if (!c.data) continue;
    const pts = getPoints(c.data, metric);
    const m   = new Map<string, number | null>();
    for (const p of pts) {
      if (!cutoff || p.date >= cutoff) { m.set(p.date, p.v); allDates.add(p.date); }
    }
    datasets.push({ ticker: c.ticker, pts: m });
  }

  const months  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtDate = (iso: string) => {
    const d = new Date(iso + "T12:00:00");
    return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
  };

  return Array.from(allDates).sort().map(date => {
    const row: Record<string, unknown> = { date, label: fmtDate(date) };
    for (const ds of datasets) row[ds.ticker] = ds.pts.get(date) ?? null;
    return row;
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CompanyState {
  ticker:  string;
  name:    string;
  data:    DeepDivePayload | null;
  loading: boolean;
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({
  active, payload, label, fmt,
}: {
  active?:  boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?:   string;
  fmt:      (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p: { value: number | null }) => p.value != null);
  if (!items.length) return null;
  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: "10px 14px", boxShadow: "0 4px 16px rgba(15,23,42,0.10)", minWidth: 160,
    }}>
      <p style={{ fontSize: 11, color: TEXT2, marginBottom: 8, fontFamily: "JetBrains Mono, monospace" }}>
        {label}
      </p>
      {items.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} style={{ fontSize: 12, color: p.color, fontFamily: "JetBrains Mono, monospace", marginBottom: 3 }}>
          <span style={{ fontWeight: 700 }}>
            {p.name.replace(/ Equity$/i, "").replace(/ MM$/i, "").trim()}
          </span>
          {"  "}{fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shortName(ticker: string) {
  return ticker.replace(/ Equity$/i, "").replace(/ MM$/i, "").trim();
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const [universe,     setUniverse]     = useState<UniverseItem[]>([]);
  const [univLoading,  setUnivLoading]  = useState(true);
  const [search,       setSearch]       = useState("");
  const [companies,    setCompanies]    = useState<CompanyState[]>([]);
  const [activeMetric, setActiveMetric] = useState<MetricKey>("evEbitda");
  const [timePeriod,   setTimePeriod]   = useState<TimePeriod>("5y");
  const [bandsFor,     setBandsFor]     = useState<string | null>(null);

  // Load universe
  useEffect(() => {
    fetch("/api/analysis/universe")
      .then(r => r.json())
      .then((d: { companies?: UniverseItem[] }) => setUniverse(d.companies ?? []))
      .catch(() => {})
      .finally(() => setUnivLoading(false));
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return universe;
    return universe.filter(c =>
      c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [universe, search]);

  const selectedSet = useMemo(() => new Set(companies.map(c => c.ticker)), [companies]);

  const toggleCompany = useCallback((item: UniverseItem) => {
    setCompanies(prev => {
      if (prev.find(c => c.ticker === item.ticker)) {
        return prev.filter(c => c.ticker !== item.ticker);
      }
      if (prev.length >= MAX_COMPANIES) return prev;

      fetch(`/api/companies/${encodeURIComponent(item.ticker)}`)
        .then(r => r.json())
        .then((d: DeepDivePayload) =>
          setCompanies(cur =>
            cur.map(c => c.ticker === item.ticker ? { ...c, data: d, loading: false } : c)
          )
        )
        .catch(() =>
          setCompanies(cur =>
            cur.map(c => c.ticker === item.ticker ? { ...c, loading: false } : c)
          )
        );

      return [...prev, { ticker: item.ticker, name: item.name, data: null, loading: true }];
    });
  }, []);

  const removeCompany = useCallback((ticker: string) => {
    setCompanies(prev => prev.filter(c => c.ticker !== ticker));
    setBandsFor(prev => prev === ticker ? null : prev);
  }, []);

  const cutoff     = useMemo(() => getCutoff(timePeriod), [timePeriod]);
  const chartData  = useMemo(
    () => buildChartData(companies.filter(c => !c.loading && c.data), activeMetric, cutoff),
    [companies, activeMetric, cutoff],
  );
  const activeCfg   = METRICS.find(m => m.key === activeMetric)!;
  const someLoading = companies.some(c => c.loading);

  // ── Median ± 1σ bands — computed from a single company's own time series ──
  const bandsColorIdx = bandsFor ? companies.findIndex(c => c.ticker === bandsFor) : -1;
  const bandsColor    = bandsColorIdx >= 0 ? PALETTE[bandsColorIdx] : "#64748B";

  const bands = useMemo(() => {
    if (!bandsFor || chartData.length === 0) return null;
    const raw = chartData
      .map(row => row[bandsFor])
      .filter((v): v is number => typeof v === "number" && isFinite(v));
    if (raw.length < 3) return null;
    return computeBands(raw);
  }, [bandsFor, chartData]);

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div className="max-w-[1600px] mx-auto px-6 py-6">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0 }}>
            Analysis
          </h1>
          <p style={{ fontSize: 12, color: TEXT2, marginTop: 4 }}>
            Multi-company comparison — valuation multiples, price performance, and consensus revisions
          </p>
        </div>

        {/* ── Two-column layout ────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>

          {/* ── LEFT: Company list ─────────────────────────────────────────── */}
          <div style={{ width: 252, flexShrink: 0 }}>
            <div style={{
              ...CARD,
              display:       "flex",
              flexDirection: "column",
              overflow:      "hidden",
              height:        "calc(100vh - 170px)",
              maxHeight:     720,
            }}>

              {/* List header */}
              <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>
                  Companies
                  {companies.length > 0 && (
                    <span style={{ marginLeft: 8, fontWeight: 500, color: TEXT3, textTransform: "none", letterSpacing: 0 }}>
                      {companies.length}/{MAX_COMPANIES}
                    </span>
                  )}
                </p>
                {/* Search */}
                <div style={{ position: "relative" }}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: TEXT3 }}>
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search…"
                    style={{
                      width:        "100%",
                      padding:      "6px 10px 6px 28px",
                      borderRadius: 7,
                      border:       `1px solid ${BORDER}`,
                      outline:      "none",
                      fontSize:     12,
                      color:        TEXT1,
                      background:   "#F8FAFF",
                      boxSizing:    "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Scrollable company list */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {univLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(37,99,235,0.15)", borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
                  </div>
                ) : filtered.length === 0 ? (
                  <p style={{ textAlign: "center", padding: 24, color: TEXT3, fontSize: 12 }}>No results</p>
                ) : (
                  filtered.map(item => {
                    const idx     = companies.findIndex(c => c.ticker === item.ticker);
                    const isSel   = idx >= 0;
                    const color   = isSel ? PALETTE[idx] : undefined;
                    const disabled = !isSel && companies.length >= MAX_COMPANIES;
                    return (
                      <button
                        key={item.ticker}
                        onClick={() => !disabled && toggleCompany(item)}
                        style={{
                          width:       "100%",
                          padding:     "9px 16px",
                          border:      "none",
                          borderBottom: `1px solid ${BORDER}`,
                          borderLeft:   `3px solid ${isSel ? (color ?? BLUE) : "transparent"}`,
                          background:   isSel ? `${color ?? BLUE}09` : "transparent",
                          textAlign:    "left",
                          cursor:       disabled ? "not-allowed" : "pointer",
                          opacity:      disabled ? 0.38 : 1,
                          display:      "flex",
                          alignItems:   "center",
                          gap:          10,
                          transition:   "background 0.08s",
                        }}
                        onMouseEnter={e => {
                          if (!isSel && !disabled) (e.currentTarget as HTMLElement).style.background = "rgba(15,23,42,0.03)";
                        }}
                        onMouseLeave={e => {
                          if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent";
                        }}
                      >
                        {/* Color dot */}
                        <div style={{
                          width:    8,
                          height:   8,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background:  isSel ? (color ?? BLUE) : "rgba(15,23,42,0.10)",
                        }} />

                        {/* Text */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize:   12,
                            fontWeight: 700,
                            color:      isSel ? (color ?? BLUE) : TEXT1,
                            fontFamily: "JetBrains Mono, monospace",
                            lineHeight: 1.2,
                          }}>
                            {shortName(item.ticker)}
                          </div>
                          <div style={{
                            fontSize:     10,
                            color:        TEXT3,
                            lineHeight:   1.2,
                            marginTop:    2,
                            overflow:     "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace:   "nowrap",
                          }}>
                            {item.name}
                          </div>
                        </div>

                        {/* Loading spinner when selected + loading */}
                        {isSel && companies[idx]?.loading && (
                          <div style={{ marginLeft: "auto", width: 12, height: 12, borderRadius: "50%", border: `1.5px solid ${color}30`, borderTopColor: color, animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Charts ──────────────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Empty state */}
            {companies.length === 0 && (
              <div style={{
                ...CARD,
                display:         "flex",
                flexDirection:   "column",
                alignItems:      "center",
                justifyContent:  "center",
                padding:         "72px 24px",
                gap:             14,
                height:          "calc(100vh - 170px)",
                maxHeight:       720,
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: "rgba(37,99,235,0.07)", border: `1px solid rgba(37,99,235,0.13)`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                }}>
                  📈
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: TEXT1, margin: 0 }}>Select companies to compare</p>
                <p style={{ fontSize: 12, color: TEXT2, textAlign: "center", maxWidth: 380, margin: 0, lineHeight: 1.65 }}>
                  Pick up to {MAX_COMPANIES} companies from the list to visualize their EV/EBITDA,
                  P/E, P/BV, price performance, and Bloomberg consensus estimate revisions over time.
                </p>
              </div>
            )}

            {/* Chart card — only shown when at least one company is selected */}
            {companies.length > 0 && (
              <div style={{ ...CARD, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>

                {/* Selected chips */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {companies.map((c, i) => {
                    const isBands = bandsFor === c.ticker;
                    return (
                      <div key={c.ticker} style={{
                        display:    "flex",
                        alignItems: "center",
                        gap:        6,
                        padding:    "4px 10px",
                        borderRadius: 7,
                        background: `${PALETTE[i]}11`,
                        border:     `1.5px solid ${isBands ? PALETTE[i] : `${PALETTE[i]}45`}`,
                      }}>
                        {c.loading
                          ? <div style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${PALETTE[i]}40`, borderTopColor: PALETTE[i], animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                          : <div style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE[i], flexShrink: 0 }} />
                        }
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: PALETTE[i] }}>
                          {shortName(c.ticker)}
                        </span>
                        {/* Per-company σ bands toggle */}
                        {!c.loading && c.data && (
                          <button
                            onClick={() => setBandsFor(prev => prev === c.ticker ? null : c.ticker)}
                            title="Show historical median ± 1σ"
                            style={{
                              background:   isBands ? `${PALETTE[i]}22` : "none",
                              border:       `1px solid ${isBands ? `${PALETTE[i]}70` : "transparent"}`,
                              color:        isBands ? PALETTE[i] : `${PALETTE[i]}80`,
                              fontSize:     10,
                              fontWeight:   700,
                              fontFamily:   "JetBrains Mono, monospace",
                              padding:      "1px 5px",
                              borderRadius: 4,
                              cursor:       "pointer",
                              lineHeight:   1.4,
                            }}
                          >
                            σ
                          </button>
                        )}
                        <button
                          onClick={() => removeCompany(c.ticker)}
                          style={{ background: "none", border: "none", color: PALETTE[i], fontSize: 15, lineHeight: 1, padding: 0, cursor: "pointer", opacity: 0.6 }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Metric tabs */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {METRICS.map(m => (
                    <button
                      key={m.key}
                      onClick={() => setActiveMetric(m.key)}
                      style={{
                        padding:      "5px 14px",
                        borderRadius: 7,
                        border:       "1px solid",
                        borderColor:  activeMetric === m.key ? BLUE : BORDER,
                        background:   activeMetric === m.key ? "rgba(37,99,235,0.09)" : "transparent",
                        color:        activeMetric === m.key ? BLUE : TEXT2,
                        fontSize:     12,
                        fontWeight:   activeMetric === m.key ? 700 : 500,
                        cursor:       "pointer",
                        whiteSpace:   "nowrap",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Time filter */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

                  {/* Time period segmented control */}
                  <div style={{
                    display:      "flex",
                    gap:          2,
                    background:   "rgba(15,23,42,0.04)",
                    borderRadius: 8,
                    padding:      3,
                    border:       `1px solid ${BORDER}`,
                  }}>
                    {TIME_PERIODS.map(tp => (
                      <button
                        key={tp.key}
                        onClick={() => setTimePeriod(tp.key)}
                        style={{
                          padding:      "4px 10px",
                          borderRadius: 6,
                          border:       "none",
                          background:   timePeriod === tp.key ? "#FFFFFF" : "transparent",
                          color:        timePeriod === tp.key ? TEXT1    : TEXT3,
                          fontWeight:   timePeriod === tp.key ? 700      : 500,
                          fontSize:     11,
                          cursor:       "pointer",
                          boxShadow:    timePeriod === tp.key ? "0 1px 3px rgba(15,23,42,0.10)" : "none",
                          transition:   "all 0.12s",
                        }}
                      >
                        {tp.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note line */}
                {activeCfg.note && (
                  <p style={{ fontSize: 10, color: TEXT3, fontStyle: "italic", margin: "-10px 0 -4px" }}>
                    {activeCfg.note}
                  </p>
                )}

                {/* Chart */}
                {chartData.length === 0 ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
                    {someLoading ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, color: TEXT2, fontSize: 13 }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(37,99,235,0.18)", borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
                        Loading data…
                      </div>
                    ) : (
                      <span style={{ color: TEXT3, fontSize: 13 }}>No data available for this metric</span>
                    )}
                  </div>
                ) : (
                  <div style={{ height: 340, position: "relative" }}>

                    {/* Discount / Premium badge when bands active */}
                    {bands && (() => {
                      const lastRow = chartData.at(-1);
                      const cur = lastRow ? (lastRow[bandsFor!] as number | null) ?? null : null;
                      if (cur == null || !isFinite(bands.median) || bands.median === 0) return null;
                      const pct = (cur / bands.median - 1) * 100;
                      const isDiscount = pct < 0;
                      return (
                        <div style={{ position: "absolute", top: 0, right: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, pointerEvents: "none" }}>
                          <div style={{
                            padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            fontFamily: "JetBrains Mono, monospace",
                            background: isDiscount ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)",
                            color:      isDiscount ? "#059669" : "#DC2626",
                            border: `1px solid ${isDiscount ? "rgba(5,150,105,0.20)" : "rgba(220,38,38,0.20)"}`,
                          }}>
                            {isDiscount ? "Discount" : "Premium"}: {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                          </div>
                          <div style={{ fontSize: 11, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
                            vs. {timePeriod === "all" ? "all-time" : timePeriod} median
                          </div>
                        </div>
                      );
                    })()}

                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 6, right: 52, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: TEXT3, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          tick={{ fill: TEXT3, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={v => activeCfg.fmt(v)}
                          width={56}
                        />
                        <Tooltip content={(props) => <ChartTooltip {...props} fmt={activeCfg.fmt} />} />
                        <Legend
                          wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                          formatter={v => <span style={{ color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>{shortName(String(v))}</span>}
                        />

                        {/* ±1 SD band — must come before Line elements */}
                        {bands && (
                          <ReferenceArea
                            y1={bands.lower}
                            y2={bands.upper}
                            fill={`${bandsColor}18`}
                            stroke={`${bandsColor}35`}
                            strokeDasharray="4 4"
                          />
                        )}

                        {/* Median reference line */}
                        {bands && (
                          <ReferenceLine
                            y={bands.median}
                            stroke="#94A3B8"
                            strokeDasharray="5 3"
                            label={{
                              value: `Md ${activeCfg.fmt(bands.median)}`,
                              position: "insideTopRight",
                              fontSize: 11,
                              fill: "#94A3B8",
                              fontFamily: "JetBrains Mono, monospace",
                              fontWeight: 600,
                            }}
                          />
                        )}

                        {companies
                          .filter(c => !c.loading && c.data)
                          .map((c, i) => (
                            <Line
                              key={c.ticker}
                              type="monotone"
                              dataKey={c.ticker}
                              name={c.ticker}
                              stroke={PALETTE[i]}
                              strokeWidth={2.5}
                              dot={false}
                              activeDot={{ r: 4, fill: PALETTE[i] }}
                              connectNulls={false}
                              isAnimationActive={false}
                            />
                          ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
