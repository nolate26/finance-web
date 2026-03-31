"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Plus, X, PlusCircle, Trash2, Paperclip, FileText } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PickAttachment {
  fileName: string;
  url: string;
}

interface Pick {
  company: string;
  tp: string;
  status: "new" | "kept" | "out";
  rationale: string;
  attachment?: PickAttachment;
}

interface Period {
  id: string;
  date: string;
  title: string;
  comment: string;
  picks: Record<string, Pick[]>;
}

interface CoverageCompany {
  company: string;
  sector: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_SECTORS = [
  "Financials",
  "Transportation",
  "Food & Beverage",
  "Constr / Infra / Industrial",
  "Utilities",
  "Commodities",
  "Retail",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return "period-" + Date.now();
}

function clonePeriod(src: Period): Period {
  const today = new Date().toISOString().split("T")[0];
  const newPicks: Record<string, Pick[]> = {};
  for (const sector of ALL_SECTORS) {
    newPicks[sector] = (src.picks[sector] ?? []).map((p) => ({
      ...p,
      status: "kept" as const,
      rationale: "",
    }));
  }
  return {
    id: generateId(),
    date: today,
    title: "",
    comment: "",
    picks: newPicks,
  };
}

// ── Sector badge ──────────────────────────────────────────────────────────────

function SectorBadge({ sector }: { sector: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 4,
        background: "rgba(43,92,224,0.07)",
        color: "#2B5CE0",
        border: "1px solid rgba(43,92,224,0.15)",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {sector}
    </span>
  );
}

// ── Current View — vertical list ──────────────────────────────────────────────

// ── Attach Cell ───────────────────────────────────────────────────────────────

function AttachCell({
  pick,
  sector,
  periodId,
  onRefresh,
}: {
  pick: Pick;
  sector: string;
  periodId: string;
  onRefresh: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("periodId", periodId);
      fd.append("sector", sector);
      fd.append("companyName", pick.company);
      const res = await fetch("/api/chile/top-picks/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        alert(err.error ?? "Upload failed");
        return;
      }
      onRefresh();
    } finally {
      setUploading(false);
      // reset input so the same file can be re-selected if needed
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!pick.attachment) return;
    if (!window.confirm(`Remove attachment "${pick.attachment.fileName}"?`)) return;
    const params = new URLSearchParams({
      periodId,
      sector,
      companyName: pick.company,
    });
    await fetch(`/api/chile/top-picks/upload?${params.toString()}`, {
      method: "DELETE",
    });
    onRefresh();
  }

  if (uploading) {
    return (
      <span className="text-xs text-slate-400 flex items-center gap-1">
        <span
          className="inline-block w-3 h-3 rounded-full border border-slate-300 border-t-slate-500 animate-spin"
        />
        Uploading…
      </span>
    );
  }

  if (pick.attachment) {
    return (
      <div className="flex items-center gap-1">
        <a
          href={pick.attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          download={pick.attachment.fileName}
          className="flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-600 text-xs px-2 py-1 rounded hover:bg-slate-200 transition-colors max-w-[140px] overflow-hidden"
          title={pick.attachment.fileName}
        >
          <FileText size={11} className="shrink-0" />
          <span className="truncate">{pick.attachment.fileName.split("_").pop()}</span>
        </a>
        <button
          onClick={handleRemove}
          className="text-slate-300 hover:text-red-400 transition-colors p-0.5"
          title="Remove attachment"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        title="Attach PDF"
      >
        <Paperclip size={12} />
        <span>PDF</span>
      </button>
    </>
  );
}

// ── Current View — vertical list ──────────────────────────────────────────────

function CurrentView({
  period,
  onDelete,
  onRefresh,
}: {
  period: Period;
  onDelete?: () => void;
  onRefresh: () => void;
}) {
  const allPicks: Array<{ sector: string; pick: Pick }> = [];
  for (const sector of ALL_SECTORS) {
    for (const pick of period.picks[sector] ?? []) {
      allPicks.push({ sector, pick });
    }
  }

  function handleDelete() {
    if (window.confirm(`Delete period "${period.title}"? This cannot be undone.`)) {
      onDelete?.();
    }
  }

  return (
    <div>
      {/* Period header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
            {period.title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#94A3B8",
              marginTop: 3,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {period.date} · {allPicks.length} pick
            {allPicks.length !== 1 ? "s" : ""}
          </div>
        </div>

        {onDelete && (
          <button
            onClick={handleDelete}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid rgba(220,38,38,0.22)",
              background: "rgba(220,38,38,0.04)",
              color: "#DC2626",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            <Trash2 size={12} />
            Delete Period
          </button>
        )}
      </div>

      {/* Committee rationale block */}
      {period.comment && (
        <div className="bg-slate-50 border border-slate-200 rounded-md px-4 py-3 mb-5">
          <div className="text-[9px] font-semibold text-slate-400 tracking-widest mb-1.5 uppercase">
            Committee Rationale
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-mono m-0">
            {period.comment}
          </p>
        </div>
      )}

      {/* Industry-grouped full-width rows */}
      {allPicks.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-5">No picks in this period.</p>
      ) : (
        <div>
          {ALL_SECTORS.map((sector) => {
            const sectorPicks = allPicks.filter((p) => p.sector === sector);
            if (sectorPicks.length === 0) return null;
            return (
              <div key={sector}>
                <h3
                  className="text-sm font-bold border-b-2 border-slate-200 pb-2 mt-8 mb-3"
                  style={{ color: "#1E293B", letterSpacing: "0.01em" }}
                >
                  {sector}
                  <span
                    className="ml-2 font-mono font-normal"
                    style={{ fontSize: 10, color: "#94A3B8" }}
                  >
                    {sectorPicks.length} pick{sectorPicks.length !== 1 ? "s" : ""}
                  </span>
                </h3>
                <div className="flex flex-col gap-3">
                  {sectorPicks.map(({ pick }, i) => {
                    const isNew = pick.status === "new";
                    const isOut = pick.status === "out";
                    return (
                      <div
                        key={`${sector}-${pick.company}-${i}`}
                        className="flex flex-col md:flex-row bg-white border border-slate-200 shadow-sm rounded-lg"
                        style={{ overflow: "hidden" }}
                      >
                        {/* Left — identity + target price */}
                        <div
                          className="flex flex-col justify-center gap-1 px-5 py-4 md:w-48 flex-shrink-0"
                          style={{ borderRight: "1px solid #F1F5F9", background: "#FAFBFC" }}
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm" style={{ color: "#0F172A" }}>
                              {pick.company}
                            </span>
                            {isNew && (
                              <span
                                className="text-[9px] font-semibold px-1 py-0.5 rounded"
                                style={{ background: "rgba(16,185,129,0.10)", color: "#059669", border: "1px solid rgba(16,185,129,0.22)" }}
                              >
                                NEW
                              </span>
                            )}
                            {isOut && (
                              <span
                                className="text-[9px] font-semibold px-1 py-0.5 rounded"
                                style={{ background: "rgba(220,38,38,0.07)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.18)" }}
                              >
                                OUT
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5 mt-1">
                            <span
                              className="text-[9px] font-semibold tracking-widest uppercase"
                              style={{ color: "#94A3B8" }}
                            >
                              Target Price
                            </span>
                            {pick.tp ? (
                              <span
                                className="font-bold"
                                style={{ fontSize: 20, color: "#1D4ED8", letterSpacing: "-0.03em" }}
                              >
                                {pick.tp}
                              </span>
                            ) : (
                              <span style={{ fontSize: 16, color: "#CBD5E1" }}>—</span>
                            )}
                          </div>
                          <span
                            className="font-mono mt-2"
                            style={{ fontSize: 9, color: "#CBD5E1" }}
                          >
                            Added: {period.date}
                          </span>
                        </div>

                        {/* Center — rationale */}
                        <div className="flex-1 px-5 py-4">
                          <p
                            className="text-sm leading-relaxed m-0"
                            style={{
                              color: pick.rationale ? "#334155" : "#CBD5E1",
                              fontStyle: pick.rationale ? "normal" : "italic",
                            }}
                          >
                            {pick.rationale || "No investment thesis recorded."}
                          </p>
                        </div>

                        {/* Right — attachment */}
                        <div
                          className="flex items-center justify-center px-4 py-4 flex-shrink-0"
                          style={{ borderLeft: "1px solid #F1F5F9", minWidth: 100 }}
                        >
                          <AttachCell
                            pick={pick}
                            sector={sector}
                            periodId={period.id}
                            onRefresh={onRefresh}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Historical Matrix View ────────────────────────────────────────────────────

function HistoricalView({ periods }: { periods: Period[] }) {
  const allYears = Array.from(
    new Set(periods.map((p) => parseInt(p.date.slice(0, 4), 10)))
  ).sort((a, b) => b - a);

  const [selectedYear, setSelectedYear] = useState<number>(
    allYears[0] ?? new Date().getFullYear()
  );

  const yearPeriods = periods.filter((p) =>
    p.date.startsWith(selectedYear.toString())
  );

  const yearIdx = allYears.indexOf(selectedYear);
  const canPrev = yearIdx < allYears.length - 1;
  const canNext = yearIdx > 0;

  if (periods.length === 0) return null;

  return (
    <div>
      {/* Year navigator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <button
          onClick={() => canPrev && setSelectedYear(allYears[yearIdx + 1])}
          disabled={!canPrev}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid rgba(15,23,42,0.12)",
            background: canPrev ? "#F8FAFF" : "transparent",
            color: canPrev ? "#475569" : "#CBD5E1",
            cursor: canPrev ? "pointer" : "not-allowed",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ←
        </button>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#0F172A",
            fontFamily: "JetBrains Mono, monospace",
            minWidth: 44,
            textAlign: "center",
          }}
        >
          {selectedYear}
        </span>
        <button
          onClick={() => canNext && setSelectedYear(allYears[yearIdx - 1])}
          disabled={!canNext}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid rgba(15,23,42,0.12)",
            background: canNext ? "#F8FAFF" : "transparent",
            color: canNext ? "#475569" : "#CBD5E1",
            cursor: canNext ? "pointer" : "not-allowed",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          →
        </button>
        <span
          style={{
            fontSize: 11,
            color: "#94A3B8",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {yearPeriods.length} period{yearPeriods.length !== 1 ? "s" : ""}
        </span>
      </div>

      {yearPeriods.length === 0 ? (
        <div
          style={{
            color: "#94A3B8",
            fontSize: 13,
            fontStyle: "italic",
            padding: "20px 0",
          }}
        >
          No periods for {selectedYear}.
        </div>
      ) : (
        <div style={{ overflowX: "auto", width: "100%" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
            <thead>
              <tr style={{ background: "#F0F4FA" }}>
                <th
                  className="sticky left-0 z-10"
                  style={{
                    padding: "9px 14px",
                    textAlign: "left",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#475569",
                    letterSpacing: "0.07em",
                    borderBottom: "2px solid rgba(15,23,42,0.10)",
                    borderRight: "2px solid rgba(15,23,42,0.10)",
                    background: "#F0F4FA",
                    whiteSpace: "nowrap",
                    minWidth: 190,
                  }}
                >
                  SECTOR
                </th>
                {yearPeriods.map((p) => {
                  const formattedDate = (() => {
                    if (!p.date) return p.title;
                    const d = new Date(p.date + "T00:00:00");
                    return d.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                  })();
                  return (
                    <th
                      key={p.id}
                      style={{
                        padding: "10px 16px",
                        textAlign: "center",
                        borderBottom: "2px solid rgba(15,23,42,0.10)",
                        borderLeft: "1px solid rgba(15,23,42,0.06)",
                        whiteSpace: "nowrap",
                        minWidth: 140,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", fontFamily: "JetBrains Mono, monospace", letterSpacing: "-0.01em" }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2, fontFamily: "JetBrains Mono, monospace" }}>
                        {formattedDate}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ALL_SECTORS.map((sector, si) => (
                <tr
                  key={sector}
                  style={{
                    background:
                      si % 2 === 0 ? "transparent" : "rgba(15,23,42,0.015)",
                    borderBottom: "1px solid rgba(15,23,42,0.05)",
                  }}
                >
                  <td
                    className="sticky left-0 z-10"
                    style={{
                      padding: "10px 14px",
                      borderRight: "2px solid rgba(15,23,42,0.08)",
                      background:
                        si % 2 === 0 ? "#FFFFFF" : "rgba(248,250,255,1)",
                      verticalAlign: "top",
                    }}
                  >
                    <SectorBadge sector={sector} />
                  </td>

                  {yearPeriods.map((period) => {
                    const picks = period.picks[sector] ?? [];
                    return (
                      <td
                        key={period.id}
                        style={{
                          padding: "10px 12px",
                          borderLeft: "1px solid rgba(15,23,42,0.06)",
                          verticalAlign: "top",
                        }}
                      >
                        {picks.length === 0 ? (
                          <span style={{ color: "#E2E8F0", fontSize: 11 }}>
                            —
                          </span>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 5,
                            }}
                          >
                            {picks.map((pick, pi) => (
                              <div
                                key={pi}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  padding: "4px 0",
                                  borderBottom: pi < picks.length - 1 ? "1px solid #F1F5F9" : "none",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span
                                    style={{
                                      fontFamily: "JetBrains Mono, monospace",
                                      fontWeight: 600,
                                      fontSize: 11,
                                      color: "#1E293B",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {pick.company}
                                  </span>
                                  {(pick.status === "new" || pick.status === "out") && (
                                    <span
                                      style={{
                                        fontSize: 9,
                                        color: "#94A3B8",
                                        fontFamily: "JetBrains Mono, monospace",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      [{pick.status.toUpperCase()}]
                                    </span>
                                  )}
                                </div>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontWeight: 600,
                                    color: "#1D4ED8",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {pick.tp || "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  coverageCompanies,
}: {
  draft: Period;
  onChange: (p: Period) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  coverageCompanies: CoverageCompany[];
}) {
  // Group coverage companies by sector for <optgroup>
  const groupedCoverage = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const c of coverageCompanies) {
      const s = c.sector || "Other";
      if (!groups[s]) groups[s] = [];
      groups[s].push(c.company);
    }
    return Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
    );
  }, [coverageCompanies]);

  // Track all companies already in this draft for duplicate prevention
  const usedCompanies = useMemo(() => {
    const used = new Set<string>();
    for (const s of ALL_SECTORS) {
      for (const p of draft.picks[s] ?? []) {
        if (p.company) used.add(p.company);
      }
    }
    return used;
  }, [draft.picks]);

  function setField<K extends keyof Period>(key: K, val: Period[K]) {
    onChange({ ...draft, [key]: val });
  }

  function setPickField(
    sector: string,
    idx: number,
    field: keyof Pick,
    val: string
  ) {
    const picks = [...(draft.picks[sector] ?? [])];
    picks[idx] = { ...picks[idx], [field]: val };
    onChange({ ...draft, picks: { ...draft.picks, [sector]: picks } });
  }

  function addPick(sector: string) {
    const picks = [
      ...(draft.picks[sector] ?? []),
      { company: "", tp: "", status: "new" as const, rationale: "" },
    ];
    onChange({ ...draft, picks: { ...draft.picks, [sector]: picks } });
  }

  function removePick(sector: string, idx: number) {
    const picks = (draft.picks[sector] ?? []).filter((_, i) => i !== idx);
    onChange({ ...draft, picks: { ...draft.picks, [sector]: picks } });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "#F8FAFF",
    fontSize: 12,
    color: "#0F172A",
    fontFamily: "Inter, sans-serif",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 20px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 14,
          width: "100%",
          maxWidth: 780,
          boxShadow: "0 20px 60px rgba(15,23,42,0.20)",
          overflow: "hidden",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid rgba(15,23,42,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#F8FAFF",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
            New Top Picks Period
          </div>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94A3B8",
              padding: 4,
              borderRadius: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div
          style={{
            padding: "24px",
            maxHeight: "calc(100vh - 200px)",
            overflowY: "auto",
          }}
        >
          {/* Metadata */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#64748B",
                  display: "block",
                  marginBottom: 4,
                  letterSpacing: "0.06em",
                }}
              >
                DATE
              </label>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setField("date", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#64748B",
                  display: "block",
                  marginBottom: 4,
                  letterSpacing: "0.06em",
                }}
              >
                TITLE
              </label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="e.g. 15 Mar 2026"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Picks section */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#64748B",
              letterSpacing: "0.08em",
              marginBottom: 14,
            }}
          >
            PICKS &amp; INVESTMENT THESES
          </div>

          {ALL_SECTORS.map((sector) => {
            const picks = draft.picks[sector] ?? [];
            return (
              <div key={sector} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <SectorBadge sector={sector} />
                  <button
                    onClick={() => addPick(sector)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      color: "#2B5CE0",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px 4px",
                    }}
                  >
                    <PlusCircle size={13} />
                    Add
                  </button>
                </div>

                {picks.length > 0 && (
                  <div
                    style={{
                      border: "1px solid rgba(15,23,42,0.08)",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    {picks.map((pick, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "10px 12px",
                          borderBottom:
                            i < picks.length - 1
                              ? "1px solid rgba(15,23,42,0.06)"
                              : "none",
                          background: i % 2 === 0 ? "#FFFFFF" : "#FAFBFF",
                        }}
                      >
                        {/* Row 1: company dropdown, TP, delete */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 110px 28px",
                            gap: 6,
                            alignItems: "center",
                            marginBottom: 6,
                          }}
                        >
                          {/* Company dropdown */}
                          <select
                            value={pick.company}
                            onChange={(e) =>
                              setPickField(sector, i, "company", e.target.value)
                            }
                            style={{ ...inputStyle, cursor: "pointer" }}
                          >
                            <option value="">Select company...</option>
                            {Object.entries(groupedCoverage).map(
                              ([grpSector, companies]) => (
                                <optgroup key={grpSector} label={grpSector}>
                                  {companies.map((company) => (
                                    <option
                                      key={company}
                                      value={company}
                                      // Disable if already used elsewhere (not this row)
                                      disabled={
                                        usedCompanies.has(company) &&
                                        company !== pick.company
                                      }
                                    >
                                      {company}
                                    </option>
                                  ))}
                                </optgroup>
                              )
                            )}
                          </select>

                          {/* Target Price */}
                          <input
                            type="text"
                            value={pick.tp}
                            onChange={(e) =>
                              setPickField(sector, i, "tp", e.target.value)
                            }
                            placeholder="TP"
                            style={inputStyle}
                          />

                          {/* Delete row */}
                          <button
                            onClick={() => removePick(sector, i)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#CBD5E1",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.color =
                                "#DC2626";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.color =
                                "#CBD5E1";
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Row 2: rationale textarea */}
                        <textarea
                          value={pick.rationale}
                          onChange={(e) =>
                            setPickField(sector, i, "rationale", e.target.value)
                          }
                          placeholder="Investment thesis..."
                          rows={2}
                          style={{
                            ...inputStyle,
                            resize: "vertical",
                            lineHeight: 1.5,
                            fontSize: 12,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid rgba(15,23,42,0.08)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            background: "#F8FAFF",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px",
              borderRadius: 7,
              fontSize: 13,
              border: "1px solid rgba(15,23,42,0.12)",
              background: "transparent",
              color: "#64748B",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !draft.title.trim()}
            style={{
              padding: "8px 18px",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              background:
                saving || !draft.title.trim() ? "#CBD5E1" : "#2B5CE0",
              color: "#FFFFFF",
              cursor:
                saving || !draft.title.trim() ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Period"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TopPicks() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"current" | "historical">("current");
  const [editDraft, setEditDraft] = useState<Period | null>(null);
  const [saving, setSaving] = useState(false);
  const [coverageCompanies, setCoverageCompanies] = useState<CoverageCompany[]>([]);

  const fetchPeriods = useCallback(() => {
    setLoading(true);
    fetch("/api/chile/top-picks")
      .then((r) => r.json())
      .then((d: Period[]) => {
        setPeriods(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPeriods();
    // Fetch coverage companies for the form dropdown
    fetch("/api/chile/stock-selection")
      .then((r) => r.json())
      .then((d: { companies: Array<Record<string, unknown>> }) => {
        const list: CoverageCompany[] = (d.companies ?? [])
          .filter((c) => c.company)
          .map((c) => ({
            company: String(c.company),
            sector: String(c.sector ?? "Other"),
          }));
        setCoverageCompanies(list);
      })
      .catch(() => {});
  }, [fetchPeriods]);

  function handleOpenNew() {
    const base = periods[0];
    const draft = base
      ? clonePeriod(base)
      : {
          id: generateId(),
          date: new Date().toISOString().split("T")[0],
          title: "",
          comment: "",
          picks: Object.fromEntries(
            ALL_SECTORS.map((s) => [s, [] as Pick[]])
          ),
        };
    setEditDraft(draft);
  }

  async function handleDeletePeriod(id: string) {
    try {
      await fetch(`/api/chile/top-picks?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      fetchPeriods();
    } catch (err) {
      console.error("Failed to delete period:", err);
    }
  }

  async function handleSave() {
    if (!editDraft) return;

    // Auto-compute status: compare against the current latest period (before this save)
    const previousPeriod = periods[0] ?? null;
    const finalPicks: Record<string, Pick[]> = {};
    for (const sector of ALL_SECTORS) {
      const prevPicks = previousPeriod?.picks[sector] ?? [];
      finalPicks[sector] = (editDraft.picks[sector] ?? [])
        .filter((p) => p.company.trim() !== "") // skip blank rows
        .map((pick) => ({
          ...pick,
          status: prevPicks.some((p) => p.company === pick.company)
            ? ("kept" as const)
            : ("new" as const),
        }));
    }

    const finalDraft: Period = { ...editDraft, picks: finalPicks };

    setSaving(true);
    try {
      await fetch("/api/chile/top-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalDraft),
      });
      setEditDraft(null);
      fetchPeriods();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: 240 }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{
            borderColor: "rgba(43,92,224,0.15)",
            borderTopColor: "#2B5CE0",
          }}
        />
      </div>
    );
  }

  const current = periods[0] ?? null;

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {/* View toggle */}
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: 3,
            borderRadius: 8,
            background: "rgba(15,23,42,0.04)",
            border: "1px solid rgba(15,23,42,0.08)",
          }}
        >
          {(["current", "historical"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border:
                  view === v
                    ? "1px solid rgba(43,92,224,0.25)"
                    : "1px solid transparent",
                background:
                  view === v ? "rgba(43,92,224,0.10)" : "transparent",
                color: view === v ? "#1E3A8A" : "#64748B",
                transition: "all 0.12s",
              }}
            >
              {v === "current" ? "Current" : "Historical"}
            </button>
          ))}
        </div>

        {/* New Period button */}
        <button
          onClick={handleOpenNew}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 16px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            background: "#2B5CE0",
            color: "#FFFFFF",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#1E3A8A";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#2B5CE0";
          }}
        >
          <Plus size={14} />
          New Period
        </button>
      </div>

      {/* Views */}
      <div className="card" style={{ padding: "20px 24px" }}>
        {periods.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: "#94A3B8",
              fontSize: 13,
            }}
          >
            No periods yet. Click &ldquo;New Period&rdquo; to add the first one.
          </div>
        ) : view === "current" ? (
          current && (
            <CurrentView
              period={current}
              onDelete={() => handleDeletePeriod(current.id)}
              onRefresh={fetchPeriods}
            />
          )
        ) : (
          <HistoricalView periods={periods} />
        )}
      </div>

      {/* Edit modal */}
      {editDraft && (
        <EditModal
          draft={editDraft}
          onChange={setEditDraft}
          onSave={handleSave}
          onCancel={() => setEditDraft(null)}
          saving={saving}
          coverageCompanies={coverageCompanies}
        />
      )}
    </div>
  );
}
