"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, Trash2, CheckCircle2, Loader2, Search, Pencil, ChevronLeft, ChevronRight, Table2 } from "lucide-react";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { PATRIA, FONT_SECONDARY } from "@/lib/patriaTheme";

// ── Types ─────────────────────────────────────────────────────────────────────

type Region = "LATAM" | "CHILE";

interface SearchResult {
  nombreLatam:    string;
  industriaGics:  string | null;
  industriaChile: string | null;
}

interface SavedPick {
  id:             string;
  nombre_latam:   string;
  industry_group: string;
  comment:        string;
  target_price:   number | null;
  created_at:     string;
}

interface PickRow {
  _key:          string;
  nombreLatam:   string;
  displayName:   string;
  industryGroup: string;
  comment:       string;
  targetPrice:   string;
}

interface Props {
  defaultRegion?: Region;
  // Accept either prop name so both pages work
  region?: Region;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentQuarterMonthValue(): string {
  const d = new Date();
  const qMonth = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${String(qMonth + 1).padStart(2, "0")}`;
}

function quarterLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return `Q${Math.ceil(month / 3)} ${year}`;
}

function monthValueToISO(ym: string): string {
  return `${ym}-01`;
}

function periodLabel(ym: string, isChile: boolean): string {
  if (isChile) return quarterLabel(ym);
  const [year, month] = ym.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function newRow(): PickRow {
  return {
    _key: Math.random().toString(36).slice(2),
    nombreLatam: "", displayName: "",
    industryGroup: "", comment: "", targetPrice: "",
  };
}

// ── Company Combobox ──────────────────────────────────────────────────────────

function CompanyCombobox({
  value, region, onSelect,
}: {
  value: string;
  region: Region;
  onSelect: (r: SearchResult) => void;
}) {
  const [query, setQuery]     = useState(value);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef          = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (q: string) => {
    setQuery(q);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/companies/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d: { results?: SearchResult[] }) => setResults(d.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 280);
  };

  const handleSelect = (r: SearchResult) => {
    setQuery(r.nombreLatam);
    setResults([]);
    setOpen(false);
    onSelect(r);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "rgba(13,13,56,0.45)", pointerEvents: "none" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={(e) => {
            if (query.length >= 2) setOpen(true);
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(32,68,220,0.40)";
          }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.12)"; }}
          placeholder={`Search company…`}
          style={{
            width: "100%", padding: "7px 28px 7px 26px",
            borderRadius: 7, background: "#F5F7FD",
            border: "1px solid rgba(13,13,56,0.12)",
            color: "#0D0D38", fontSize: 12, outline: "none",
            fontFamily: FONT_SECONDARY, boxSizing: "border-box",
          }}
        />
        {loading && <Loader2 size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "rgba(13,13,56,0.45)", animation: "spin 0.8s linear infinite" }} />}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          zIndex: 9999, background: "#fff",
          border: "1px solid rgba(13,13,56,0.12)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(13,13,56,0.14)", overflow: "hidden",
        }}>
          {results.map((r) => (
            <button
              key={r.nombreLatam}
              onMouseDown={() => handleSelect(r)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start",
                width: "100%", padding: "8px 12px",
                background: "transparent", border: "none",
                borderBottom: "1px solid rgba(13,13,56,0.05)",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0D0D38" }}>{r.nombreLatam}</span>
              <span style={{ fontSize: 10, color: "rgba(13,13,56,0.45)", marginTop: 1 }}>
                {region === "LATAM" ? (r.industriaGics ?? "—") : (r.industriaChile ?? "—")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Industry palette (accent + tinted header bg) ─────────────────────────────

// Un color por industria, en el orden de priorización del manual sobre fondo
// claro. `accent` se usa como color de TEXTO, así que quedan fuera turquesa y
// sky-blue: no tienen contraste suficiente sobre blanco. Son 6 tonos y el índice
// cicla, de modo que a partir de la séptima industria se repite el primero.
const INDUSTRY_PALETTE = [
  { accent: PATRIA.darkBlue,    bg: "rgba(13,13,56,0.045)",   border: "rgba(13,13,56,0.18)"   },
  { accent: PATRIA.blue,        bg: "rgba(0,30,175,0.045)",   border: "rgba(0,30,175,0.18)"   },
  { accent: PATRIA.kingBlue,    bg: "rgba(32,68,220,0.045)",  border: "rgba(32,68,220,0.18)"  },
  { accent: PATRIA.darkSkyBlue, bg: "rgba(69,113,255,0.045)", border: "rgba(69,113,255,0.18)" },
  { accent: PATRIA.orange,      bg: "rgba(255,107,6,0.045)",  border: "rgba(255,107,6,0.18)"  },
  { accent: PATRIA.pink,        bg: "rgba(248,72,94,0.045)",  border: "rgba(248,72,94,0.18)"  },
] as const;

// ── View mode — grouped by industry ──────────────────────────────────────────

function ViewMode({
  picks, loading, isChile,
}: {
  picks: SavedPick[];
  loading: boolean;
  isChile: boolean;
}) {
  // Hook must be at top — before any early returns
  const [selectedIndustry, setSelectedIndustry] = useState<string>("All");

  // Unique industries for filter — sorted alphabetically
  const allIndustries = Array.from(new Set(picks.map((p) => p.industry_group || "Other"))).sort();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px", gap: 10, color: "rgba(13,13,56,0.45)" }}>
        <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 13 }}>Loading picks…</span>
      </div>
    );
  }

  if (picks.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "52px 24px", gap: 10 }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="16" stroke="rgba(13,13,56,0.10)" strokeWidth="1.5" />
          <path d="M14 20h12M20 14v12" stroke="rgba(13,13,56,0.28)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(13,13,56,0.62)", marginBottom: 3 }}>No picks for this period</div>
          <div style={{ fontSize: 12, color: "rgba(13,13,56,0.45)" }}>Click "Edit / Add Top Picks" to enter your investment ideas</div>
        </div>
      </div>
    );
  }

  // Filter → group
  const visiblePicks = selectedIndustry === "All"
    ? picks
    : picks.filter((p) => (p.industry_group || "Other") === selectedIndustry);

  const grouped = visiblePicks.reduce<Record<string, SavedPick[]>>((acc, p) => {
    const key = p.industry_group || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
  const industries = Object.keys(grouped);

  return (
    <div style={{ padding: "20px 24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Industry filter dropdown ─────────────────────────────────────── */}
      {allIndustries.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "rgba(13,13,56,0.45)", fontWeight: 600, whiteSpace: "nowrap" }}>Filter by</span>
          <select
            value={selectedIndustry}
            onChange={(e) => setSelectedIndustry(e.target.value)}
            style={{
              padding:      "5px 10px",
              borderRadius: 7,
              background:   selectedIndustry !== "All" ? "rgba(32,68,220,0.06)" : "#F5F7FD",
              border:       selectedIndustry !== "All" ? "1px solid rgba(32,68,220,0.25)" : "1px solid rgba(13,13,56,0.12)",
              color:        selectedIndustry !== "All" ? "#001EAF" : "rgba(13,13,56,0.62)",
              fontSize:     12,
              fontWeight:   selectedIndustry !== "All" ? 600 : 400,
              cursor:       "pointer",
              outline:      "none",
              fontFamily:   FONT_SECONDARY,
              minWidth:     160,
            }}
          >
            <option value="All">All Industries ({picks.length})</option>
            {allIndustries.map((ind) => (
              <option key={ind} value={ind}>
                {ind} ({picks.filter((p) => (p.industry_group || "Other") === ind).length})
              </option>
            ))}
          </select>
          {selectedIndustry !== "All" && (
            <button
              onClick={() => setSelectedIndustry("All")}
              style={{
                fontSize: 11, color: "rgba(13,13,56,0.62)", background: "transparent",
                border: "none", cursor: "pointer", padding: "4px 6px",
                borderRadius: 5, transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#0D0D38"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(13,13,56,0.62)"; }}
            >
              Clear ×
            </button>
          )}
        </div>
      )}
      {industries.map((industry, groupIdx) => {
        const color    = INDUSTRY_PALETTE[groupIdx % INDUSTRY_PALETTE.length];
        const members  = grouped[industry];

        return (
          <div
            key={industry}
            style={{
              border:       `1px solid ${color.border}`,
              borderRadius: 10,
              overflow:     "hidden",
            }}
          >
            {/* Industry header */}
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "10px 18px",
              background:     color.bg,
              borderLeft:     `4px solid ${color.accent}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: color.accent, letterSpacing: "0.01em" }}>
                  {industry}
                </span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: color.accent,
                background: "rgba(255,255,255,0.65)",
                border: `1px solid ${color.border}`,
                borderRadius: 10,
                padding: "1px 9px",
                fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
              }}>
                {members.length} {members.length === 1 ? "pick" : "picks"}
              </span>
            </div>

            {/* Column labels (only once per group) */}
            <div style={{
              display: "grid",
              gridTemplateColumns: isChile ? "220px 1fr 120px" : "220px 1fr",
              gap: "0 20px",
              padding: "6px 18px 6px 22px",
              borderBottom: "1px solid rgba(13,13,56,0.06)",
              background: "rgba(13,13,56,0.015)",
            }}>
              {["Company", "Investment Thesis", ...(isChile ? ["Target Price"] : [])].map((h) => (
                <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "rgba(13,13,56,0.45)", textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>

            {/* Company rows */}
            {members.map((p, rowIdx) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: isChile ? "220px 1fr 120px" : "220px 1fr",
                  gap: "0 20px",
                  padding: "13px 18px 13px 22px",
                  alignItems: "start",
                  borderBottom: rowIdx < members.length - 1 ? "1px solid rgba(13,13,56,0.05)" : "none",
                  background: rowIdx % 2 === 1 ? "rgba(13,13,56,0.012)" : "transparent",
                }}
              >
                {/* Company name */}
                <div style={{ paddingTop: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: "#0D0D38",
                    letterSpacing: "-0.01em", lineHeight: 1.3,
                  }}>
                    {p.nombre_latam}
                  </div>
                </div>

                {/* Investment thesis — takes all remaining space */}
                <div style={{
                  fontSize: 13, color: "#0D0D38",
                  lineHeight: 1.65, whiteSpace: "pre-wrap",
                }}>
                  {p.comment}
                </div>

                {/* Target price (CHILE only) */}
                {isChile && (
                  <div style={{ paddingTop: 2 }}>
                    {p.target_price != null ? (
                      <span style={{
                        display: "inline-block",
                        fontSize: 13, fontWeight: 700,
                        fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                        color: color.accent,
                        background: color.bg,
                        border: `1px solid ${color.border}`,
                        borderRadius: 5, padding: "2px 8px",
                      }}>
                        {p.target_price.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(13,13,56,0.28)" }}>—</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Summary view (matrix: industry × period) ─────────────────────────────────

function SummaryView({
  region,
  periods,
  isChile,
}: {
  region: Region;
  periods: string[];
  isChile: boolean;
}) {
  const [allData, setAllData] = useState<Record<string, SavedPick[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (periods.length === 0) { setLoading(false); return; }
    setLoading(true);
    Promise.all(
      periods.map((p) =>
        fetch(`/api/top-picks?region=${region}&period_date=${monthValueToISO(p)}`)
          .then((r) => r.json())
          .then((d: { picks?: SavedPick[] }) => [p, d.picks ?? []] as [string, SavedPick[]])
          .catch(() => [p, []] as [string, SavedPick[]])
      )
    ).then((results) => {
      setAllData(Object.fromEntries(results));
      setLoading(false);
    });
  }, [region, periods]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px", gap: 10, color: "rgba(13,13,56,0.45)" }}>
        <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 13 }}>Loading summary…</span>
      </div>
    );
  }

  // Only columns that have at least one pick
  const activePeriods = periods.filter((p) => (allData[p] ?? []).length > 0);

  if (activePeriods.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "rgba(13,13,56,0.45)", fontSize: 13 }}>
        No data to summarize yet.
      </div>
    );
  }

  // All unique industries across all periods, sorted alpha
  const industries = Array.from(
    new Set(Object.values(allData).flat().map((p) => p.industry_group || "Other"))
  ).sort();

  return (
    <div style={{ overflowX: "auto", padding: "20px 24px 28px" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "auto" }}>
        <thead>
          <tr>
            <th style={{
              position: "sticky", left: 0, zIndex: 2,
              background: "#F5F7FD",
              padding: "8px 20px 8px 12px",
              borderBottom: "2px solid rgba(13,13,56,0.10)",
              borderRight: "1px solid rgba(13,13,56,0.08)",
              textAlign: "left",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
              color: "rgba(13,13,56,0.45)", textTransform: "uppercase",
              whiteSpace: "nowrap", minWidth: 170,
            }}>
              Industry
            </th>
            {activePeriods.map((p) => (
              <th key={p} style={{
                padding: "8px 16px",
                borderBottom: "2px solid rgba(13,13,56,0.10)",
                borderLeft: "1px solid rgba(13,13,56,0.06)",
                textAlign: "center",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                color: "rgba(13,13,56,0.62)", textTransform: "uppercase",
                whiteSpace: "nowrap", minWidth: 150,
                background: "#F5F7FD",
              }}>
                {periodLabel(p, isChile)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {industries.map((industry, rowIdx) => {
            const color = INDUSTRY_PALETTE[rowIdx % INDUSTRY_PALETTE.length];
            const rowBg = rowIdx % 2 === 1 ? "rgba(13,13,56,0.013)" : "transparent";
            return (
              <tr key={industry}>
                {/* Industry label — sticky */}
                <td style={{
                  position: "sticky", left: 0, zIndex: 1,
                  background: rowIdx % 2 === 1 ? "#F5F7FD" : "#fff",
                  padding: "11px 20px 11px 0",
                  borderBottom: "1px solid rgba(13,13,56,0.06)",
                  borderRight: "1px solid rgba(13,13,56,0.08)",
                  borderLeft: `3px solid ${color.accent}`,
                  paddingLeft: 10,
                  verticalAlign: "top",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: color.accent, whiteSpace: "nowrap" }}>
                    {industry}
                  </span>
                </td>

                {activePeriods.map((period) => {
                  const cellPicks = (allData[period] ?? []).filter(
                    (p) => (p.industry_group || "Other") === industry
                  );
                  return (
                    <td key={period} style={{
                      padding: "11px 16px",
                      borderBottom: "1px solid rgba(13,13,56,0.06)",
                      borderLeft: "1px solid rgba(13,13,56,0.05)",
                      verticalAlign: "top",
                      background: rowBg,
                    }}>
                      {cellPicks.length === 0 ? (
                        <span style={{ color: "rgba(13,13,56,0.10)", fontSize: 12 }}>—</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {cellPicks.map((pick) => (
                            <div key={pick.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#0D0D38", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                                {pick.nombre_latam}
                              </span>
                              {isChile && pick.target_price != null && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700,
                                  fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                                  color: color.accent,
                                  background: color.bg,
                                  border: `1px solid ${color.border}`,
                                  borderRadius: 4, padding: "1px 6px",
                                  whiteSpace: "nowrap",
                                }}>
                                  {pick.target_price.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function savedPickToRow(p: SavedPick): PickRow {
  return {
    _key:           p.id,
    nombreLatam:    p.nombre_latam,
    displayName:    p.nombre_latam,
    industryGroup:  p.industry_group,
    comment:        p.comment,
    targetPrice:    p.target_price != null ? String(p.target_price) : "",
  };
}

function EditForm({
  region, period, initialPicks, onSaveSuccess, onCancel, onDeleteSuccess,
}: {
  region:          Region;
  period:          string;
  initialPicks:    SavedPick[];
  onSaveSuccess:   (savedPeriod: string) => void;
  onCancel:        () => void;
  onDeleteSuccess: () => void;
}) {
  // formPeriod is independent — the user can change it without clearing rows (rollover)
  const [formPeriod, setFormPeriod] = useState(period);

  // Pre-populate from existing picks; fall back to one empty row
  const [rows, setRows] = useState<PickRow[]>(() =>
    initialPicks.length > 0 ? initialPicks.map(savedPickToRow) : [newRow()]
  );

  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const isChile = region === "CHILE";

  // Existing coverage groups for autocomplete + rename
  const [existingGroups, setExistingGroups] = useState<string[]>([]);
  const [renamePanel, setRenamePanel]       = useState(false);
  const [renameFrom, setRenameFrom]         = useState("");
  const [renameTo, setRenameTo]             = useState("");
  const [renaming, setRenaming]             = useState(false);
  const [renameMsg, setRenameMsg]           = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/top-picks/groups?region=${region}`)
      .then((r) => r.json())
      .then((d: { groups?: string[] }) => setExistingGroups(d.groups ?? []))
      .catch(() => {});
  }, [region]);

  const handleRenameLocal = () => {
    const next = renameTo.trim();
    if (!renameFrom || !next) return;
    setRows((prev) => prev.map((r) =>
      r.industryGroup === renameFrom ? { ...r, industryGroup: next } : r
    ));
    setExistingGroups((prev) =>
      Array.from(new Set(prev.map((g) => (g === renameFrom ? next : g)))).sort()
    );
    setRenameMsg("Renamed in this report");
    setRenameFrom(next);
  };

  const handleRenameAll = async () => {
    const next = renameTo.trim();
    if (!renameFrom || !next) return;
    setRenaming(true);
    setRenameMsg(null);
    try {
      const res = await fetch("/api/top-picks/groups", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ region, oldGroup: renameFrom, newGroup: next }),
      });
      const d = await res.json() as { updated?: number; error?: string };
      if (d.error) throw new Error(d.error);
      setRows((prev) => prev.map((r) =>
        r.industryGroup === renameFrom ? { ...r, industryGroup: next } : r
      ));
      setExistingGroups((prev) =>
        Array.from(new Set(prev.map((g) => (g === renameFrom ? next : g)))).sort()
      );
      setRenameMsg(`Updated ${d.updated} pick${d.updated === 1 ? "" : "s"} across all periods`);
      setRenameFrom(next);
    } catch (e) {
      setRenameMsg(`Error: ${String(e)}`);
    } finally {
      setRenaming(false);
    }
  };

  const updateRow = useCallback((key: string, patch: Partial<PickRow>) => {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, ...patch } : r));
  }, []);

  const handleCompanySelect = useCallback((key: string, result: SearchResult) => {
    const industry = region === "LATAM" ? (result.industriaGics ?? "") : (result.industriaChile ?? "");
    setRows((prev) => prev.map((r) =>
      r._key === key ? { ...r, nombreLatam: result.nombreLatam, displayName: result.nombreLatam, industryGroup: industry } : r
    ));
  }, [region]);

  const addRow    = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r._key !== key));

  const handleSave = async () => {
    setError(null);
    const valid   = rows.filter((r) => r.nombreLatam.trim() && r.industryGroup.trim() && r.comment.trim());
    const skipped = rows.length - valid.length;
    if (valid.length === 0) {
      setError("At least one complete pick is required. Make sure to select the company from the dropdown, then fill in industry and comment.");
      return;
    }
    if (isChile && valid.some((r) => !r.targetPrice.trim())) {
      setError("Target Price is required for all Chile picks.");
      return;
    }
    if (skipped > 0) {
      const ok = window.confirm(
        `${skipped} row${skipped > 1 ? "s" : ""} will be skipped because they are incomplete (company must be selected from the dropdown). Continue saving ${valid.length} pick${valid.length > 1 ? "s" : ""}?`
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/top-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          period_date: monthValueToISO(formPeriod),   // ← uses the form's own period
          picks: valid.map((r) => ({
            nombreLatam:    r.nombreLatam,
            industryGroup: r.industryGroup,
            comment:       r.comment,
            targetPrice:    r.targetPrice ? parseFloat(r.targetPrice) : null,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onSaveSuccess(formPeriod);    // tell the parent which period was saved
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(
      `Delete the entire "${periodLabel(period, isChile)}" report? This removes all its picks and cannot be undone.`
    )) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/top-picks?region=${region}&period_date=${monthValueToISO(period)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onDeleteSuccess();
    } catch (e) {
      setError(String(e));
      setDeleting(false);
    }
  };

  const colTemplate = isChile
    ? "minmax(180px,1.5fr) minmax(130px,1fr) minmax(200px,2fr) 110px 32px"
    : "minmax(180px,1.5fr) minmax(130px,1fr) minmax(200px,2fr) 32px";

  const isRollover = formPeriod !== period;

  return (
    <>
      {/* ── Form period selector ───────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 24px",
        borderBottom: "1px solid rgba(13,13,56,0.06)",
        background: isRollover ? "rgba(255,107,6,0.04)" : "rgba(32,68,220,0.03)",
        flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isRollover ? "#FF6B06" : "rgba(13,13,56,0.62)" }}>
          {isRollover ? "↪ Rollover — saving to:" : "Saving to:"}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="month"
            value={formPeriod}
            onChange={(e) => setFormPeriod(e.target.value)}
            style={{
              padding: "5px 10px", borderRadius: 7,
              background: "#fff",
              border: isRollover
                ? "1px solid rgba(255,107,6,0.45)"
                : "1px solid rgba(32,68,220,0.30)",
              color: "#0D0D38", fontSize: 12, fontWeight: 600,
              outline: "none", fontFamily: FONT_SECONDARY, cursor: "pointer",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(32,68,220,0.55)"; }}
            onBlur={(e)  => {
              (e.currentTarget as HTMLElement).style.borderColor = isRollover
                ? "rgba(255,107,6,0.45)" : "rgba(32,68,220,0.30)";
            }}
          />
          {isChile && formPeriod && (
            <span style={{ fontSize: 11, color: "rgba(13,13,56,0.62)", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
              {quarterLabel(formPeriod)}
            </span>
          )}
        </div>

        {isRollover && (
          <span style={{
            fontSize: 11, color: "#FF6B06",
            background: "rgba(255,107,6,0.08)",
            border: "1px solid rgba(255,107,6,0.22)",
            borderRadius: 6, padding: "2px 8px",
          }}>
            Rows kept — edit freely before saving
          </span>
        )}

        {isRollover && (
          <button
            onClick={() => setFormPeriod(period)}
            style={{
              marginLeft: "auto", fontSize: 11, color: "rgba(13,13,56,0.62)",
              background: "transparent", border: "none",
              cursor: "pointer", padding: "3px 6px",
            }}
          >
            Reset to {periodLabel(period, isChile)}
          </button>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: colTemplate,
        gap: "0 12px", padding: "8px 24px",
        background: "rgba(13,13,56,0.025)",
        borderBottom: "1px solid rgba(13,13,56,0.06)",
      }}>
        {["Company", "Industry Group", "Investment Thesis / Comment", ...(isChile ? ["Target Price"] : []), ""].map((h, i) => (
          <div key={i} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: "rgba(13,13,56,0.45)", textTransform: "uppercase" }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ padding: "8px 24px 4px" }}>
        {rows.map((row, idx) => (
          <div
            key={row._key}
            style={{
              display: "grid", gridTemplateColumns: colTemplate,
              gap: "0 12px", alignItems: "start",
              padding: "8px 0",
              borderBottom: idx < rows.length - 1 ? "1px solid rgba(13,13,56,0.05)" : "none",
            }}
          >
            <CompanyCombobox
              value={row.displayName}
              region={region}
              onSelect={(result) => handleCompanySelect(row._key, result)}
            />

            <input
              type="text"
              list={`ig-list-${region}`}
              value={row.industryGroup}
              onChange={(e) => updateRow(row._key, { industryGroup: e.target.value })}
              placeholder="Auto-filled on select"
              style={{
                width: "100%", padding: "7px 10px", borderRadius: 7,
                background: row.industryGroup ? "rgba(32,68,220,0.06)" : "#F5F7FD",
                border: "1px solid rgba(13,13,56,0.12)",
                color: "#0D0D38", fontSize: 12, outline: "none",
                fontFamily: FONT_SECONDARY, boxSizing: "border-box",
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(32,68,220,0.40)"; }}
              onBlur={(e)  => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.12)"; }}
            />

            <textarea
              value={row.comment}
              onChange={(e) => updateRow(row._key, { comment: e.target.value })}
              placeholder="Investment thesis, catalysts, risks…"
              rows={2}
              style={{
                width: "100%", padding: "7px 10px", borderRadius: 7,
                background: "#F5F7FD", border: "1px solid rgba(13,13,56,0.12)",
                color: "#0D0D38", fontSize: 12, outline: "none",
                fontFamily: FONT_SECONDARY, resize: "vertical",
                boxSizing: "border-box", lineHeight: 1.5,
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(32,68,220,0.40)"; }}
              onBlur={(e)  => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.12)"; }}
            />

            {isChile && (
              <input
                type="number"
                value={row.targetPrice}
                onChange={(e) => updateRow(row._key, { targetPrice: e.target.value })}
                placeholder="e.g. 1450"
                min="0"
                step="any"
                style={{
                  width: "100%", padding: "7px 10px", borderRadius: 7,
                  background: "#F5F7FD", border: "1px solid rgba(13,13,56,0.12)",
                  color: "#0D0D38", fontSize: 12, outline: "none",
                  fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", boxSizing: "border-box",
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(32,68,220,0.40)"; }}
                onBlur={(e)  => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.12)"; }}
              />
            )}

            <button
              onClick={() => removeRow(row._key)}
              disabled={rows.length === 1}
              title="Remove row"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, borderRadius: 6,
                background: "transparent", border: "1px solid transparent",
                color: rows.length === 1 ? "rgba(13,13,56,0.28)" : "rgba(13,13,56,0.45)",
                cursor: rows.length === 1 ? "default" : "pointer",
                marginTop: 2, flexShrink: 0, transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                if (rows.length > 1) {
                  (e.currentTarget as HTMLElement).style.color       = "#F8485E";
                  (e.currentTarget as HTMLElement).style.background  = "rgba(248,72,94,0.06)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(248,72,94,0.18)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color       = rows.length === 1 ? "rgba(13,13,56,0.28)" : "rgba(13,13,56,0.45)";
                (e.currentTarget as HTMLElement).style.background  = "transparent";
                (e.currentTarget as HTMLElement).style.borderColor = "transparent";
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Datalist for industry group autocomplete */}
      <datalist id={`ig-list-${region}`}>
        {existingGroups.map((g) => <option key={g} value={g} />)}
      </datalist>

      {/* Rename coverage group panel */}
      {renamePanel && (
        <div style={{
          margin: "4px 24px 2px",
          padding: "12px 16px",
          borderRadius: 8,
          background: "rgba(0,30,175,0.03)",
          border: "1px solid rgba(0,30,175,0.18)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: "#001EAF", textTransform: "uppercase", marginBottom: 10 }}>
            Rename Coverage Group
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={renameFrom}
              onChange={(e) => { setRenameFrom(e.target.value); setRenameMsg(null); }}
              style={{
                padding: "6px 10px", borderRadius: 7,
                background: "#F5F7FD", border: "1px solid rgba(13,13,56,0.12)",
                color: renameFrom ? "#0D0D38" : "rgba(13,13,56,0.45)",
                fontSize: 12, outline: "none", cursor: "pointer",
                fontFamily: FONT_SECONDARY, minWidth: 160,
              }}
            >
              <option value="">Select group…</option>
              {existingGroups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>

            <span style={{ color: "rgba(13,13,56,0.28)", fontSize: 14, flexShrink: 0 }}>→</span>

            <input
              type="text"
              value={renameTo}
              onChange={(e) => { setRenameTo(e.target.value); setRenameMsg(null); }}
              placeholder="New name…"
              style={{
                padding: "6px 10px", borderRadius: 7,
                background: "#F5F7FD", border: "1px solid rgba(13,13,56,0.12)",
                color: "#0D0D38", fontSize: 12, outline: "none",
                fontFamily: FONT_SECONDARY, minWidth: 140,
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,30,175,0.45)"; }}
              onBlur={(e)  => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.12)"; }}
            />

            <button
              onClick={handleRenameLocal}
              disabled={!renameFrom || !renameTo.trim()}
              style={{
                padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: "transparent",
                border: "1px solid rgba(0,30,175,0.25)",
                color: (!renameFrom || !renameTo.trim()) ? "#88AAFF" : "#001EAF",
                cursor: (!renameFrom || !renameTo.trim()) ? "default" : "pointer",
                transition: "all 0.12s",
              }}
            >
              This report
            </button>

            <button
              onClick={handleRenameAll}
              disabled={!renameFrom || !renameTo.trim() || renaming}
              style={{
                padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                background: (!renameFrom || !renameTo.trim() || renaming) ? "rgba(0,30,175,0.25)" : "#001EAF",
                border: "none",
                color: "#fff",
                cursor: (!renameFrom || !renameTo.trim() || renaming) ? "default" : "pointer",
                transition: "all 0.12s",
              }}
            >
              {renaming ? "Saving…" : "All periods"}
            </button>

            {renameMsg && (
              <span style={{
                fontSize: 11,
                color: renameMsg.startsWith("Error") ? "#F8485E" : "#001EAF",
                fontFamily: FONT_SECONDARY,
              }}>
                {renameMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px 18px", gap: 12, flexWrap: "wrap",
        borderTop: "1px solid rgba(13,13,56,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={addRow}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 7,
              background: "rgba(32,68,220,0.06)", border: "1px solid rgba(32,68,220,0.18)",
              color: "#2044DC", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.10)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.06)"; }}
          >
            <Plus size={13} /> Add Company
          </button>

          <button
            onClick={onCancel}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "7px 12px", borderRadius: 7,
              background: "transparent", border: "1px solid rgba(13,13,56,0.12)",
              color: "rgba(13,13,56,0.62)", fontSize: 12, cursor: "pointer", transition: "all 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.25)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.12)"; }}
          >
            <ChevronLeft size={13} /> Cancel
          </button>

          <button
            onClick={() => { setRenamePanel((v) => !v); setRenameMsg(null); }}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "7px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: renamePanel ? "rgba(0,30,175,0.07)" : "transparent",
              border: renamePanel ? "1px solid rgba(0,30,175,0.28)" : "1px solid rgba(13,13,56,0.10)",
              color: renamePanel ? "#001EAF" : "rgba(13,13,56,0.62)",
              cursor: "pointer", transition: "all 0.12s",
            }}
          >
            ⟳ Rename Group
          </button>

          {/* Delete entire report — only when the period already has saved picks */}
          {initialPicks.length > 0 && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete this entire report"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "7px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: "transparent", border: "1px solid rgba(248,72,94,0.22)",
                color: "#F8485E", cursor: deleting ? "not-allowed" : "pointer", transition: "all 0.12s",
              }}
              onMouseEnter={(e) => { if (!deleting) (e.currentTarget as HTMLElement).style.background = "rgba(248,72,94,0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {deleting ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Trash2 size={13} />}
              Delete report
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {error && (
            <span style={{ fontSize: 12, color: "#F8485E", fontFamily: FONT_SECONDARY, maxWidth: 300 }}>
              {error}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 20px", borderRadius: 8,
              background: saving ? "rgba(32,68,220,0.50)" : "#2044DC",
              border: "none", color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: FONT_SECONDARY, letterSpacing: "-0.01em",
              transition: "background 0.15s", boxShadow: "0 2px 8px rgba(32,68,220,0.25)",
            }}
            onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "#001EAF"; }}
            onMouseLeave={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "#2044DC"; }}
          >
            {saving && <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />}
            {saving ? "Saving…" : "Save Report"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TopPicksForm({ region: regionProp, defaultRegion }: Props) {
  const region  = regionProp ?? defaultRegion ?? "LATAM";
  const isChile = region === "CHILE";
  const isAdmin = useIsAdmin();

  const [mode, setMode]     = useState<"view" | "edit" | "summary">("view");
  const [period, setPeriod] = useState<string | null>(null); // null = loading
  const [periods, setPeriods] = useState<string[]>([]);

  const [picks, setPicks]               = useState<SavedPick[]>([]);
  const [picksLoading, setPicksLoading] = useState(true);
  const [successMsg, setSuccessMsg]     = useState(false);

  // Load available periods once on mount, then default to the most recent
  useEffect(() => {
    fetch(`/api/top-picks/periods?region=${region}`)
      .then((r) => r.json())
      .then((d: { periods?: string[] }) => {
        const list = d.periods ?? [];
        setPeriods(list);
        // Default: most recent period from DB, or fall back to today's period
        setPeriod(list[0] ?? (isChile ? currentQuarterMonthValue() : todayMonthValue()));
      })
      .catch(() => {
        setPeriod(isChile ? currentQuarterMonthValue() : todayMonthValue());
      });
  }, [region, isChile]);

  // Reload picks whenever period changes (and is resolved)
  const loadPicks = useCallback(() => {
    if (!period) return;
    setPicksLoading(true);
    fetch(`/api/top-picks?region=${region}&period_date=${monthValueToISO(period)}`)
      .then((r) => r.json())
      .then((d: { picks?: SavedPick[] }) => setPicks(d.picks ?? []))
      .catch(() => setPicks([]))
      .finally(() => setPicksLoading(false));
  }, [region, period]);

  useEffect(() => { loadPicks(); }, [loadPicks]);

  // Arrow navigation helpers (periods list is newest-first)
  const currentIdx = period ? periods.indexOf(period) : -1;
  const canGoNewer = currentIdx > 0;
  const canGoOlder = currentIdx >= 0 && currentIdx < periods.length - 1;
  const goNewer    = () => { if (canGoNewer) { setPeriod(periods[currentIdx - 1]); setMode("view"); } };
  const goOlder    = () => { if (canGoOlder) { setPeriod(periods[currentIdx + 1]); setMode("view"); } };

  const handleSaveSuccess = (savedPeriod: string) => {
    // Navigate view to the period that was actually saved (supports rollover)
    setPeriod(savedPeriod);
    setMode("view");
    setSuccessMsg(true);
    // Refresh periods list (a rollover may have created a new period)
    fetch(`/api/top-picks/periods?region=${region}`)
      .then((r) => r.json())
      .then((d: { periods?: string[] }) => setPeriods(d.periods ?? []));
    setTimeout(() => setSuccessMsg(false), 4000);
  };

  const handleDeleteSuccess = () => {
    // The current period was deleted — reload the periods list and jump to the newest.
    setMode("view");
    fetch(`/api/top-picks/periods?region=${region}`)
      .then((r) => r.json())
      .then((d: { periods?: string[] }) => {
        const list = d.periods ?? [];
        setPeriods(list);
        setPeriod(list[0] ?? (isChile ? currentQuarterMonthValue() : todayMonthValue()));
      })
      .catch(() => loadPicks());
  };

  const activePeriod = period ?? (isChile ? currentQuarterMonthValue() : todayMonthValue());

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Card — no overflow:hidden so the combobox dropdown can escape */}
      <div style={{
        background: "#fff",
        border: "1px solid rgba(13,13,56,0.08)",
        borderRadius: 14,
        boxShadow: "0 1px 6px rgba(13,13,56,0.06)",
      }}>
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div style={{
          padding: "14px 24px",
          borderBottom: "1px solid rgba(13,13,56,0.07)",
          background: "#F5F7FD",
          borderRadius: "14px 14px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
        }}>
          {/* Left: title + period navigator */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0D0D38", letterSpacing: "-0.01em" }}>
              {region} Top Picks
            </div>

            {/* Timeline navigator — hidden in summary mode */}
            <div style={{ display: mode === "summary" ? "none" : "flex", alignItems: "center", gap: 4 }}>
              {/* Older */}
              <button
                onClick={goOlder}
                disabled={!canGoOlder}
                title="Previous period"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 26, height: 26, borderRadius: 6,
                  background: "transparent", border: "1px solid rgba(13,13,56,0.12)",
                  color: canGoOlder ? "rgba(13,13,56,0.62)" : "rgba(13,13,56,0.28)",
                  cursor: canGoOlder ? "pointer" : "default",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => { if (canGoOlder) { (e.currentTarget as HTMLElement).style.background = "rgba(13,13,56,0.06)"; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <ChevronLeft size={14} />
              </button>

              {/* Period label */}
              <div style={{
                padding: "3px 12px", borderRadius: 6,
                background: "#fff", border: "1px solid rgba(13,13,56,0.12)",
                fontSize: 12, fontWeight: 600, color: "#0D0D38",
                fontFamily: FONT_SECONDARY, minWidth: 110, textAlign: "center",
                whiteSpace: "nowrap",
              }}>
                {periodLabel(activePeriod, isChile)}
                {isChile && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: "rgba(13,13,56,0.45)", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                    {quarterLabel(activePeriod)}
                  </span>
                )}
              </div>

              {/* Newer */}
              <button
                onClick={goNewer}
                disabled={!canGoNewer}
                title="Next period"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 26, height: 26, borderRadius: 6,
                  background: "transparent", border: "1px solid rgba(13,13,56,0.12)",
                  color: canGoNewer ? "rgba(13,13,56,0.62)" : "rgba(13,13,56,0.28)",
                  cursor: canGoNewer ? "pointer" : "default",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => { if (canGoNewer) { (e.currentTarget as HTMLElement).style.background = "rgba(13,13,56,0.06)"; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <ChevronRight size={14} />
              </button>

              {/* Picks count badge */}
              {mode === "view" && picks.length > 0 && (
                <span style={{
                  marginLeft: 4,
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                  background: "rgba(32,68,220,0.08)", color: "#2044DC",
                  border: "1px solid rgba(32,68,220,0.15)",
                }}>
                  {picks.length} picks
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Success toast */}
            {successMsg && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#001EAF" }}>
                <CheckCircle2 size={14} /> Saved successfully
              </span>
            )}

            {/* Summary toggle — visible when not editing */}
            {mode !== "edit" && (
              <button
                onClick={() => setMode(mode === "summary" ? "view" : "summary")}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 8,
                  background: mode === "summary" ? "rgba(32,68,220,0.10)" : "transparent",
                  border: mode === "summary" ? "1px solid rgba(32,68,220,0.28)" : "1px solid rgba(13,13,56,0.12)",
                  color: mode === "summary" ? "#001EAF" : "rgba(13,13,56,0.62)",
                  fontSize: 12, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (mode !== "summary") {
                    (e.currentTarget as HTMLElement).style.background = "rgba(13,13,56,0.04)";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.20)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (mode !== "summary") {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.12)";
                  }
                }}
              >
                <Table2 size={13} /> Summary Table
              </button>
            )}

            {/* Edit button — only in view mode, admins only */}
            {mode === "view" && isAdmin && (
              <button
                onClick={() => setMode("edit")}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 16px", borderRadius: 8,
                  background: "#2044DC", border: "none",
                  color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", transition: "background 0.15s",
                  boxShadow: "0 2px 8px rgba(32,68,220,0.22)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#001EAF"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#2044DC"; }}
              >
                <Pencil size={12} /> Edit / Add Top Picks
              </button>
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        {mode === "view" && (
          <ViewMode picks={picks} loading={picksLoading} isChile={isChile} />
        )}
        {mode === "summary" && (
          <SummaryView region={region} periods={periods} isChile={isChile} />
        )}
        {mode === "edit" && isAdmin && (
          <EditForm
            region={region}
            period={activePeriod}
            initialPicks={picks}
            onSaveSuccess={handleSaveSuccess}
            onCancel={() => setMode("view")}
            onDeleteSuccess={handleDeleteSuccess}
          />
        )}
      </div>
    </>
  );
}
