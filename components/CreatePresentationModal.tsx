"use client";

import { useRef, useState, useEffect } from "react";
import { Upload, X, FileText, AlertCircle, ChevronDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Presentation {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  category: string;
  region: string;
  company_name: string | null;
  is_sell_side: boolean;
  created_at: string;
}

interface CompanyOption { ticker: string; nombre: string; }

interface Props {
  defaultCategory: string;
  defaultRegion: string;
  onSave: (pres: Presentation) => void;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "requesting" | "uploading" | "saving";

type Category = "investment_cases" | "client_presentations" | "sell_side";

const MIME_MAP: Record<string, string> = {
  pdf:  "application/pdf",
  ppt:  "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const ALLOWED_EXTS = new Set(["pdf", "ppt", "pptx"]);

// Fund options for "client_presentations" — stored as region value in DB
const CLIENT_FUNDS = [
  { value: "Pionero/MRV", label: "Pionero / MRV",                          group: "Chile"  },
  { value: "Orange",      label: "Orange",                                  group: "Chile"  },
  { value: "LA Equities (LX) / LA Small Cap (LX)",
                          label: "LA Equities (LX) / LA Small Cap (LX)",    group: "LatAm"  },
  { value: "Glory",       label: "Glory",                                   group: "LatAm"  },
  { value: "Mercer",      label: "Mercer",                                  group: "LatAm"  },
] as const;

function defaultRegionFor(cat: Category): string {
  return cat === "client_presentations" ? "Pionero/MRV" : "chile";
}

function getMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? file.type;
}

function isAllowedFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTS.has(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: "100%", padding: "8px 11px",
  border: "1px solid rgba(15,23,42,0.14)", borderRadius: 7,
  fontSize: 13, color: "#0F172A", background: "#F8FAFC",
  outline: "none", fontFamily: "Inter, sans-serif", boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#64748B",
  textTransform: "uppercase", letterSpacing: "0.07em",
  marginBottom: 5, display: "block",
};

// ── Submit button phase label ──────────────────────────────────────────────────

function SubmitLabel({ phase, progress }: { phase: Phase; progress: number }) {
  const spin: React.CSSProperties = {
    width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
    border: "2px solid rgba(255,255,255,0.30)", borderTopColor: "#fff",
    animation: "spin 0.7s linear infinite", display: "inline-block",
  };
  if (phase === "requesting") return <><span style={spin} /> Getting upload URL…</>;
  if (phase === "uploading")  return <><span style={spin} /> Uploading… {progress}%</>;
  if (phase === "saving")     return <><span style={spin} /> Saving to library…</>;
  return <>Upload &amp; Save to Library</>;
}

// ── Company combobox ──────────────────────────────────────────────────────────

function CompanyCombobox({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (ticker: string, nombre: string) => void;
  disabled: boolean;
}) {
  const [query,   setQuery]   = useState("");
  const [open,    setOpen]    = useState(false);
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [display, setDisplay] = useState("");   // human-readable label shown in input
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load company list once
  useEffect(() => {
    fetch("/api/companies/list")
      .then((r) => r.json())
      .then((d: { companies?: CompanyOption[] }) => setOptions(d.companies ?? []))
      .catch(() => {});
  }, []);

  // Sync display label when value is set externally (initial defaultCategory)
  useEffect(() => {
    if (!value) { setDisplay(""); return; }
    const match = options.find((o) => o.ticker === value);
    if (match) setDisplay(`${match.nombre} — ${match.ticker}`);
  }, [value, options]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.nombre.toLowerCase().includes(query.toLowerCase()) ||
          o.ticker.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : options.slice(0, 8);

  function handleSelect(opt: CompanyOption) {
    setDisplay(`${opt.nombre} — ${opt.ticker}`);
    setQuery("");
    setOpen(false);
    onChange(opt.ticker, opt.nombre);
  }

  function handleClear() {
    setDisplay("");
    setQuery("");
    onChange("", "");
  }

  const showClear = !!(display || query) && !disabled;

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          value={open ? query : (display || query)}
          onChange={(e) => { setQuery(e.target.value); setDisplay(""); setOpen(true); onChange("", ""); }}
          onFocus={() => setOpen(true)}
          placeholder="Search company or ticker…"
          disabled={disabled}
          style={{
            ...INPUT,
            paddingRight: 56,
            opacity: disabled ? 0.6 : 1,
          }}
          autoComplete="off"
        />
        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            style={{ position: "absolute", right: 28, background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 2, display: "flex" }}
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown
          size={13}
          style={{ position: "absolute", right: 10, color: "#94A3B8", pointerEvents: "none" }}
        />
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          background: "#fff",
          border: "1px solid rgba(15,23,42,0.12)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
          maxHeight: 220,
          overflowY: "auto",
        }}>
          {filtered.map((opt) => (
            <button
              key={opt.ticker}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start",
                width: "100%", padding: "8px 12px",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: "1px solid rgba(15,23,42,0.05)",
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(43,92,224,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{opt.nombre}</span>
              <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>{opt.ticker}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CreatePresentationModal({ defaultCategory, defaultRegion, onSave, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // File
  const [file,       setFile]       = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError,  setFileError]  = useState<string | null>(null);

  // Form
  const [title,       setTitle]      = useState("");
  const [desc,        setDesc]       = useState("");
  const [category,    setCategory]   = useState<Category>((defaultCategory as Category) || "investment_cases");
  const [region,      setRegion]     = useState(() => defaultRegionFor((defaultCategory as Category) || "investment_cases"));
  const [companyTicker, setCompanyTicker] = useState("");  // stored value (ticker)
  const [isSellSide,  setIsSellSide] = useState(false);

  // Submit
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error,    setError]    = useState<string | null>(null);

  const isSubmitting = phase !== "idle";

  // ── When category changes: reset region + auto-set is_sell_side ─────────────
  function handleCategoryChange(cat: Category) {
    setCategory(cat);
    setRegion(defaultRegionFor(cat));
    if (cat === "sell_side") setIsSellSide(true);
    // don't auto-clear isSellSide when switching away — let user decide
  }

  // ── File handling ────────────────────────────────────────────────────────────

  function applyFile(f: File) {
    if (!isAllowedFile(f)) { setFileError("Only PDF, PPT, and PPTX files are accepted."); return; }
    setFile(f);
    setFileError(null);
    setError(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim());
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) applyFile(f);
  }

  // ── Atomic submit ────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file)         { setError("Please select a file first.");  return; }
    if (!title.trim()) { setError("Title is required.");           return; }

    setError(null);
    const contentType = getMimeType(file);

    // Step 1 — presigned URL
    setPhase("requesting");
    let presignedUrl: string, fileUrl: string;
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name, contentType,
          folder: `presentations/${category}/${region.replace(/[^a-z0-9]/gi, "_")}`,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(msg ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { presignedUrl: string; fileUrl: string };
      presignedUrl = data.presignedUrl;
      fileUrl      = data.fileUrl;
    } catch (err) {
      setError(`Could not get upload URL: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("idle");
      return;
    }

    // Step 2 — upload to R2
    setPhase("uploading");
    setProgress(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.addEventListener("progress", (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        });
        xhr.addEventListener("load",  () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`R2 HTTP ${xhr.status}`)); });
        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.send(file);
      });
    } catch (err) {
      setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("idle");
      return;
    }

    // Step 3 — save metadata (only if R2 succeeded)
    setPhase("saving");
    try {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:        title.trim(),
          description:  desc.trim() || null,
          file_url:     fileUrl,
          category,
          region,
          company_name: companyTicker || null,
          is_sell_side: isSellSide,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(msg ?? `HTTP ${res.status}`);
      }
      const { presentation } = await res.json() as { presentation: Presentation };
      onSave(presentation);
    } catch (err) {
      setError(`File uploaded but metadata save failed: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("idle");
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  // Group CLIENT_FUNDS for the <optgroup> select
  const chileGroups = CLIENT_FUNDS.filter((f) => f.group === "Chile");
  const latamGroups = CLIENT_FUNDS.filter((f) => f.group === "LatAm");

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }}
        onClick={(e) => { if (!isSubmitting && e.target === e.currentTarget) onClose(); }}
      >
        {/* Card */}
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,23,42,0.22)", width: "100%", maxWidth: 560, maxHeight: "calc(100vh - 40px)", overflowY: "auto" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 16px", borderBottom: "1px solid rgba(15,23,42,0.07)", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>New Presentation</p>
              <p style={{ fontSize: 11, color: "#94A3B8", margin: "3px 0 0", fontFamily: "JetBrains Mono, monospace" }}>
                Select a file, fill in the details, then upload
              </p>
            </div>
            <button onClick={onClose} disabled={isSubmitting} style={{ background: "none", border: "none", cursor: isSubmitting ? "not-allowed" : "pointer", color: isSubmitting ? "#CBD5E1" : "#94A3B8", padding: 4, borderRadius: 6 }}>
              <X size={18} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: "20px 22px 24px", display: "flex", flexDirection: "column", gap: 15 }}>

            {/* ── File drop zone ──────────────────────────────────────────── */}
            <div>
              <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" style={{ display: "none" }} onChange={handleInputChange} disabled={isSubmitting} />

              {!file ? (
                <div
                  onClick={() => !isSubmitting && inputRef.current?.click()}
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  style={{
                    border: `2px dashed ${isDragging ? "#2B5CE0" : "rgba(15,23,42,0.15)"}`,
                    borderRadius: 10, padding: "24px 20px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    background: isDragging ? "rgba(43,92,224,0.04)" : "#FAFAFA",
                    transition: "border-color 0.15s, background 0.15s", userSelect: "none",
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: "rgba(43,92,224,0.08)", border: "1px solid rgba(43,92,224,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Upload size={17} color="#2B5CE0" />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#334155", margin: 0 }}>
                      Drag &amp; drop or <span style={{ color: "#2B5CE0", textDecoration: "underline" }}>browse</span>
                    </p>
                    <p style={{ fontSize: 11, color: "#94A3B8", margin: "3px 0 0" }}>PDF, PPT, PPTX</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "rgba(43,92,224,0.04)", border: "1px solid rgba(43,92,224,0.18)", borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText size={15} color="#DC2626" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
                    <p style={{ fontSize: 11, color: "#94A3B8", margin: "2px 0 0", fontFamily: "JetBrains Mono, monospace" }}>{formatFileSize(file.size)}</p>
                  </div>
                  {!isSubmitting && (
                    <button type="button" onClick={() => { setFile(null); setFileError(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4, flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
              {fileError && <p style={{ fontSize: 11, color: "#DC2626", margin: "5px 0 0", display: "flex", alignItems: "center", gap: 4 }}><AlertCircle size={12} /> {fileError}</p>}
            </div>

            {/* ── Title ────────────────────────────────────────────────────── */}
            <div>
              <label style={LABEL}>Title <span style={{ color: "#DC2626" }}>*</span></label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Banco de Chile — Initiation of Coverage" disabled={isSubmitting} style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }} autoFocus />
            </div>

            {/* ── Description ──────────────────────────────────────────────── */}
            <div>
              <label style={LABEL}>
                Description <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              </label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief summary or source (e.g. JPMorgan, Quant Team…)" rows={2} disabled={isSubmitting} style={{ ...INPUT, resize: "vertical", lineHeight: 1.6, opacity: isSubmitting ? 0.6 : 1 }} />
            </div>

            {/* ── Category + Is Sell Side ────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Category */}
              <div>
                <label style={LABEL}>Category</label>
                <select value={category} onChange={(e) => handleCategoryChange(e.target.value as Category)} disabled={isSubmitting} style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }}>
                  <option value="investment_cases">Investment Cases</option>
                  <option value="client_presentations">Client Presentations</option>
                  <option value="sell_side">Sell Side</option>
                </select>
              </div>

              {/* Origen — Moneda / Sell Side toggle (hidden for "sell_side" category) */}
              {category !== "sell_side" ? (
                <div>
                  <label style={LABEL}>Origin <span style={{ color: "#DC2626" }}>*</span></label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { label: "Moneda",    value: false },
                      { label: "Sell Side", value: true  },
                    ].map((opt) => {
                      const active = isSellSide === opt.value;
                      return (
                        <button
                          key={String(opt.value)}
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setIsSellSide(opt.value)}
                          style={{
                            flex: 1, padding: "7px 8px",
                            borderRadius: 7, border: `1px solid ${active ? "#2B5CE0" : "rgba(15,23,42,0.14)"}`,
                            background: active ? "rgba(43,92,224,0.10)" : "#F8FAFC",
                            color: active ? "#1E3A8A" : "#64748B",
                            fontSize: 12, fontWeight: 700,
                            cursor: isSubmitting ? "not-allowed" : "pointer",
                            transition: "all 0.12s",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // "Sell Side" category → always sell_side, show badge
                <div>
                  <label style={LABEL}>Origin</label>
                  <div style={{ display: "flex", alignItems: "center", height: 36 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1E3A8A", background: "rgba(43,92,224,0.10)", border: "1px solid #2B5CE0", borderRadius: 7, padding: "5px 14px" }}>
                      Sell Side
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Region / Fund ─────────────────────────────────────────── */}
            {category === "client_presentations" ? (
              <div>
                <label style={LABEL}>Fund</label>
                <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={isSubmitting} style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }}>
                  <optgroup label="── Chile">
                    {chileGroups.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </optgroup>
                  <optgroup label="── LatAm">
                    {latamGroups.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </optgroup>
                </select>
              </div>
            ) : (
              <div>
                <label style={LABEL}>Region</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { label: "Chile", value: "chile" },
                    { label: "LatAm", value: "latam" },
                  ].map((opt) => {
                    const active = region === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => setRegion(opt.value)}
                        style={{
                          flex: 1, padding: "7px 8px",
                          borderRadius: 7, border: `1px solid ${active ? "#2B5CE0" : "rgba(15,23,42,0.14)"}`,
                          background: active ? "rgba(43,92,224,0.10)" : "#F8FAFC",
                          color: active ? "#1E3A8A" : "#64748B",
                          fontSize: 12, fontWeight: 700,
                          cursor: isSubmitting ? "not-allowed" : "pointer",
                          transition: "all 0.12s",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Company autocomplete ──────────────────────────────────── */}
            <div>
              <label style={LABEL}>
                Company / Ticker <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              </label>
              <CompanyCombobox
                value={companyTicker}
                onChange={(ticker) => setCompanyTicker(ticker)}
                disabled={isSubmitting}
              />
            </div>

            {/* ── Upload progress ───────────────────────────────────────── */}
            {phase === "uploading" && (
              <div>
                <div style={{ height: 5, borderRadius: 5, background: "rgba(43,92,224,0.12)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #2B5CE0, #60A5FA)", borderRadius: 5, transition: "width 0.2s ease" }} />
                </div>
                <p style={{ fontSize: 10, color: "#94A3B8", margin: "4px 0 0", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>
                  {progress}% — uploading to storage…
                </p>
              </div>
            )}

            {/* ── Error ─────────────────────────────────────────────────── */}
            {error && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.18)", borderRadius: 8 }}>
                <AlertCircle size={14} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: "#B91C1C", margin: 0, lineHeight: 1.5 }}>{error}</p>
              </div>
            )}

            {/* ── Actions ───────────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 2 }}>
              <button type="button" onClick={onClose} disabled={isSubmitting} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(15,23,42,0.14)", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.5 : 1 }}>
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: isSubmitting ? "rgba(43,92,224,0.65)" : "#2B5CE0", color: "#fff", fontSize: 13, fontWeight: 700, cursor: isSubmitting ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, minWidth: 210, justifyContent: "center" }}>
                <SubmitLabel phase={phase} progress={progress} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
