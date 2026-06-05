"use client";

import { useState, useEffect, useMemo } from "react";
import type { ModelPayload, ModelRow } from "@/app/api/quant/model/route";

// ── Design tokens (match app) ─────────────────────────────────────────────────
const TEXT1 = "#0F172A";
const TEXT2 = "#64748B";
const TEXT3 = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";
const BLUE   = "#2B5CE0";
const GREEN  = "#15803D";
const RED    = "#B91C1C";
const GROUP_HDR_BG = "#EEF2FD";
const GROUP_BORDER = "rgba(43,92,224,0.22)";

// ── Types ─────────────────────────────────────────────────────────────────────
type SortCol =
  | "ticker" | "name" | "industry" | "score" | "owMle" | "owMsc"
  | "value" | "pe" | "dy" | "quality" | "roe" | "deltaRoe" | "top20";
type SortDir = "asc" | "desc";
type Tab = "suggested" | "funds" | "off";

const TABS: { key: Tab; label: string }[] = [
  { key: "suggested", label: "Suggested Portfolio" },
  { key: "funds",     label: "Funds & Indices" },
  { key: "off",       label: "Off-Index" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

// Factor scores are stored 0–1 where SMALLER is better. Invert to a 0–100
// "goodness" percentage so 0 (best) reads as 100%.
function goodnessPct(raw: number | null): number | null {
  return raw == null ? null : (1 - raw) * 100;
}

// ── Score bar (expects a 0–100 goodness value) ─────────────────────────────────
function ScoreBar({ value, main = false }: { value: number | null; main?: boolean }) {
  if (value == null) return <span style={{ color: TEXT3 }}>—</span>;
  const pct   = Math.max(0, Math.min(100, value));
  const color = pct > 70 ? "#1E40AF" : pct > 40 ? "#3B82F6" : pct > 20 ? "#93C5FD" : "#CBD5E1";
  const textColor = pct > 70 ? "#1E3A8A" : pct > 40 ? "#1D4ED8" : TEXT2;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 78 }}>
      <div style={{ flex: 1, height: main ? 4 : 3, background: "rgba(15,23,42,0.07)", borderRadius: 2, overflow: "hidden", minWidth: 34 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: main ? 11.5 : 11, fontWeight: main ? 800 : 700, color: textColor, minWidth: 32, textAlign: "right" }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ── OW/UW cell (overweight stored as a decimal) ────────────────────────────────
function OwCell({ v }: { v: number | null }) {
  if (v == null || v === 0) {
    return (
      <span style={{
        fontSize: 9, fontWeight: 700, color: TEXT3, letterSpacing: "0.04em",
        background: "rgba(15,23,42,0.04)", border: `1px solid ${BORDER}`,
        borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
      }}>
        Off-Index
      </span>
    );
  }
  const pct = v * 100;
  const pos = pct > 0;
  return (
    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700, color: pos ? GREEN : RED }}>
      {pos ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
      <path d="M3 3.5L5 1.5L7 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 6.5L5 8.5L7 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  return dir === "desc" ? (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: BLUE, flexShrink: 0 }}>
      <path d="M3 3.5L5 5.5L7 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: BLUE, flexShrink: 0 }}>
      <path d="M3 6.5L5 4.5L7 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Leaf header cell ──────────────────────────────────────────────────────────
const ROW1_H = 31;
function Lh({
  label, col, sortCol, sortDir, onSort, align = "left", minWidth,
  rowSpan, top = 0, zIndex = 2, groupStart = false, sortable = true,
}: {
  label: string; col?: SortCol; sortCol: SortCol; sortDir: SortDir;
  onSort: (c: SortCol) => void; align?: "left" | "right" | "center"; minWidth?: number;
  rowSpan?: number; top?: number; zIndex?: number; groupStart?: boolean; sortable?: boolean;
}) {
  const clickable = sortable && col != null;
  const active = clickable && sortCol === col;
  return (
    <th
      rowSpan={rowSpan}
      onClick={clickable ? () => onSort(col!) : undefined}
      style={{
        padding:       "7px 10px",
        textAlign:     align,
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: "0.06em",
        color:         active ? BLUE : TEXT2,
        textTransform: "uppercase",
        whiteSpace:    "nowrap",
        cursor:        clickable ? "pointer" : "default",
        borderBottom:  `1px solid ${BORDER}`,
        background:    "rgba(248,250,255,0.95)",
        borderLeft:    groupStart ? `2px solid ${GROUP_BORDER}` : undefined,
        minWidth,
        userSelect:    "none",
        position:      "sticky",
        top,
        zIndex,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }}>
        {align === "right" && clickable && <SortIcon active={active} dir={sortDir} />}
        <span>{label}</span>
        {align !== "right" && clickable && <SortIcon active={active} dir={sortDir} />}
      </div>
    </th>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function Chip({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6,
      background: accent ? "rgba(43,92,224,0.07)" : "rgba(15,23,42,0.04)",
      border: `1px solid ${accent ? "rgba(43,92,224,0.15)" : BORDER}`,
    }}>
      <span style={{ fontSize: 10, color: accent ? BLUE : TEXT2, fontWeight: 600, letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent ? BLUE : TEXT1, fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
    </div>
  );
}

// ── Sort key extraction ───────────────────────────────────────────────────────
function sortValue(r: ModelRow, col: SortCol): number | string | null {
  switch (col) {
    case "ticker":   return r.ticker;
    case "name":     return r.name;
    case "industry": return r.industry;
    case "score":    return goodnessPct(r.score);     // higher goodness = better
    case "value":    return goodnessPct(r.value);
    case "quality":  return goodnessPct(r.quality);
    case "owMle":    return r.owMle;
    case "owMsc":    return r.owMsc;
    case "pe":       return r.pe;
    case "dy":       return r.dy;
    case "roe":      return r.roe;
    case "deltaRoe": return r.deltaRoe;
    case "top20":    return r.top20 ? 1 : 0;
    default:         return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function QuantModelTable() {
  const [data,         setData]         = useState<ModelPayload | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [sortCol,      setSortCol]      = useState<SortCol>("top20");  // default: In portfolio first
  const [sortDir,      setSortDir]      = useState<SortDir>("desc");
  const [tab,          setTab]          = useState<Tab>("suggested");
  const [industry,     setIndustry]     = useState<string>("all");
  const [search,       setSearch]       = useState("");
  const [onlyPortfolio, setOnlyPortfolio] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const url = selectedDate ? `/api/quant/model?date=${selectedDate}` : "/api/quant/model";
    fetch(url)
      .then(r => r.json())
      .then((d: ModelPayload) => {
        setData(d);
        if (!selectedDate && d.date) setSelectedDate(d.date);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedDate]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const industries = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.rows.map(r => r.industry).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;

    // Tab filter (fund/index membership)
    if (tab === "funds")    rows = rows.filter(r => r.funds.length > 0);
    else if (tab === "off") rows = rows.filter(r => r.funds.length === 0);

    // Show only the suggested portfolio (top20 names)
    if (onlyPortfolio) rows = rows.filter(r => r.top20);

    if (industry !== "all") rows = rows.filter(r => r.industry === industry);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.ticker.toLowerCase().includes(q) ||
        (r.name ?? "").toLowerCase().includes(q)
      );
    }

    return [...rows].sort((a, b) => {
      // Default view: In portfolio (top20) first, then best score (smaller raw = better)
      if (sortCol === "top20") {
        if (a.top20 !== b.top20) return a.top20 ? -1 : 1;
        return (a.score ?? Infinity) - (b.score ?? Infinity);
      }
      const av = sortValue(a, sortCol);
      const bv = sortValue(b, sortCol);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [data, tab, industry, search, sortCol, sortDir, onlyPortfolio]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, inPortfolio: 0, avgScore: null as number | null };
    const rows = data.rows;
    const inPortfolio = rows.filter(r => r.top20).length;
    const goods = rows.map(r => goodnessPct(r.score)).filter((v): v is number => v !== null);
    const avgScore = goods.length ? goods.reduce((a, b) => a + b, 0) / goods.length : null;
    return { total: rows.length, inPortfolio, avgScore };
  }, [data]);

  // ── Sort handler ─────────────────────────────────────────────────────────
  function handleSort(col: SortCol) {
    if (col === sortCol) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  // ── Cell renderers ────────────────────────────────────────────────────────
  function pctCell(v: number | null, colored = false) {
    if (v == null) return <span style={{ color: TEXT3 }}>—</span>;
    const color = colored ? (v > 0 ? "#059669" : v < 0 ? "#DC2626" : TEXT2) : TEXT1;
    return (
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color, fontWeight: colored ? 700 : 500 }}>
        {colored && v > 0 ? "+" : ""}{v.toFixed(1)}%
      </span>
    );
  }

  function numCell(v: number | null, suffix = "") {
    if (v == null) return <span style={{ color: TEXT3 }}>—</span>;
    return (
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT2 }}>
        {v.toFixed(1)}{suffix}
      </span>
    );
  }

  const thProps = { sortCol, sortDir, onSort: handleSort };
  const subTop  = ROW1_H;

  return (
    <div style={{ marginTop: 28 }}>

      {/* ── Section header ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 22, background: BLUE, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0 }}>
              Quant Model
            </h2>
          </div>
          <p style={{ fontSize: 12, color: TEXT2, margin: "3px 0 0 13px" }}>
            Multi-factor ranking — LatAm Equities
          </p>
        </div>

        {/* Date selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: TEXT2, fontWeight: 600, whiteSpace: "nowrap" }}>Modelo al:</span>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              padding:      "5px 28px 5px 10px",
              borderRadius: 7,
              border:       `1px solid ${BORDER}`,
              background:   "#F8FAFF",
              fontSize:     12,
              fontFamily:   "JetBrains Mono, monospace",
              fontWeight:   600,
              color:        TEXT1,
              cursor:       "pointer",
              outline:      "none",
              appearance:   "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat:   "no-repeat",
              backgroundPosition: "right 9px center",
            }}
          >
            {(data?.dates ?? []).map(d => (
              <option key={d} value={d}>{fmtDate(d)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Card ────────────────────────────────────────────────────────────── */}
      <div style={{
        background:   "#FFFFFF",
        border:       `1px solid ${BORDER}`,
        borderRadius: 12,
        overflow:     "hidden",
        boxShadow:    "0 1px 4px rgba(15,23,42,0.06)",
      }}>

        {/* ── Tabs (segmented control) ──────────────────────────────────────── */}
        <div style={{ padding: "12px 16px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: "rgba(15,23,42,0.04)", border: `1px solid ${BORDER}`, borderRadius: 9, padding: 3 }}>
            {TABS.map(t => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding:      "6px 14px",
                    fontSize:     11.5,
                    fontWeight:   active ? 700 : 600,
                    color:        active ? "#FFFFFF" : TEXT2,
                    background:   active ? BLUE : "transparent",
                    border:       "none",
                    borderRadius: 7,
                    cursor:       "pointer",
                    whiteSpace:   "nowrap",
                    transition:   "all 0.12s",
                    boxShadow:    active ? "0 1px 3px rgba(43,92,224,0.30)" : "none",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* Portfolio-only toggle */}
          <button
            type="button"
            onClick={() => setOnlyPortfolio(v => !v)}
            aria-pressed={onlyPortfolio}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          6,
              padding:      "6px 13px",
              fontSize:     11.5,
              fontWeight:   onlyPortfolio ? 700 : 600,
              color:        onlyPortfolio ? "#FFFFFF" : BLUE,
              background:   onlyPortfolio ? BLUE : "rgba(43,92,224,0.07)",
              border:       `1px solid ${onlyPortfolio ? BLUE : "rgba(43,92,224,0.25)"}`,
              borderRadius: 8,
              cursor:       "pointer",
              whiteSpace:   "nowrap",
              transition:   "all 0.12s",
              boxShadow:    onlyPortfolio ? "0 1px 3px rgba(43,92,224,0.30)" : "none",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 1.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 9.7 3.8 11.4l.6-3.6L1.8 5.3l3.6-.5L7 1.5z"
                fill={onlyPortfolio ? "#FFFFFF" : "none"}
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
            Portfolio only
          </button>
        </div>

        {/* ── Controls + Stats bar ──────────────────────────────────────────── */}
        <div style={{
          padding:      "12px 16px",
          borderBottom: `1px solid ${BORDER}`,
          display:      "flex",
          alignItems:   "center",
          gap:          10,
          flexWrap:     "wrap",
        }}>
          {/* Stats */}
          <Chip label="Names" value={stats.total} />
          <Chip label="In portfolio" value={stats.inPortfolio} accent />
          {stats.avgScore != null && (
            <Chip label="Avg score" value={`${Math.round(stats.avgScore)}%`} />
          )}

          <div style={{ flex: 1 }} />

          {/* Industry filter */}
          <select
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            style={{
              padding:      "5px 28px 5px 10px",
              borderRadius: 7,
              border:       `1px solid ${BORDER}`,
              background:   "#F8FAFF",
              fontSize:     11,
              color:        TEXT1,
              cursor:       "pointer",
              outline:      "none",
              appearance:   "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat:   "no-repeat",
              backgroundPosition: "right 9px center",
              minWidth: 140,
            }}
          >
            <option value="all">All industries</option>
            {industries.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: TEXT3, pointerEvents: "none" }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ticker or name…"
              style={{
                padding:      "5px 10px 5px 26px",
                borderRadius: 7,
                border:       `1px solid ${BORDER}`,
                background:   "#F8FAFF",
                fontSize:     11,
                color:        TEXT1,
                outline:      "none",
                width:        180,
              }}
            />
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div style={{ overflowX: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "48px 0", gap: 10, color: TEXT2, fontSize: 13 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid rgba(43,92,224,0.15)`, borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
              Loading model data…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: TEXT3, fontSize: 13 }}>
              No names in this view
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                {/* ── Row 1: top-level columns + group labels ── */}
                <tr>
                  <th rowSpan={2} style={{ padding: "7px 10px", fontSize: 10, fontWeight: 700, color: TEXT2, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${BORDER}`, background: "rgba(248,250,255,0.95)", textAlign: "center", position: "sticky", top: 0, zIndex: 3, width: 36 }}>#</th>
                  <Lh label="Ticker"     col="ticker"   {...thProps} rowSpan={2} minWidth={90}  zIndex={3} />
                  <Lh label="Name"       col="name"     {...thProps} rowSpan={2} minWidth={150} zIndex={3} />
                  <Lh label="Industry"   col="industry" {...thProps} rowSpan={2} minWidth={130} zIndex={3} />
                  <Lh label="Country"    {...thProps} rowSpan={2} minWidth={80} sortable={false} />
                  <Lh label="Score"      col="score"    {...thProps} rowSpan={2} minWidth={110} zIndex={3} />
                  <Lh label="% OW/UW MLE" col="owMle"   {...thProps} rowSpan={2} minWidth={96} align="right" zIndex={3} />
                  <Lh label="% OW/UW MSC" col="owMsc"   {...thProps} rowSpan={2} minWidth={96} align="right" zIndex={3} />

                  {/* Group labels */}
                  <th colSpan={3} style={{ background: GROUP_HDR_BG, color: BLUE, textAlign: "center", padding: "5px 10px", fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase", borderBottom: `1px solid ${GROUP_BORDER}`, borderLeft: `2px solid ${GROUP_BORDER}`, position: "sticky", top: 0, zIndex: 2, whiteSpace: "nowrap" }}>
                    Value
                  </th>
                  <th colSpan={3} style={{ background: GROUP_HDR_BG, color: BLUE, textAlign: "center", padding: "5px 10px", fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase", borderBottom: `1px solid ${GROUP_BORDER}`, borderLeft: `2px solid ${GROUP_BORDER}`, position: "sticky", top: 0, zIndex: 2, whiteSpace: "nowrap" }}>
                    Quality
                  </th>
                </tr>

                {/* ── Row 2: sub-columns under each group ── */}
                <tr>
                  <Lh label="Value"  col="value"    {...thProps} top={subTop} minWidth={104} groupStart />
                  <Lh label="PE"     col="pe"       {...thProps} top={subTop} minWidth={58} align="right" />
                  <Lh label="DY"     col="dy"       {...thProps} top={subTop} minWidth={58} align="right" />
                  <Lh label="Quality" col="quality" {...thProps} top={subTop} minWidth={104} groupStart />
                  <Lh label="ROE"    col="roe"      {...thProps} top={subTop} minWidth={62} align="right" />
                  <Lh label="ΔROE"   col="deltaRoe" {...thProps} top={subTop} minWidth={66} align="right" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const isTop = row.top20;
                  return (
                    <tr
                      key={row.ticker}
                      style={{
                        borderLeft: isTop ? `3px solid ${BLUE}` : "3px solid transparent",
                        background: isTop ? "#EFF6FF" : idx % 2 === 0 ? "#FFFFFF" : "rgba(248,250,255,0.5)",
                        transition: "background 0.08s",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isTop ? "#DBEAFE" : "rgba(43,92,224,0.04)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isTop ? "#EFF6FF" : idx % 2 === 0 ? "#FFFFFF" : "rgba(248,250,255,0.5)"}
                    >
                      {/* # */}
                      <td style={{ padding: "7px 10px", textAlign: "center", color: TEXT3, fontSize: 11, fontFamily: "JetBrains Mono, monospace", borderBottom: `1px solid ${BORDER}` }}>
                        {idx + 1}
                      </td>

                      {/* Ticker */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: isTop ? BLUE : TEXT1 }}>
                            {row.ticker}
                          </span>
                          {isTop && (
                            <span style={{ fontSize: 9, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", padding: "1px 5px", borderRadius: 4, background: "rgba(43,92,224,0.12)", color: BLUE, border: "1px solid rgba(43,92,224,0.22)", letterSpacing: "0.06em" }}>
                              TOP
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Name */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}`, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12, color: TEXT1 }}>{row.name ?? <span style={{ color: TEXT3 }}>—</span>}</span>
                      </td>

                      {/* Industry */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}`, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.industry ? (
                          <span style={{ fontSize: 10, fontWeight: 600, color: TEXT2, padding: "2px 7px", borderRadius: 4, background: "rgba(15,23,42,0.05)", border: `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>
                            {row.industry}
                          </span>
                        ) : <span style={{ color: TEXT3 }}>—</span>}
                      </td>

                      {/* Country (placeholder) */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}`, color: TEXT3, fontSize: 11, textAlign: "center" }}>
                        —
                      </td>

                      {/* Score */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}` }}>
                        <ScoreBar value={goodnessPct(row.score)} />
                      </td>

                      {/* OW/UW MLE */}
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        <OwCell v={row.owMle} />
                      </td>

                      {/* OW/UW MSC */}
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        <OwCell v={row.owMsc} />
                      </td>

                      {/* ── Value group ── */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}`, borderLeft: `2px solid ${GROUP_BORDER}` }}>
                        <ScoreBar value={goodnessPct(row.value)} main />
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {numCell(row.pe, "x")}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {pctCell(row.dy)}
                      </td>

                      {/* ── Quality group ── */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}`, borderLeft: `2px solid ${GROUP_BORDER}` }}>
                        <ScoreBar value={goodnessPct(row.quality)} main />
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {pctCell(row.roe)}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {pctCell(row.deltaRoe, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        {!loading && filtered.length > 0 && (
          <div style={{ padding: "8px 16px", borderTop: `1px solid ${BORDER}`, background: "rgba(248,250,255,0.6)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: TEXT3 }}>
              {filtered.length} name{filtered.length !== 1 ? "s" : ""}{industry !== "all" ? ` in ${industry}` : ""}{search ? ` matching "${search}"` : ""}
            </span>
            {data?.date && (
              <span style={{ fontSize: 10, color: TEXT3, fontFamily: "JetBrains Mono, monospace" }}>
                Signal date: {fmtDate(data.date)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
