"use client";

import { useState, useEffect, useMemo } from "react";
import type { ModelPayload, ModelRow } from "@/app/api/quant/model/route";

// ── Design tokens (match app) ─────────────────────────────────────────────────
const TEXT1 = "#0F172A";
const TEXT2 = "#64748B";
const TEXT3 = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";
const BLUE   = "#2B5CE0";

// ── Types ─────────────────────────────────────────────────────────────────────
type SortCol = keyof ModelRow;
type SortDir = "asc" | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateShort(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" });
}

function dash(v: unknown): boolean {
  return v === null || v === undefined;
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: TEXT3 }}>—</span>;
  const pct   = Math.max(0, Math.min(100, value));
  const color = pct > 70 ? "#1E40AF" : pct > 40 ? "#3B82F6" : pct > 20 ? "#93C5FD" : "#CBD5E1";
  const textColor = pct > 70 ? "#1E3A8A" : pct > 40 ? "#1D4ED8" : TEXT2;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 80 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(15,23,42,0.07)", borderRadius: 2, overflow: "hidden", minWidth: 36 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700, color: textColor, minWidth: 30, textAlign: "right" }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: SortDir }) {
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

// ── Column header ─────────────────────────────────────────────────────────────
function TH({
  label, col, sortCol, sortDir, onSort, align = "left", minWidth,
}: {
  label: string; col: SortCol; sortCol: SortCol; sortDir: SortDir;
  onSort: (c: SortCol) => void; align?: "left" | "right" | "center"; minWidth?: number;
}) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        padding:       "7px 10px",
        textAlign:     align,
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: "0.07em",
        color:         active ? BLUE : TEXT2,
        textTransform: "uppercase",
        whiteSpace:    "nowrap",
        cursor:        "pointer",
        borderBottom:  `1px solid ${BORDER}`,
        background:    "rgba(248,250,255,0.9)",
        minWidth,
        userSelect:    "none",
        position:      "sticky",
        top:           0,
        zIndex:        2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }}>
        {align === "right" && <SortIcon col={col} active={active} dir={sortDir} />}
        {label}
        {align !== "right" && <SortIcon col={col} active={active} dir={sortDir} />}
      </div>
    </th>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function Chip({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          5,
      padding:      "4px 10px",
      borderRadius: 6,
      background:   accent ? "rgba(43,92,224,0.07)" : "rgba(15,23,42,0.04)",
      border:       `1px solid ${accent ? "rgba(43,92,224,0.15)" : BORDER}`,
    }}>
      <span style={{ fontSize: 10, color: accent ? BLUE : TEXT2, fontWeight: 600, letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent ? BLUE : TEXT1, fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function QuantModelTable() {
  const [data,        setData]        = useState<ModelPayload | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [sortCol,     setSortCol]     = useState<SortCol>("score");
  const [sortDir,     setSortDir]     = useState<SortDir>("desc");
  const [industry,    setIndustry]    = useState<string>("all");
  const [search,      setSearch]      = useState("");

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
    if (industry !== "all") rows = rows.filter(r => r.industry === industry);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.ticker.toLowerCase().includes(q) ||
        (r.name  ?? "").toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "boolean"
        ? (av === bv ? 0 : av ? -1 : 1)
        : (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [data, industry, search, sortCol, sortDir]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, inPortfolio: 0, avgScore: null };
    const rows = data.rows;
    const inPortfolio = rows.filter(r => r.top20).length;
    const scores = rows.map(r => r.score).filter((v): v is number => v !== null);
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
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
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1 }}>
        {v.toFixed(1)}{suffix}
      </span>
    );
  }

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

        {/* ── Controls + Stats bar ──────────────────────────────────────────── */}
        <div style={{
          padding:      "12px 16px",
          borderBottom: `1px solid ${BORDER}`,
          display:      "flex",
          alignItems:   "center",
          gap:          10,
          flexWrap:     "wrap",
          background:   "rgba(248,250,255,0.6)",
        }}>
          {/* Stats */}
          <Chip label="Names" value={stats.total} />
          <Chip label="In portfolio" value={stats.inPortfolio} accent />
          {stats.avgScore != null && (
            <Chip label="Avg score" value={stats.avgScore.toFixed(1)} />
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
              No data for this date
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: "7px 10px", fontSize: 10, fontWeight: 700, color: TEXT2, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${BORDER}`, background: "rgba(248,250,255,0.9)", textAlign: "center", position: "sticky", top: 0, zIndex: 2, width: 36 }}>#</th>
                  <TH label="Ticker"   col="ticker"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} minWidth={90} />
                  <TH label="Name"     col="name"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} minWidth={140} />
                  <TH label="Industry" col="industry" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} minWidth={130} />
                  <TH label="Score"    col="score"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} minWidth={110} />
                  <TH label="Value"    col="value"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} minWidth={110} />
                  <TH label="Quality"  col="quality"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} minWidth={110} />
                  <TH label="PE"       col="pe"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" minWidth={60} />
                  <TH label="DY"       col="dy"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" minWidth={60} />
                  <TH label="ROE"      col="roe"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" minWidth={65} />
                  <TH label="ΔROE"     col="deltaRoe" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" minWidth={70} />
                  <TH label="Price"    col="price"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" minWidth={80} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const isTop = row.top20;
                  return (
                    <tr
                      key={row.ticker}
                      style={{
                        borderLeft:      isTop ? `3px solid ${BLUE}` : "3px solid transparent",
                        background:      isTop ? "#EFF6FF" : idx % 2 === 0 ? "#FFFFFF" : "rgba(248,250,255,0.5)",
                        transition:      "background 0.08s",
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
                            <span style={{
                              fontSize:     9,
                              fontWeight:   800,
                              fontFamily:   "JetBrains Mono, monospace",
                              padding:      "1px 5px",
                              borderRadius: 4,
                              background:   "rgba(43,92,224,0.12)",
                              color:        BLUE,
                              border:       "1px solid rgba(43,92,224,0.22)",
                              letterSpacing: "0.06em",
                            }}>
                              TOP
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Name */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}`, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12, color: TEXT1 }}>{row.name ?? <span style={{ color: TEXT3 }}>—</span>}</span>
                      </td>

                      {/* Industry */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}`, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.industry ? (
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: TEXT2,
                            padding: "2px 7px", borderRadius: 4,
                            background: "rgba(15,23,42,0.05)", border: `1px solid ${BORDER}`,
                            whiteSpace: "nowrap",
                          }}>
                            {row.industry}
                          </span>
                        ) : <span style={{ color: TEXT3 }}>—</span>}
                      </td>

                      {/* Score */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}` }}>
                        <ScoreBar value={row.score} />
                      </td>

                      {/* Value */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}` }}>
                        <ScoreBar value={row.value} />
                      </td>

                      {/* Quality */}
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${BORDER}` }}>
                        <ScoreBar value={row.quality} />
                      </td>

                      {/* PE */}
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {numCell(row.pe, "x")}
                      </td>

                      {/* DY */}
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {pctCell(row.dy)}
                      </td>

                      {/* ROE */}
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {pctCell(row.roe)}
                      </td>

                      {/* ΔROE */}
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {pctCell(row.deltaRoe, true)}
                      </td>

                      {/* Price */}
                      <td style={{ padding: "7px 10px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {row.price == null
                          ? <span style={{ color: TEXT3 }}>—</span>
                          : <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1 }}>
                              {row.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </span>
                        }
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
