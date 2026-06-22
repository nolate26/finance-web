"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, Search, X, ChevronDown, Mail, ExternalLink } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResearchRecord {
  id:             number;
  company:        string;
  date:           string;
  category:       string;
  title:          string | null;
  subject:        string | null;
  from:           string | null;
  html:           string;
  industry:       string;
  targetPrice:    number | null;
  recommendation: string | null;
}

interface Filters {
  categories: string[];
  companies:  string[];
  froms:      string[];
  industries: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function senderName(from: string | null): string {
  if (!from) return "—";
  const match = from.match(/^([^<]+)</);
  return match ? match[1].trim() : from.replace(/<.*>/, "").trim() || from;
}

// Target price: ignore null / NaN, format the rest with thousands separators.
function fmtTarget(v: number | null | undefined): string | null {
  if (v == null || Number.isNaN(v)) return null;
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Recommendation: treat "N/A", "NaN", "null", "-", "" as empty.
function cleanRec(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || /^(n\/?a|nan|null|none|-+)$/i.test(t)) return null;
  return t;
}

// ── Category grouping ──────────────────────────────────────────────────────────

const GROUP_ORDER = ["Earnings", "Update", "Cases", "Others"] as const;
type Group = (typeof GROUP_ORDER)[number];

function categoryGroup(cat: string | null | undefined): Group {
  const c = (cat ?? "").toLowerCase();
  if (c.includes("earning")) return "Earnings";
  if (c.includes("update"))  return "Update";
  if (c.includes("case"))    return "Cases";
  return "Others";
}

const GROUP_COLORS: Record<Group, { bg: string; border: string; text: string }> = {
  Earnings: { bg: "rgba(43,92,224,0.08)",   border: "rgba(43,92,224,0.22)",   text: "#1E3A8A" },
  Update:   { bg: "rgba(5,150,105,0.08)",   border: "rgba(5,150,105,0.22)",   text: "#065F46" },
  Cases:    { bg: "rgba(124,58,237,0.08)",  border: "rgba(124,58,237,0.22)",  text: "#4C1D95" },
  Others:   { bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.22)", text: "#334155" },
};
function groupColor(g: Group) { return GROUP_COLORS[g]; }

// Recommendation pill colour by direction.
function recColor(rec: string) {
  const t = rec.toUpperCase();
  if (/BUY|OVERWEIGHT|OUTPERFORM|ACCUMULATE|ADD|COMPRA|SOBREPONDERAR/.test(t))
    return { bg: "rgba(5,150,105,0.10)",  border: "rgba(5,150,105,0.28)",  text: "#047857" };
  if (/SELL|UNDERWEIGHT|UNDERPERFORM|REDUCE|VENTA|SUBPONDERAR/.test(t))
    return { bg: "rgba(220,38,38,0.10)",  border: "rgba(220,38,38,0.28)",  text: "#B91C1C" };
  if (/HOLD|NEUTRAL|MARKET|EQUAL|MANTENER|PERFORM/.test(t))
    return { bg: "rgba(217,119,6,0.10)",  border: "rgba(217,119,6,0.28)",  text: "#B45309" };
  return { bg: "rgba(100,116,139,0.10)", border: "rgba(100,116,139,0.26)", text: "#475569" };
}

const GRID = "110px 150px minmax(160px,1fr) 120px 90px 120px 140px 36px";

// ── Filter chip ───────────────────────────────────────────────────────────────

function FilterSelect({
  label, value, options, onChange,
}: {
  label:    string;
  value:    string;
  options:  string[];
  onChange: (v: string) => void;
}) {
  const active = value !== "";
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          padding:    "6px 28px 6px 10px",
          borderRadius: 8,
          background: active ? "rgba(43,92,224,0.07)" : "#F8FAFF",
          border:     active ? "1px solid rgba(43,92,224,0.30)" : "1px solid rgba(15,23,42,0.12)",
          color:      active ? "#1E3A8A" : "#64748B",
          fontSize:   12,
          fontWeight: active ? 600 : 400,
          fontFamily: "Inter, sans-serif",
          cursor:     "pointer",
          outline:    "none",
          minWidth:   120,
        }}
      >
        <option value="">{label}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown
        size={12}
        style={{
          position: "absolute", right: 8, pointerEvents: "none",
          color: active ? "#2B5CE0" : "#94A3B8",
        }}
      />
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({ record, onClose }: { record: ResearchRecord; onClose: () => void }) {
  const col = groupColor(categoryGroup(record.category));
  const tp  = fmtTarget(record.targetPrice);
  const rec = cleanRec(record.recommendation);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "32px 24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 18,
          boxShadow: "0 32px 80px rgba(15,23,42,0.28), 0 0 0 1px rgba(15,23,42,0.06)",
          width: "100%", maxWidth: 1020,
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Modal header ──────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "22px 28px 18px",
          borderBottom: "1px solid rgba(15,23,42,0.07)",
          background: "linear-gradient(to bottom, #F8FAFF, #fff)",
          gap: 16, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Chips row */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.10em",
                textTransform: "uppercase",
                padding: "3px 9px", borderRadius: 6,
                background: col.bg, border: `1px solid ${col.border}`, color: col.text,
              }}>
                {record.category}
              </span>
              <span style={{
                fontSize: 11, color: "#64748B",
                fontFamily: "JetBrains Mono, monospace",
                background: "#F1F5F9", borderRadius: 5,
                padding: "2px 7px",
              }}>
                {formatDate(record.date)}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: "#2B5CE0",
                background: "rgba(43,92,224,0.07)",
                border: "1px solid rgba(43,92,224,0.18)",
                borderRadius: 6, padding: "2px 9px",
              }}>
                {record.company}
              </span>
              {tp && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#334155",
                  background: "#F1F5F9", border: "1px solid rgba(15,23,42,0.10)",
                  borderRadius: 6, padding: "2px 9px", fontFamily: "JetBrains Mono, monospace",
                }}>
                  TP {tp}
                </span>
              )}
              {rec && (() => {
                const rc = recColor(rec);
                return (
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                    padding: "3px 9px", borderRadius: 6,
                    background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
                  }}>
                    {rec}
                  </span>
                );
              })()}
              {record.industry && record.industry !== "Other" && (
                <span style={{ fontSize: 10, color: "#94A3B8" }}>
                  {record.industry}
                </span>
              )}
            </div>

            {/* Title */}
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
              {record.title ?? record.subject ?? "No title"}
            </div>

            {/* From */}
            {record.from && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7 }}>
                <Mail size={11} style={{ color: "#94A3B8", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#64748B" }}>{record.from}</span>
              </div>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: "transparent", border: "1px solid rgba(15,23,42,0.10)",
              cursor: "pointer", color: "#64748B", transition: "all 0.12s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(15,23,42,0.06)";
              (e.currentTarget as HTMLElement).style.color = "#0F172A";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#64748B";
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── HTML body ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
          <div
            style={{
              maxWidth: 760, margin: "0 auto",
              padding: "32px 40px 48px",
              fontSize: 14, lineHeight: 1.75, color: "#1E293B",
              fontFamily: "Inter, -apple-system, sans-serif",
            }}
            dangerouslySetInnerHTML={{ __html: record.html }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function NoteRow({ r, zebra, onClick }: { r: ResearchRecord; zebra: boolean; onClick: () => void }) {
  const col = groupColor(categoryGroup(r.category));
  const tp  = fmtTarget(r.targetPrice);
  const rec = cleanRec(r.recommendation);
  const rc  = rec ? recColor(rec) : null;
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: "0 16px",
        padding: "13px 20px",
        alignItems: "center",
        borderBottom: "1px solid rgba(15,23,42,0.05)",
        background: zebra ? "rgba(15,23,42,0.012)" : "transparent",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = zebra ? "rgba(15,23,42,0.012)" : "transparent"; }}
    >
      {/* Date */}
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#64748B", whiteSpace: "nowrap" }}>
        {formatDate(r.date)}
      </div>

      {/* Company + industry */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.company}
        </div>
        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.industry}
        </div>
      </div>

      {/* Title */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.title ?? r.subject ?? <span style={{ color: "#CBD5E1" }}>No title</span>}
        </div>
      </div>

      {/* Category badge */}
      <div>
        <span style={{
          display: "inline-block",
          fontSize: 10, fontWeight: 700,
          padding: "2px 8px", borderRadius: 6,
          background: col.bg, border: `1px solid ${col.border}`, color: col.text,
          whiteSpace: "nowrap", maxWidth: "100%",
          overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {r.category}
        </span>
      </div>

      {/* Target price */}
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 600, color: tp ? "#334155" : "#CBD5E1", whiteSpace: "nowrap" }}>
        {tp ?? "—"}
      </div>

      {/* Recommendation */}
      <div>
        {rec && rc ? (
          <span style={{
            display: "inline-block", fontSize: 10, fontWeight: 800,
            letterSpacing: "0.04em", textTransform: "uppercase",
            padding: "2px 8px", borderRadius: 6,
            background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
            whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {rec}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#CBD5E1" }}>—</span>
        )}
      </div>

      {/* From */}
      <div style={{ fontSize: 11, color: "#64748B", display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <Mail size={11} style={{ flexShrink: 0, color: "#CBD5E1" }} />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {senderName(r.from)}
        </span>
      </div>

      {/* Open icon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ExternalLink size={13} style={{ color: "#CBD5E1" }} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const [records,  setRecords]  = useState<ResearchRecord[]>([]);
  const [filters,  setFilters]  = useState<Filters>({ categories: [], companies: [], froms: [], industries: [] });
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<ResearchRecord | null>(null);

  // Active filters
  const [fCompany,  setFCompany]  = useState("");
  const [fGroup,    setFGroup]    = useState<"" | Group>("");
  const [fFrom,     setFFrom]     = useState("");
  const [fIndustry, setFIndustry] = useState("");
  const [fSearch,   setFSearch]   = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo,   setFDateTo]   = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/research")
      .then((r) => r.json())
      .then((d: { records?: ResearchRecord[]; filters?: Filters }) => {
        setRecords(d.records ?? []);
        setFilters(d.filters ?? { categories: [], companies: [], froms: [], industries: [] });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    return records.filter((r) => {
      if (fCompany  && r.company  !== fCompany)  return false;
      if (fGroup    && categoryGroup(r.category) !== fGroup) return false;
      if (fIndustry && r.industry !== fIndustry) return false;
      if (fFrom && !(r.from ?? "").toLowerCase().includes(fFrom.toLowerCase())) return false;
      if (fDateFrom && r.date < fDateFrom) return false;
      if (fDateTo   && r.date > fDateTo)   return false;
      if (q) {
        const hay = [r.company, r.category, r.title, r.subject, r.from, r.industry, r.recommendation]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, fCompany, fGroup, fFrom, fIndustry, fSearch, fDateFrom, fDateTo]);

  // Groups present in the data, in canonical order.
  const groups = useMemo(
    () => GROUP_ORDER.filter((g) => records.some((r) => categoryGroup(r.category) === g)),
    [records]
  );

  // Bucket the visible records into ordered sections.
  const sections = useMemo(() => {
    const map = new Map<Group, ResearchRecord[]>();
    for (const r of visible) {
      const g = categoryGroup(r.category);
      (map.get(g) ?? map.set(g, []).get(g)!).push(r);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, rows: map.get(g)! }));
  }, [visible]);

  const activeFilterCount = [fCompany, fGroup, fFrom, fIndustry, fDateFrom, fDateTo].filter(Boolean).length;

  const clearAll = () => {
    setFCompany(""); setFGroup(""); setFFrom("");
    setFIndustry(""); setFDateFrom(""); setFDateTo(""); setFSearch("");
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", marginBottom: 4 }}>
            Research Notes
          </h1>
          <p style={{ fontSize: 13, color: "#64748B" }}>
            Sell-side research and coverage updates ingested by email
          </p>
        </div>
        {!loading && (
          <span style={{
            fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
            color: "#2B5CE0", background: "rgba(43,92,224,0.07)",
            border: "1px solid rgba(43,92,224,0.18)",
            borderRadius: 8, padding: "4px 12px",
          }}>
            {visible.length} / {records.length} notes
          </span>
        )}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,0.08)",
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 16,
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
          <input
            type="text"
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
            placeholder="Search title, company, subject…"
            style={{
              width: "100%", padding: "7px 10px 7px 28px",
              borderRadius: 8, background: "#F8FAFF",
              border: "1px solid rgba(15,23,42,0.12)",
              color: "#0F172A", fontSize: 12, outline: "none",
              fontFamily: "Inter, sans-serif", boxSizing: "border-box",
            }}
            onFocus={(e)  => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(43,92,224,0.35)"; }}
            onBlur={(e)   => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(15,23,42,0.12)"; }}
          />
        </div>

        <FilterSelect label="Industry"   value={fIndustry} options={filters.industries} onChange={setFIndustry} />
        <FilterSelect label="Company"    value={fCompany}  options={filters.companies}  onChange={setFCompany}  />
        <FilterSelect label="Group"      value={fGroup}    options={groups as unknown as string[]} onChange={(v) => setFGroup(v as "" | Group)} />
        <FilterSelect label="From"       value={fFrom}     options={filters.froms}       onChange={setFFrom}     />

        {/* Date range */}
        <input
          type="date"
          value={fDateFrom}
          onChange={(e) => setFDateFrom(e.target.value)}
          title="From date"
          style={{
            padding: "6px 10px", borderRadius: 8,
            background: fDateFrom ? "rgba(43,92,224,0.07)" : "#F8FAFF",
            border: fDateFrom ? "1px solid rgba(43,92,224,0.30)" : "1px solid rgba(15,23,42,0.12)",
            color: fDateFrom ? "#1E3A8A" : "#94A3B8",
            fontSize: 12, outline: "none", cursor: "pointer",
            fontFamily: "Inter, sans-serif",
          }}
        />
        <span style={{ color: "#CBD5E1", fontSize: 12 }}>–</span>
        <input
          type="date"
          value={fDateTo}
          onChange={(e) => setFDateTo(e.target.value)}
          title="To date"
          style={{
            padding: "6px 10px", borderRadius: 8,
            background: fDateTo ? "rgba(43,92,224,0.07)" : "#F8FAFF",
            border: fDateTo ? "1px solid rgba(43,92,224,0.30)" : "1px solid rgba(15,23,42,0.12)",
            color: fDateTo ? "#1E3A8A" : "#94A3B8",
            fontSize: 12, outline: "none", cursor: "pointer",
            fontFamily: "Inter, sans-serif",
          }}
        />

        {/* Clear */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 10px", borderRadius: 7,
              background: "transparent",
              border: "1px solid rgba(220,38,38,0.20)",
              color: "#DC2626", fontSize: 11, fontWeight: 600,
              cursor: "pointer", transition: "all 0.12s", flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.05)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <X size={11} /> Clear {activeFilterCount}
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,0.08)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
      }}>
        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: GRID,
          gap: "0 16px",
          padding: "9px 20px",
          background: "#F8FAFF",
          borderBottom: "1px solid rgba(15,23,42,0.07)",
        }}>
          {["Date", "Company", "Title", "Category", "Target Price", "Recommendation", "From", ""].map((h, i) => (
            <div key={h || `c${i}`} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 10, color: "#94A3B8" }}>
            <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13 }}>Loading research notes…</span>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>No notes match your filters</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>Try adjusting or clearing the active filters</div>
          </div>
        ) : (
          sections.map(({ group, rows }) => {
            const gc = groupColor(group);
            return (
              <div key={group}>
                {/* Group / section header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 20px",
                  background: gc.bg,
                  borderTop: "1px solid rgba(15,23,42,0.05)",
                  borderBottom: `1px solid ${gc.border}`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: gc.text }}>
                    {group}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: gc.text, opacity: 0.7, fontFamily: "JetBrains Mono, monospace" }}>
                    {rows.length}
                  </span>
                </div>

                {rows.map((r, idx) => (
                  <NoteRow key={r.id} r={r} zebra={idx % 2 === 1} onClick={() => setSelected(r)} />
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selected && <DetailModal record={selected} onClose={() => setSelected(null)} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
