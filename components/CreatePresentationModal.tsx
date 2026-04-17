"use client";

import { useRef, useState } from "react";
import { Upload, X, FileText, AlertCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Presentation {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  category: string;
  region: string;
  company_name: string | null;
  created_at: string;
}

interface Props {
  defaultCategory: string;
  defaultRegion: string;
  onSave: (pres: Presentation) => void;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "requesting" | "uploading" | "saving";

const MIME_MAP: Record<string, string> = {
  pdf:  "application/pdf",
  ppt:  "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const ALLOWED_EXTS = new Set(["pdf", "ppt", "pptx"]);

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

// ── Shared styles ──────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  border: "1px solid rgba(15,23,42,0.14)",
  borderRadius: 7,
  fontSize: 13,
  color: "#0F172A",
  background: "#F8FAFC",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 5,
  display: "block",
};

// ── Submit button label per phase ─────────────────────────────────────────────

function SubmitLabel({ phase, progress }: { phase: Phase; progress: number }) {
  const spinnerStyle: React.CSSProperties = {
    width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
    border: "2px solid rgba(255,255,255,0.30)",
    borderTopColor: "#fff",
    animation: "spin 0.7s linear infinite",
    display: "inline-block",
  };

  if (phase === "requesting") return (
    <><span style={spinnerStyle} /> Getting upload URL…</>
  );
  if (phase === "uploading") return (
    <><span style={spinnerStyle} /> Uploading… {progress}%</>
  );
  if (phase === "saving") return (
    <><span style={spinnerStyle} /> Saving to library…</>
  );
  return <>Upload &amp; Save to Library</>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CreatePresentationModal({
  defaultCategory,
  defaultRegion,
  onSave,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // File state
  const [file,       setFile]       = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError,  setFileError]  = useState<string | null>(null);

  // Form state
  const [title,    setTitle]    = useState("");
  const [desc,     setDesc]     = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [region,   setRegion]   = useState(defaultRegion);
  const [company,  setCompany]  = useState("");

  // Submit state
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error,    setError]    = useState<string | null>(null);

  const isSubmitting = phase !== "idle";

  // ── File selection ──────────────────────────────────────────────────────────

  function applyFile(f: File) {
    if (!isAllowedFile(f)) {
      setFileError("Only PDF, PPT, and PPTX files are accepted.");
      return;
    }
    setFile(f);
    setFileError(null);
    setError(null);
    // Auto-fill title from filename if the field is still empty
    if (!title) {
      setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim());
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
    e.target.value = "";   // allow re-selecting the same file
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) applyFile(f);
  }

  // ── Atomic submit ───────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!file)         { setError("Please select a file first.");  return; }
    if (!title.trim()) { setError("Title is required.");           return; }

    setError(null);
    const contentType = getMimeType(file);

    // ── Step 1: Get presigned URL ─────────────────────────────────────────────
    setPhase("requesting");

    let presignedUrl: string;
    let fileUrl: string;

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename:    file.name,
          contentType,
          folder:      `presentations/${category}/${region}`,
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

    // ── Step 2: PUT directly to R2 ───────────────────────────────────────────
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

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`R2 responded with HTTP ${xhr.status}`));
        });

        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.send(file);
      });
    } catch (err) {
      // Nothing was saved to the DB — no orphan metadata
      setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("idle");
      return;
    }

    // ── Step 3: Save metadata to DB (only reached if R2 succeeded) ───────────
    setPhase("saving");

    try {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:        title.trim(),
          description:  desc.trim()    || null,
          file_url:     fileUrl,
          category,
          region,
          company_name: company.trim() || null,
        }),
      });

      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(msg ?? `HTTP ${res.status}`);
      }

      const { presentation } = await res.json() as { presentation: Presentation };
      onSave(presentation);
    } catch (err) {
      // Edge case: file is in R2 but DB write failed.
      // Show the URL so the user can recover if needed.
      setError(
        `File uploaded but metadata save failed: ${err instanceof Error ? err.message : String(err)}`
      );
      setPhase("idle");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Backdrop */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(15,23,42,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
          backdropFilter: "blur(2px)",
        }}
        onClick={(e) => { if (!isSubmitting && e.target === e.currentTarget) onClose(); }}
      >
        {/* Card */}
        <div style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(15,23,42,0.22)",
          width: "100%",
          maxWidth: 540,
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
        }}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "18px 22px 16px",
            borderBottom: "1px solid rgba(15,23,42,0.07)",
            position: "sticky", top: 0, background: "#fff", zIndex: 1,
          }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>
                New Presentation
              </p>
              <p style={{ fontSize: 11, color: "#94A3B8", margin: "3px 0 0", fontFamily: "JetBrains Mono, monospace" }}>
                Select a file, fill in the details, then upload
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                background: "none", border: "none", cursor: isSubmitting ? "not-allowed" : "pointer",
                color: isSubmitting ? "#CBD5E1" : "#94A3B8", padding: 4, borderRadius: 6,
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Form ───────────────────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} style={{ padding: "20px 22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

            {/* ── File drop zone ──────────────────────────────────────────── */}
            <div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.ppt,.pptx"
                style={{ display: "none" }}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />

              {!file ? (
                /* Empty drop zone */
                <div
                  onClick={() => !isSubmitting && inputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    border: `2px dashed ${isDragging ? "#2B5CE0" : "rgba(15,23,42,0.15)"}`,
                    borderRadius: 10,
                    padding: "28px 20px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    background: isDragging ? "rgba(43,92,224,0.04)" : "#FAFAFA",
                    transition: "border-color 0.15s, background 0.15s",
                    userSelect: "none",
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: "rgba(43,92,224,0.08)",
                    border: "1px solid rgba(43,92,224,0.18)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Upload size={18} color="#2B5CE0" />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#334155", margin: 0 }}>
                      Drag &amp; drop or{" "}
                      <span style={{ color: "#2B5CE0", textDecoration: "underline" }}>browse</span>
                    </p>
                    <p style={{ fontSize: 11, color: "#94A3B8", margin: "4px 0 0" }}>
                      PDF, PPT, PPTX
                    </p>
                  </div>
                </div>
              ) : (
                /* File selected */
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px",
                  background: "rgba(43,92,224,0.04)",
                  border: "1px solid rgba(43,92,224,0.18)",
                  borderRadius: 10,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    background: "rgba(220,38,38,0.08)",
                    border: "1px solid rgba(220,38,38,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <FileText size={16} color="#DC2626" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.name}
                    </p>
                    <p style={{ fontSize: 11, color: "#94A3B8", margin: "2px 0 0", fontFamily: "JetBrains Mono, monospace" }}>
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  {!isSubmitting && (
                    <button
                      type="button"
                      onClick={() => { setFile(null); setFileError(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4, flexShrink: 0 }}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              )}

              {fileError && (
                <p style={{ fontSize: 11, color: "#DC2626", margin: "5px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                  <AlertCircle size={12} /> {fileError}
                </p>
              )}
            </div>

            {/* ── Title ────────────────────────────────────────────────────── */}
            <div>
              <label style={LABEL}>
                Title <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Banco de Chile — Initiation of Coverage"
                disabled={isSubmitting}
                style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }}
                autoFocus
              />
            </div>

            {/* ── Description ──────────────────────────────────────────────── */}
            <div>
              <label style={LABEL}>
                Description{" "}
                <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              </label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Brief summary of the document's content…"
                rows={2}
                disabled={isSubmitting}
                style={{ ...INPUT, resize: "vertical", lineHeight: 1.6, opacity: isSubmitting ? 0.6 : 1 }}
              />
            </div>

            {/* ── Category + Region ────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={LABEL}>Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isSubmitting}
                  style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }}
                >
                  <option value="investment_cases">Investment Cases</option>
                  <option value="client_presentations">Client Presentations</option>
                </select>
              </div>
              <div>
                <label style={LABEL}>Region</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={isSubmitting}
                  style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }}
                >
                  <option value="chile">Chile</option>
                  <option value="latam">LATAM</option>
                </select>
              </div>
            </div>

            {/* ── Company / Fund ────────────────────────────────────────────── */}
            <div>
              <label style={LABEL}>
                {category === "client_presentations" ? "Fund" : "Company / Ticker"}{" "}
                <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              </label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={
                  category === "client_presentations"
                    ? "e.g. Pionero, MRV, Orange…"
                    : "e.g. CCU CI Equity, Banco de Chile…"
                }
                disabled={isSubmitting}
                style={{ ...INPUT, opacity: isSubmitting ? 0.6 : 1 }}
              />
            </div>

            {/* ── Upload progress bar (only during uploading phase) ─────────── */}
            {phase === "uploading" && (
              <div>
                <div style={{
                  height: 5, borderRadius: 5,
                  background: "rgba(43,92,224,0.12)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${progress}%`,
                    background: "linear-gradient(90deg, #2B5CE0, #60A5FA)",
                    borderRadius: 5,
                    transition: "width 0.2s ease",
                  }} />
                </div>
                <p style={{ fontSize: 10, color: "#94A3B8", margin: "4px 0 0", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>
                  {progress}% — uploading to storage…
                </p>
              </div>
            )}

            {/* ── Error message ─────────────────────────────────────────────── */}
            {error && (
              <div style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                padding: "10px 12px",
                background: "rgba(220,38,38,0.05)",
                border: "1px solid rgba(220,38,38,0.18)",
                borderRadius: 8,
              }}>
                <AlertCircle size={14} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: "#B91C1C", margin: 0, lineHeight: 1.5 }}>{error}</p>
              </div>
            )}

            {/* ── Actions ───────────────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 2 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  padding: "8px 18px", borderRadius: 8,
                  border: "1px solid rgba(15,23,42,0.14)",
                  background: "#fff", color: "#64748B",
                  fontSize: 13, fontWeight: 600,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  opacity: isSubmitting ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none",
                  background: isSubmitting ? "rgba(43,92,224,0.65)" : "#2B5CE0",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  display: "inline-flex", alignItems: "center", gap: 7,
                  minWidth: 200, justifyContent: "center",
                }}
              >
                <SubmitLabel phase={phase} progress={progress} />
              </button>
            </div>

          </form>
        </div>
      </div>
    </>
  );
}
