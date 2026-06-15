"use client";

import { useState, useEffect, useMemo } from "react";
import type { MomentumPayload, MomentumRow } from "@/app/api/quant/momentum/route";

// ── Design tokens (match QuantModelTable) ──────────────────────────────────────
const TEXT1  = "#0F172A";
const TEXT2  = "#64748B";
const TEXT3  = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";
const TEAL   = "#0D9488";          // accent for the momentum factor
const TEAL_D = "#0F766E";
const GREEN  = "#15803D";
const RED    = "#B91C1C";
const AMBER  = "#B45309";

// ── Types ──────────────────────────────────────────────────────────────────────
type SortCol = "rank" | "ticker" | "name" | "industry" | "signal" | "score" | "zscore";
type SortDir = "asc" | "desc";

// ── Helpers ─────────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

// Raw momentum return (already in %): 359.26 → "+359.3%"
function fmtSignal(v: number | null): string {
  if (v == null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

// z-score → visual emphasis. Higher = momentum disproportionate vs the rest.
function zTheme(z: number | null): { text: string; bg: string; border: string; label: string | null } {
  if (z == null) return { text: TEXT3, bg: "transparent", border: "transparent", label: null };
  if (z >= 3)   return { text: "#FFFFFF", bg: RED,                      border: RED,                      label: "EXTREME" };
  if (z >= 2)   return { text: "#B45309", bg: "rgba(217,119,6,0.14)",  border: "rgba(217,119,6,0.45)",  label: "OUTLIER" };
  if (z >= 1)   return { text: "#0F766E", bg: "rgba(13,148,136,0.10)", border: "rgba(13,148,136,0.30)", label: null };
  if (z <= -1)  return { text: TEXT2,     bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.22)", label: null };
  return          { text: TEXT2,          bg: "transparent",            border: "transparent",            label: null };
}

// ── Score bar (0–100) ────────────────────────────────────────────────────────────
function ScoreBar({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: TEXT3 }}>—</span>;
  const pct   = Math.max(0, Math.min(100, value));
  const color = pct > 70 ? TEAL_D : pct > 40 ? TEAL : "#5EEAD4";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 84 }}>
      <div style={{ flex: 1, height: 4, background: "rgba(15,23,42,0.07)", borderRadius: 2, overflow: "hidden", minWidth: 38 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, fontWeight: 800, color: pct > 40 ? TEAL_D : TEXT2, minWidth: 30, textAlign: "right" }}>
        {Math.round(pct)}
      </span>
    </div>
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
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: TEAL, flexShrink: 0 }}>
      <path d="M3 3.5L5 5.5L7 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: TEAL, flexShrink: 0 }}>
      <path d="M3 6.5L5 4.5L7 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Header cell ───────────────────────────────────────────────────────────────
function Th({
  label, col, sortCol, sortDir, onSort, align = "left", minWidth, sortable = true,
}: {
  label: string; col?: SortCol; sortCol: SortCol; sortDir: SortDir;
  onSort: (c: SortCol) => void; align?: "left" | "right" | "center"; minWidth?: number; sortable?: boolean;
}) {
  const clickable = sortable && col != null;
  const active = clickable && sortCol === col;
  return (
    <th
      onClick={clickable ? () => onSort(col!) : undefined}
      style={{
        padding: "8px 12px", textAlign: align, fontSize: 10, fontWeight: 700,
        letterSpacing: "0.06em", color: active ? TEAL_D : TEXT2, textTransform: "uppercase",
        whiteSpace: "nowrap", cursor: clickable ? "pointer" : "default",
        borderBottom: `1px solid ${BORDER}`, background: "rgba(240,253,250,0.6)",
        minWidth, userSelect: "none", position: "sticky", top: 0, zIndex: 2,
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

// ── Methodology card ────────────────────────────────────────────────────────────
function MethodologyCard() {
  const steps: { n: string; title: string; body: string }[] = [
    {
      n: "01",
      title: "Pure price momentum",
      body: "Every week the full LatAm equity universe is ranked by trailing total return (in USD, dividends reinvested) — no fundamentals, only price action.",
    },
    {
      n: "02",
      title: "~14.5-month window, skipping 3 weeks",
      body: "Momentum is the cumulative total return over a ~14.5-month look-back, ending 3 weeks before the signal date. The recent weeks are skipped to avoid short-term mean reversion.",
    },
    {
      n: "03",
      title: "Cross-sectional ranking",
      body: "Each date's cross-section is scored 0–100 (best name = 100, worst = 0) and ranked ordinally (rank 1 = strongest momentum). A z-score flags names whose momentum is disproportionate vs. the rest.",
    },
  ];
  return (
    <div style={{
      background: "linear-gradient(135deg, #FFFFFF 0%, #F0FDFA 100%)",
      border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 22px",
      boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ display: "inline-block", width: 3, height: 16, borderRadius: 2, background: TEAL }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: TEAL_D, textTransform: "uppercase" }}>
          Methodology
        </span>
      </div>
      <p style={{ fontSize: 13, color: TEXT2, margin: "0 0 16px 11px", lineHeight: 1.6, maxWidth: 880 }}>
        A pure price-momentum model for LatAm equities. The full universe is re-ranked weekly and the entire
        cross-section is stored for each signal date.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {steps.map((s) => (
          <div key={s.n} style={{
            background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: TEAL }}>{s.n}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT1 }}>{s.title}</span>
            </div>
            <p style={{ fontSize: 11.5, color: TEXT2, margin: 0, lineHeight: 1.55 }}>{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sort key extraction ───────────────────────────────────────────────────────
function sortValue(r: MomentumRow, col: SortCol): number | string | null {
  switch (col) {
    case "rank":     return r.rank;
    case "ticker":   return r.ticker;
    case "name":     return r.name;
    case "industry": return r.industry;
    case "signal":   return r.signal;
    case "score":    return r.score;
    case "zscore":   return r.zscore;
    default:         return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MomentumTable() {
  const [data,         setData]         = useState<MomentumPayload | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [sortCol,      setSortCol]      = useState<SortCol>("rank");
  const [sortDir,      setSortDir]      = useState<SortDir>("asc");
  const [search,       setSearch]       = useState("");

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const url = selectedDate ? `/api/quant/momentum?date=${selectedDate}` : "/api/quant/momentum";
    fetch(url)
      .then(r => r.json())
      .then((d: MomentumPayload) => {
        setData(d);
        if (!selectedDate && d.date) setSelectedDate(d.date);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedDate]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.ticker.toLowerCase().includes(q) ||
        (r.name ?? "").toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => {
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
  }, [data, search, sortCol, sortDir]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, outliers: 0, topSignal: null as number | null };
    const rows = data.rows;
    const outliers = rows.filter(r => r.zscore != null && r.zscore >= 2).length;
    const signals  = rows.map(r => r.signal).filter((v): v is number => v != null);
    const topSignal = signals.length ? Math.max(...signals) : null;
    return { total: rows.length, outliers, topSignal };
  }, [data]);

  // ── Sort handler ─────────────────────────────────────────────────────────
  function handleSort(col: SortCol) {
    if (col === sortCol) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir(col === "rank" || col === "ticker" || col === "name" || col === "industry" ? "asc" : "desc"); }
  }

  const thProps = { sortCol, sortDir, onSort: handleSort };

  return (
    <div>
      <MethodologyCard />

      {/* ── Section header ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 22, background: TEAL, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0 }}>
              Momentum Ranking
            </h2>
          </div>
          <p style={{ fontSize: 12, color: TEXT2, margin: "3px 0 0 13px" }}>
            Full cross-section — LatAm Equities
          </p>
        </div>

        {/* Date selector + last-updated */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {data?.date && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: TEAL_D,
              background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.22)",
              borderRadius: 6, padding: "5px 10px", whiteSpace: "nowrap",
            }}>
              Last updated: {fmtDate(data.date)}
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: TEXT2, fontWeight: 600, whiteSpace: "nowrap" }}>Signal date:</span>
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                padding: "5px 28px 5px 10px", borderRadius: 7, border: `1px solid ${BORDER}`,
                background: "#F0FDFA", fontSize: 12, fontFamily: "JetBrains Mono, monospace",
                fontWeight: 600, color: TEXT1, cursor: "pointer", outline: "none", appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat", backgroundPosition: "right 9px center",
              }}
            >
              {(data?.dates ?? []).map(d => (
                <option key={d} value={d}>{fmtDate(d)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Card ────────────────────────────────────────────────────────────── */}
      <div style={{
        background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12,
        overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
      }}>
        {/* ── Controls + Stats bar ──────────────────────────────────────────── */}
        <div style={{
          padding: "12px 16px", borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          {/* Stats chips */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: "rgba(15,23,42,0.04)", border: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 10, color: TEXT2, fontWeight: 600, letterSpacing: "0.04em" }}>Names</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: TEXT1, fontFamily: "JetBrains Mono, monospace" }}>{stats.total}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)" }}>
            <span style={{ fontSize: 10, color: AMBER, fontWeight: 600, letterSpacing: "0.04em" }}>Outliers (z≥2)</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: AMBER, fontFamily: "JetBrains Mono, monospace" }}>{stats.outliers}</span>
          </div>
          {stats.topSignal != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.22)" }}>
              <span style={{ fontSize: 10, color: TEAL_D, fontWeight: 600, letterSpacing: "0.04em" }}>Top return</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: TEAL_D, fontFamily: "JetBrains Mono, monospace" }}>{fmtSignal(stats.topSignal)}</span>
            </div>
          )}

          <div style={{ flex: 1 }} />

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
                padding: "5px 10px 5px 26px", borderRadius: 7, border: `1px solid ${BORDER}`,
                background: "#F0FDFA", fontSize: 11, color: TEXT1, outline: "none", width: 200,
              }}
            />
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 360px)" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "48px 0", gap: 10, color: TEXT2, fontSize: 13 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid rgba(13,148,136,0.15)`, borderTopColor: TEAL, animation: "spin 0.8s linear infinite" }} />
              Loading momentum signals…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: TEXT3, fontSize: 13 }}>
              {data && data.rows.length === 0 ? "No momentum signals available" : "No names match this search"}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th label="Rank"     col="rank"     {...thProps} align="center" minWidth={56} />
                  <Th label="Ticker"   col="ticker"   {...thProps} minWidth={120} />
                  <Th label="Name"     col="name"     {...thProps} minWidth={160} />
                  <Th label="Industry" col="industry" {...thProps} minWidth={140} />
                  <Th label="Momentum Return" col="signal" {...thProps} align="right" minWidth={120} />
                  <Th label="Score"    col="score"    {...thProps} minWidth={110} />
                  <Th label="Z-Score"  col="zscore"   {...thProps} align="right" minWidth={110} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const zt = zTheme(row.zscore);
                  const isExtreme = row.zscore != null && row.zscore >= 2;
                  return (
                    <tr
                      key={row.ticker}
                      style={{
                        background: isExtreme
                          ? "rgba(217,119,6,0.05)"
                          : idx % 2 === 0 ? "#FFFFFF" : "rgba(240,253,250,0.45)",
                        borderLeft: isExtreme ? `3px solid ${AMBER}` : "3px solid transparent",
                        transition: "background 0.08s",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(13,148,136,0.06)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isExtreme ? "rgba(217,119,6,0.05)" : idx % 2 === 0 ? "#FFFFFF" : "rgba(240,253,250,0.45)"}
                    >
                      {/* Rank */}
                      <td style={{ padding: "7px 12px", textAlign: "center", borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{
                          fontFamily: "JetBrains Mono, monospace", fontSize: 11.5,
                          fontWeight: row.rank != null && row.rank <= 3 ? 800 : 600,
                          color: row.rank != null && row.rank <= 3 ? TEAL_D : TEXT2,
                        }}>
                          {row.rank ?? "—"}
                        </span>
                      </td>

                      {/* Ticker */}
                      <td style={{ padding: "7px 12px", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: TEXT1 }}>
                          {row.ticker}
                        </span>
                      </td>

                      {/* Name */}
                      <td style={{ padding: "7px 12px", borderBottom: `1px solid ${BORDER}`, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12, color: TEXT1 }}>{row.name ?? <span style={{ color: TEXT3 }}>—</span>}</span>
                      </td>

                      {/* Industry */}
                      <td style={{ padding: "7px 12px", borderBottom: `1px solid ${BORDER}`, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.industry ? (
                          <span style={{ fontSize: 10, fontWeight: 600, color: TEXT2, padding: "2px 7px", borderRadius: 4, background: "rgba(15,23,42,0.05)", border: `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>
                            {row.industry}
                          </span>
                        ) : <span style={{ color: TEXT3 }}>—</span>}
                      </td>

                      {/* Momentum Return (signal) */}
                      <td style={{ padding: "7px 12px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{
                          fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, fontWeight: 700,
                          color: row.signal == null ? TEXT3 : row.signal >= 0 ? GREEN : RED,
                        }}>
                          {fmtSignal(row.signal)}
                        </span>
                      </td>

                      {/* Score */}
                      <td style={{ padding: "7px 12px", borderBottom: `1px solid ${BORDER}` }}>
                        <ScoreBar value={row.score} />
                      </td>

                      {/* Z-Score */}
                      <td style={{ padding: "7px 12px", textAlign: "right", borderBottom: `1px solid ${BORDER}` }}>
                        {row.zscore == null ? (
                          <span style={{ color: TEXT3 }}>—</span>
                        ) : (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            justifyContent: "flex-end",
                          }}>
                            {zt.label && (
                              <span style={{
                                fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em",
                                color: zt.text === "#FFFFFF" ? "#FFFFFF" : zt.text,
                                background: zt.bg, border: `1px solid ${zt.border}`,
                                borderRadius: 4, padding: "1px 5px",
                              }}>
                                {zt.label}
                              </span>
                            )}
                            <span style={{
                              fontFamily: "JetBrains Mono, monospace", fontSize: 11.5,
                              fontWeight: row.zscore >= 1 ? 800 : 600,
                              color: zt.text === "#FFFFFF" ? RED : zt.text,
                              minWidth: 38, textAlign: "right",
                            }}>
                              {(row.zscore >= 0 ? "+" : "") + row.zscore.toFixed(2)}σ
                            </span>
                          </span>
                        )}
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
          <div style={{ padding: "8px 16px", borderTop: `1px solid ${BORDER}`, background: "rgba(240,253,250,0.6)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: TEXT3 }}>
              {filtered.length} name{filtered.length !== 1 ? "s" : ""}{search ? ` matching "${search}"` : ""}
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
