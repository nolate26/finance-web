"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, Mail, X, ChevronDown, FileText } from "lucide-react";

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

const T3     = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";

const GRID = "95px minmax(150px,1fr) 120px 90px 120px 130px";

// ── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({ record, onClose }: { record: ResearchRecord; onClose: () => void }) {
  const group = categoryGroup(record.category);
  const col   = groupColor(group);
  const tp    = fmtTarget(record.targetPrice);
  const rec   = cleanRec(record.recommendation);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
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
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "22px 28px 18px",
          borderBottom: `1px solid ${BORDER}`,
          background: "linear-gradient(to bottom, #F8FAFF, #fff)",
          gap: 16, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase",
                padding: "3px 9px", borderRadius: 6,
                background: col.bg, border: `1px solid ${col.border}`, color: col.text,
              }}>
                {record.category}
              </span>
              <span style={{ fontSize: 11, color: "#64748B", fontFamily: "JetBrains Mono, monospace", background: "#F1F5F9", borderRadius: 5, padding: "2px 7px" }}>
                {formatDate(record.date)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2B5CE0", background: "rgba(43,92,224,0.07)", border: "1px solid rgba(43,92,224,0.18)", borderRadius: 6, padding: "2px 9px" }}>
                {record.company}
              </span>
              {tp && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#334155", background: "#F1F5F9", border: "1px solid rgba(15,23,42,0.10)", borderRadius: 6, padding: "2px 9px", fontFamily: "JetBrains Mono, monospace" }}>
                  TP {tp}
                </span>
              )}
              {rec && (() => {
                const rc = recColor(rec);
                return (
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 6, background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text }}>
                    {rec}
                  </span>
                );
              })()}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
              {record.title ?? record.subject ?? "No title"}
            </div>
            {record.from && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7 }}>
                <Mail size={11} style={{ color: T3, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#64748B" }}>{record.from}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: "transparent", border: `1px solid ${BORDER}`,
              cursor: "pointer", color: "#64748B", transition: "all 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(15,23,42,0.06)"; (e.currentTarget as HTMLElement).style.color = "#0F172A"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#64748B"; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* HTML body */}
        <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
          <div
            style={{ maxWidth: 760, margin: "0 auto", padding: "32px 40px 48px", fontSize: 14, lineHeight: 1.75, color: "#1E293B", fontFamily: "Inter, -apple-system, sans-serif" }}
            dangerouslySetInnerHTML={{ __html: record.html }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

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
        gap: "0 14px",
        padding: "11px 18px",
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

      {/* Title */}
      <div style={{ fontSize: 12, color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {r.title ?? r.subject ?? <span style={{ color: "#CBD5E1", fontStyle: "italic" }}>No title</span>}
      </div>

      {/* Category badge */}
      <div>
        <span style={{
          display: "inline-block", fontSize: 10, fontWeight: 700,
          padding: "2px 8px", borderRadius: 5,
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
            padding: "2px 8px", borderRadius: 5,
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
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <Mail size={10} style={{ flexShrink: 0, color: "#CBD5E1" }} />
        <span style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {senderName(r.from)}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  ticker: string | null;
}

export default function ResearchNotesPanel({ ticker }: Props) {
  const [records,  setRecords]  = useState<ResearchRecord[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState<ResearchRecord | null>(null);
  const [fGroup,   setFGroup]   = useState<"" | Group>("");

  useEffect(() => {
    if (!ticker) { setRecords([]); return; }
    setLoading(true);
    setFGroup("");
    fetch(`/api/research?company=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: { records?: ResearchRecord[] }) => setRecords(d.records ?? []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  // Groups present in the data, in canonical order.
  const groups = useMemo(
    () => GROUP_ORDER.filter((g) => records.some((r) => categoryGroup(r.category) === g)),
    [records]
  );

  const visible = useMemo(
    () => fGroup ? records.filter((r) => categoryGroup(r.category) === fGroup) : records,
    [records, fGroup]
  );

  // Bucket the visible records into ordered groups for sectioned display.
  const sections = useMemo(() => {
    const map = new Map<Group, ResearchRecord[]>();
    for (const r of visible) {
      const g = categoryGroup(r.category);
      (map.get(g) ?? map.set(g, []).get(g)!).push(r);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, rows: map.get(g)! }));
  }, [visible]);

  // ── Empty / no ticker ─────────────────────────────────────────────────────

  if (!ticker) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px", color: T3, fontSize: 13 }}>
        Select a company to see research notes
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px", gap: 10, color: T3 }}>
        <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 13 }}>Loading research notes…</span>
      </div>
    );
  }

  // ── No notes ──────────────────────────────────────────────────────────────

  if (records.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "52px 24px", gap: 10 }}>
        <FileText size={28} style={{ color: "#E2E8F0" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 3 }}>No research notes for {ticker}</div>
          <div style={{ fontSize: 12, color: T3 }}>Notes are ingested automatically from email</div>
        </div>
      </div>
    );
  }

  // ── Header bar ────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Filter + count row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
            color: "#2B5CE0", background: "rgba(43,92,224,0.07)",
            border: "1px solid rgba(43,92,224,0.18)",
            borderRadius: 7, padding: "3px 10px",
          }}>
            {visible.length} note{visible.length !== 1 ? "s" : ""}
          </span>

          {/* Group filter */}
          {groups.length > 1 && (
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <select
                value={fGroup}
                onChange={(e) => setFGroup(e.target.value as "" | Group)}
                style={{
                  appearance: "none",
                  padding: "5px 26px 5px 10px",
                  borderRadius: 7,
                  background: fGroup ? "rgba(43,92,224,0.07)" : "#F8FAFF",
                  border: fGroup ? "1px solid rgba(43,92,224,0.28)" : `1px solid ${BORDER}`,
                  color: fGroup ? "#1E3A8A" : "#64748B",
                  fontSize: 12, fontWeight: fGroup ? 600 : 400,
                  fontFamily: "Inter, sans-serif",
                  cursor: "pointer", outline: "none",
                  minWidth: 130,
                }}
              >
                <option value="">All groups</option>
                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 7, pointerEvents: "none", color: fGroup ? "#2B5CE0" : T3 }} />
            </div>
          )}

          {fGroup && (
            <button
              onClick={() => setFGroup("")}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 6,
                background: "transparent", border: "1px solid rgba(220,38,38,0.18)",
                color: "#DC2626", fontSize: 11, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <X size={10} /> Clear
            </button>
          )}
        </div>

        {/* Notes list */}
        <div style={{
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          overflow: "hidden",
        }}>
          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: GRID,
            gap: "0 14px",
            padding: "8px 18px",
            background: "#F8FAFF",
            borderBottom: "1px solid rgba(15,23,42,0.06)",
          }}>
            {["Date", "Title", "Category", "Target Price", "Recommendation", "From"].map((h) => (
              <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: T3, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {h}
              </div>
            ))}
          </div>

          {visible.length === 0 ? (
            <div style={{ padding: "32px 18px", textAlign: "center", fontSize: 12, color: T3 }}>
              No notes for this group
            </div>
          ) : (
            sections.map(({ group, rows }) => {
              const gc = groupColor(group);
              return (
                <div key={group}>
                  {/* Group / section header */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 18px",
                    background: gc.bg,
                    borderTop: "1px solid rgba(15,23,42,0.05)",
                    borderBottom: `1px solid ${gc.border}`,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: gc.text }}>
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
      </div>

      {selected && <DetailModal record={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
