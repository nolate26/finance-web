"use client";

import { useRef, useState } from "react";
import { Upload, X, FileText, AlertCircle, RefreshCw } from "lucide-react";
import { FONT_SECONDARY } from "@/lib/patriaTheme";
import CompanyCombobox from "@/components/CompanyCombobox";
import type { FichaRow } from "@/app/api/fichas/route";
import { currentQuarter, quarterKey, quarterLabel, quarterOptions, parseQuarterLabel } from "@/lib/quarters";

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

interface Props {
  defaultCategory: string;
  defaultRegion: string;
  onSave: (pres: Presentation) => void;
  /** Se llama en lugar de onSave cuando la categoría elegida es "fichas". */
  onSaveFicha: (ficha: FichaRow) => void;
  /**
   * Fichas vigentes, para avisar a qué empresa se le va a reemplazar la suya. Sale
   * de la lista que ya tiene la página: evita un fetch y no se desincroniza.
   */
  existingFichas?: FichaRow[];
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "requesting" | "uploading" | "saving";

// Un solo modal para todo el uploader. "fichas" no va a `presentations` sino a la
// tabla `fichas` (ticker obligatorio, sólo PDF, sin origen ni región): el formulario
// cambia de forma según la categoría y el submit elige el endpoint.
type Category = "investment_cases" | "fichas" | "client_presentations" | "sell_side";

const MIME_MAP: Record<string, string> = {
  pdf:  "application/pdf",
  ppt:  "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const ALLOWED_EXTS = new Set(["pdf", "ppt", "pptx"]);
const FICHA_EXTS   = new Set(["pdf"]);

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

function isAllowedFile(file: File, cat: Category): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (cat === "fichas" ? FICHA_EXTS : ALLOWED_EXTS).has(ext);
}

function fileTypeError(cat: Category): string {
  return cat === "fichas" ? "Fichas must be PDF files." : "Only PDF, PPT, and PPTX files are accepted.";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: "100%", padding: "8px 11px",
  border: "1px solid rgba(13,13,56,0.14)", borderRadius: 7,
  fontSize: 13, color: "#0D0D38", background: "#F5F7FD",
  outline: "none", fontFamily: FONT_SECONDARY, boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "rgba(13,13,56,0.62)",
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function CreatePresentationModal({ defaultCategory, defaultRegion, onSave, onSaveFicha, existingFichas = [], onClose }: Props) {
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
  // Fichas: quarter del informe. Por defecto el trimestre calendario actual.
  const [quarterSel,  setQuarterSel]  = useState(() => {
    const q = currentQuarter();
    return quarterLabel(q.fiscalYear, q.quarter);
  });

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
    // Un PPT ya elegido deja de ser válido al pasar a Fichas: se suelta con aviso.
    if (file && !isAllowedFile(file, cat)) { setFile(null); setFileError(fileTypeError(cat)); }
  }

  const isFicha = category === "fichas";

  // Quarter elegido, ya parseado. El selector sólo ofrece etiquetas válidas.
  const quarter = parseQuarterLabel(quarterSel);

  // Ficha vigente de esta empresa: la que se va a reemplazar al guardar.
  const replacing = isFicha && companyTicker
    ? existingFichas.find((f) => f.ticker.toUpperCase() === companyTicker.toUpperCase()) ?? null
    : null;
  // Subir un quarter MÁS VIEJO que el vigente casi siempre es un error de dedo, y
  // acá es destructivo: se avisa distinto, pero no se bloquea.
  const replacingNewer = !!(replacing && quarter &&
    quarterKey(replacing.fiscal_year, replacing.quarter) > quarterKey(quarter.fiscalYear, quarter.quarter));

  // ── File handling ────────────────────────────────────────────────────────────

  function applyFile(f: File) {
    if (!isAllowedFile(f, category)) { setFileError(fileTypeError(category)); return; }
    setFile(f);
    setFileError(null);
    setError(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim());
    // El equipo nombra los archivos "CCU_2Q26.pdf": si el nombre trae el quarter, se
    // toma de ahí en vez de dejar el default del trimestre actual.
    const fromName = f.name.match(/([1-4])\s*[Qq]\s*(\d{2}|\d{4})/);
    if (fromName) {
      const parsed = parseQuarterLabel(`${fromName[1]}Q${fromName[2]}`);
      if (parsed) setQuarterSel(quarterLabel(parsed.fiscalYear, parsed.quarter));
    }
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
    if (!file)                    { setError("Please select a file first.");     return; }
    if (isFicha && !companyTicker) { setError("A company ticker is required for fichas."); return; }
    if (isFicha && !quarter)       { setError("A valid quarter is required (e.g. 2Q26)."); return; }
    if (!title.trim())            { setError("Title is required.");              return; }

    setError(null);
    const contentType = getMimeType(file);

    // Step 1 — presigned URL. Carpeta por ticker para fichas, por categoría/región
    // para el resto, así el bucket queda navegable.
    setPhase("requesting");
    let presignedUrl: string, fileUrl: string, fileKey: string;
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name, contentType,
          folder: isFicha
            ? `fichas/${companyTicker.replace(/[^a-z0-9]/gi, "_")}`
            : `presentations/${category}/${region.replace(/[^a-z0-9]/gi, "_")}`,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(msg ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { presignedUrl: string; fileUrl: string; key: string };
      presignedUrl = data.presignedUrl;
      fileUrl      = data.fileUrl;
      fileKey      = data.key;
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

    // Step 3 — save metadata (only if R2 succeeded). Fichas van a su propia tabla.
    setPhase("saving");
    try {
      if (isFicha) {
        const res = await fetch("/api/fichas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker:      companyTicker,
            fiscal_year: quarter!.fiscalYear,
            quarter:     quarter!.quarter,
            title:       title.trim(),
            description: desc.trim() || null,
            file_url:    fileUrl,
            file_key:    fileKey,
          }),
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(msg ?? `HTTP ${res.status}`);
        }
        const { ficha } = await res.json() as { ficha: FichaRow };
        onSaveFicha(ficha);
        return;
      }

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
        className="modal-overlay"
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(13,13,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }}
        onClick={(e) => { if (!isSubmitting && e.target === e.currentTarget) onClose(); }}
      >
        {/* Card */}
        <div className="modal-card" style={{ background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(13,13,56,0.22)", width: "100%", maxWidth: 560, maxHeight: "calc(100dvh - 40px)", overflowY: "auto" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 16px", borderBottom: "1px solid rgba(13,13,56,0.07)", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0D0D38", margin: 0 }}>Upload document</p>
              <p style={{ fontSize: 11, color: "rgba(13,13,56,0.45)", margin: "3px 0 0", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                {isFicha ? "One PDF, linked to a Bloomberg ticker" : "Select a file, fill in the details, then upload"}
              </p>
            </div>
            <button onClick={onClose} disabled={isSubmitting} style={{ background: "none", border: "none", cursor: isSubmitting ? "not-allowed" : "pointer", color: isSubmitting ? "rgba(13,13,56,0.28)" : "rgba(13,13,56,0.45)", padding: 4, borderRadius: 6 }}>
              <X size={18} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: "20px 22px 24px", display: "flex", flexDirection: "column", gap: 15 }}>

            {/* ── File drop zone ──────────────────────────────────────────── */}
            <div>
              <input ref={inputRef} type="file" accept={isFicha ? ".pdf" : ".pdf,.ppt,.pptx"} style={{ display: "none" }} onChange={handleInputChange} disabled={isSubmitting} />

              {!file ? (
                <div
                  onClick={() => !isSubmitting && inputRef.current?.click()}
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  style={{
                    border: `2px dashed ${isDragging ? "#2044DC" : "rgba(13,13,56,0.15)"}`,
                    borderRadius: 10, padding: "24px 20px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    background: isDragging ? "rgba(32,68,220,0.04)" : "#F5F7FD",
                    transition: "border-color 0.15s, background 0.15s", userSelect: "none",
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: "rgba(32,68,220,0.08)", border: "1px solid rgba(32,68,220,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Upload size={17} color="#2044DC" />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#0D0D38", margin: 0 }}>
                      Drag &amp; drop or <span style={{ color: "#2044DC", textDecoration: "underline" }}>browse</span>
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(13,13,56,0.45)", margin: "3px 0 0" }}>{isFicha ? "PDF only" : "PDF, PPT, PPTX"}</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "rgba(32,68,220,0.04)", border: "1px solid rgba(32,68,220,0.18)", borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: "rgba(248,72,94,0.08)", border: "1px solid rgba(248,72,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText size={15} color="#F8485E" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#0D0D38", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
                    <p style={{ fontSize: 11, color: "rgba(13,13,56,0.45)", margin: "2px 0 0", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>{formatFileSize(file.size)}</p>
                  </div>
                  {!isSubmitting && (
                    <button type="button" onClick={() => { setFile(null); setFileError(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(13,13,56,0.45)", padding: 4, flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
              {fileError && <p style={{ fontSize: 11, color: "#F8485E", margin: "5px 0 0", display: "flex", alignItems: "center", gap: 4 }}><AlertCircle size={12} /> {fileError}</p>}
            </div>

            {/* ── Title ────────────────────────────────────────────────────── */}
            <div>
              <label style={LABEL}>Title <span style={{ color: "#F8485E" }}>*</span></label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Banco de Chile — Initiation of Coverage" disabled={isSubmitting} style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }} autoFocus />
            </div>

            {/* ── Description ──────────────────────────────────────────────── */}
            <div>
              <label style={LABEL}>
                Description <span style={{ color: "rgba(13,13,56,0.45)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              </label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief summary or source (e.g. JPMorgan, Quant Team…)" rows={2} disabled={isSubmitting} style={{ ...INPUT, resize: "vertical", lineHeight: 1.6, opacity: isSubmitting ? 0.6 : 1 }} />
            </div>

            {/* ── Category + Is Sell Side ────────────────────────────────── */}
            <div className="g-stack-sm" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Category */}
              <div>
                <label style={LABEL}>Category</label>
                <select value={category} onChange={(e) => handleCategoryChange(e.target.value as Category)} disabled={isSubmitting} style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }}>
                  <option value="investment_cases">Investment Cases</option>
                  <option value="fichas">Fichas</option>
                  <option value="client_presentations">Client Presentations</option>
                  <option value="sell_side">Sell Side</option>
                </select>
              </div>

              {/* Origen — Moneda / Sell Side toggle (hidden for "sell_side"; fichas no tienen origen) */}
              {isFicha ? (
                <div>
                  <label style={LABEL}>Type</label>
                  <div style={{ display: "flex", alignItems: "center", height: 36 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#001EAF", background: "rgba(32,68,220,0.10)", border: "1px solid #2044DC", borderRadius: 7, padding: "5px 14px" }}>
                      Company ficha
                    </span>
                  </div>
                </div>
              ) : category !== "sell_side" ? (
                <div>
                  <label style={LABEL}>Origin <span style={{ color: "#F8485E" }}>*</span></label>
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
                            borderRadius: 7, border: `1px solid ${active ? "#2044DC" : "rgba(13,13,56,0.14)"}`,
                            background: active ? "rgba(32,68,220,0.10)" : "#F5F7FD",
                            color: active ? "#001EAF" : "rgba(13,13,56,0.62)",
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
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#001EAF", background: "rgba(32,68,220,0.10)", border: "1px solid #2044DC", borderRadius: 7, padding: "5px 14px" }}>
                      Sell Side
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Region / Fund (fichas: el país sale de la maestra, no se pide) ── */}
            {isFicha ? null : category === "client_presentations" ? (
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
                          borderRadius: 7, border: `1px solid ${active ? "#2044DC" : "rgba(13,13,56,0.14)"}`,
                          background: active ? "rgba(32,68,220,0.10)" : "#F5F7FD",
                          color: active ? "#001EAF" : "rgba(13,13,56,0.62)",
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
                Company / Ticker{" "}
                {isFicha
                  ? <span style={{ color: "#F8485E" }}>*</span>
                  : <span style={{ color: "rgba(13,13,56,0.45)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>}
              </label>
              {/* Fichas buscan en TODA la maestra: una empresa puede tener ficha antes que modelo o posición. */}
              <CompanyCombobox
                value={companyTicker}
                onChange={(ticker) => setCompanyTicker(ticker)}
                disabled={isSubmitting}
                includeUniverse={isFicha}
                placeholder={isFicha ? "Search any company in empresas_industrias_v2…" : undefined}
              />
            </div>

            {/* ── Quarter de la ficha + aviso de reemplazo ──────────────── */}
            {isFicha && (
              <div>
                <label style={LABEL}>Quarter <span style={{ color: "#F8485E" }}>*</span></label>
                <select
                  value={quarterSel}
                  onChange={(e) => setQuarterSel(e.target.value)}
                  disabled={isSubmitting}
                  style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }}
                >
                  {quarterOptions().map((q) => {
                    const label = quarterLabel(q.fiscalYear, q.quarter);
                    return <option key={label} value={label}>{label}</option>;
                  })}
                </select>

                {replacing && (
                  <div style={{
                    display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8,
                    padding: "9px 12px", borderRadius: 8,
                    background:  replacingNewer ? "rgba(248,72,94,0.05)" : "rgba(255,107,6,0.06)",
                    border: `1px solid ${replacingNewer ? "rgba(248,72,94,0.22)" : "rgba(255,107,6,0.24)"}`,
                  }}>
                    <RefreshCw size={13} color={replacingNewer ? "#F8485E" : "#FF6B06"} style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 11.5, color: replacingNewer ? "#F8485E" : "#C25205", margin: 0, lineHeight: 1.5 }}>
                      {replacingNewer ? (
                        <>
                          <strong>{replacing.company_name}</strong> ya tiene la ficha de <strong>{replacing.quarter_label}</strong>, que es
                          MÁS NUEVA que {quarterSel}. Si continuás, la de {replacing.quarter_label} se borra y su PDF se elimina.
                        </>
                      ) : (
                        <>
                          Reemplaza la ficha <strong>{replacing.quarter_label}</strong> de <strong>{replacing.company_name}</strong>:
                          al guardar se borra y su PDF se elimina del almacenamiento.
                        </>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Upload progress ───────────────────────────────────────── */}
            {phase === "uploading" && (
              <div>
                <div style={{ height: 5, borderRadius: 5, background: "rgba(32,68,220,0.12)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #2044DC, #88AAFF)", borderRadius: 5, transition: "width 0.2s ease" }} />
                </div>
                <p style={{ fontSize: 10, color: "rgba(13,13,56,0.45)", margin: "4px 0 0", textAlign: "right", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                  {progress}% — uploading to storage…
                </p>
              </div>
            )}

            {/* ── Error ─────────────────────────────────────────────────── */}
            {error && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "rgba(248,72,94,0.05)", border: "1px solid rgba(248,72,94,0.18)", borderRadius: 8 }}>
                <AlertCircle size={14} color="#F8485E" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: "#F8485E", margin: 0, lineHeight: 1.5 }}>{error}</p>
              </div>
            )}

            {/* ── Actions ───────────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 2 }}>
              <button type="button" onClick={onClose} disabled={isSubmitting} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(13,13,56,0.14)", background: "#fff", color: "rgba(13,13,56,0.62)", fontSize: 13, fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.5 : 1 }}>
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: isSubmitting ? "rgba(32,68,220,0.65)" : "#2044DC", color: "#fff", fontSize: 13, fontWeight: 700, cursor: isSubmitting ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, minWidth: 210, justifyContent: "center" }}>
                <SubmitLabel phase={phase} progress={progress} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
