"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, Mail, X, ChevronDown, FileText } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResearchRecord {
  id:       number;
  company:  string;
  date:     string;
  category: string;
  title:    string | null;
  subject:  string | null;
  from:     string | null;
  html:     string;
  industry: string;
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

const CATEGORY_COLORS = [
  { bg: "rgba(43,92,224,0.08)",  border: "rgba(43,92,224,0.22)",  text: "#1E3A8A" },
  { bg: "rgba(5,150,105,0.08)",  border: "rgba(5,150,105,0.22)",  text: "#065F46" },
  { bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.22)",  text: "#78350F" },
  { bg: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.22)", text: "#4C1D95" },
  { bg: "rgba(220,38,38,0.08)",  border: "rgba(220,38,38,0.22)",  text: "#7F1D1D" },
  { bg: "rgba(8,145,178,0.08)",  border: "rgba(8,145,178,0.22)",  text: "#164E63" },
  { bg: "rgba(234,88,12,0.08)",  border: "rgba(234,88,12,0.22)",  text: "#7C2D12" },
  { bg: "rgba(15,118,110,0.08)", border: "rgba(15,118,110,0.22)", text: "#134E4A" },
];

function categoryColor(cat: string) {
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = (hash * 31 + cat.charCodeAt(i)) & 0xffff;
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

const T3    = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";

// ── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({ record, onClose }: { record: ResearchRecord; onClose: () => void }) {
  const col = categoryColor(record.category);
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

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  ticker: string | null;
}

export default function ResearchNotesPanel({ ticker }: Props) {
  const [records,  setRecords]  = useState<ResearchRecord[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState<ResearchRecord | null>(null);
  const [fCategory, setFCategory] = useState("");

  useEffect(() => {
    if (!ticker) { setRecords([]); return; }
    setLoading(true);
    setFCategory("");
    fetch(`/api/research?company=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: { records?: ResearchRecord[] }) => setRecords(d.records ?? []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  const categories = useMemo(
    () => [...new Set(records.map((r) => r.category))].sort(),
    [records]
  );

  const visible = useMemo(
    () => fCategory ? records.filter((r) => r.category === fCategory) : records,
    [records, fCategory]
  );

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

          {/* Category filter */}
          {categories.length > 1 && (
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <select
                value={fCategory}
                onChange={(e) => setFCategory(e.target.value)}
                style={{
                  appearance: "none",
                  padding: "5px 26px 5px 10px",
                  borderRadius: 7,
                  background: fCategory ? "rgba(43,92,224,0.07)" : "#F8FAFF",
                  border: fCategory ? "1px solid rgba(43,92,224,0.28)" : `1px solid ${BORDER}`,
                  color: fCategory ? "#1E3A8A" : "#64748B",
                  fontSize: 12, fontWeight: fCategory ? 600 : 400,
                  fontFamily: "Inter, sans-serif",
                  cursor: "pointer", outline: "none",
                  minWidth: 130,
                }}
              >
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 7, pointerEvents: "none", color: fCategory ? "#2B5CE0" : T3 }} />
            </div>
          )}

          {fCategory && (
            <button
              onClick={() => setFCategory("")}
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
            gridTemplateColumns: "105px 1fr 130px 150px",
            gap: "0 14px",
            padding: "8px 18px",
            background: "#F8FAFF",
            borderBottom: "1px solid rgba(15,23,42,0.06)",
          }}>
            {["Date", "Title", "Category", "From"].map((h) => (
              <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: T3, textTransform: "uppercase" }}>
                {h}
              </div>
            ))}
          </div>

          {visible.length === 0 ? (
            <div style={{ padding: "32px 18px", textAlign: "center", fontSize: 12, color: T3 }}>
              No notes for this category
            </div>
          ) : (
            visible.map((r, idx) => {
              const col = categoryColor(r.category);
              return (
                <div
                  key={r.id}
                  onClick={() => setSelected(r)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "105px 1fr 130px 150px",
                    gap: "0 14px",
                    padding: "11px 18px",
                    alignItems: "center",
                    borderBottom: idx < visible.length - 1 ? "1px solid rgba(15,23,42,0.05)" : "none",
                    background: idx % 2 === 1 ? "rgba(15,23,42,0.012)" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = idx % 2 === 1 ? "rgba(15,23,42,0.012)" : "transparent"; }}
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

                  {/* From */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                    <Mail size={10} style={{ flexShrink: 0, color: "#CBD5E1" }} />
                    <span style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {senderName(r.from)}
                    </span>
                  </div>
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
