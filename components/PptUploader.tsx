"use client";

import { useRef, useState } from "react";
import { Upload, CheckCircle, XCircle, Copy, Check, FileText } from "lucide-react";

type UploadState = "idle" | "requesting" | "uploading" | "success" | "error";

interface PptUploaderProps {
  /** Optional R2 subfolder (e.g. "presentations", "investment_cases"). Defaults to "uploads". */
  folder?: string;
  /** Called after a successful upload with the public file URL. */
  onSuccess?: (fileUrl: string, key: string) => void;
  label?: string;
  accept?: string;
}

const MIME_MAP: Record<string, string> = {
  pdf:  "application/pdf",
  ppt:  "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function getMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? file.type;
}

export default function PptUploader({
  folder,
  onSuccess,
  label = "Upload PDF / PPT",
  accept = ".pdf,.ppt,.pptx",
}: PptUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleFile(file: File) {
    setFileName(file.name);
    setErrorMsg(null);
    setFileUrl(null);
    setProgress(0);

    const contentType = getMimeType(file);

    // ── Step 1: get presigned URL from our API ────────────────────────────────
    setState("requesting");
    let presignedUrl: string;
    let publicUrl: string;
    let key: string;

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType, folder }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { presignedUrl: string; fileUrl: string; key: string };
      presignedUrl = data.presignedUrl;
      publicUrl    = data.fileUrl;
      key          = data.key;
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to get upload URL");
      return;
    }

    // ── Step 2: PUT directly to R2 via presigned URL ──────────────────────────
    setState("uploading");

    try {
      // XMLHttpRequest gives us real upload progress; fetch doesn't
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", contentType);

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`R2 upload failed — HTTP ${xhr.status}`));
        });

        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.send(file);
      });

      setFileUrl(publicUrl);
      setState("success");
      onSuccess?.(publicUrl, key);
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload to R2 failed");
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be re-selected after an error
    e.target.value = "";
  }

  async function copyUrl() {
    if (!fileUrl) return;
    await navigator.clipboard.writeText(fileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setState("idle");
    setProgress(0);
    setFileUrl(null);
    setFileName(null);
    setErrorMsg(null);
    setCopied(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={handleInputChange}
        disabled={state === "requesting" || state === "uploading"}
      />

      {/* ── IDLE ── */}
      {state === "idle" && (
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            8,
            padding:        "8px 16px",
            background:     "rgba(43,92,224,0.08)",
            border:         "1px solid rgba(43,92,224,0.22)",
            borderRadius:   8,
            color:          "#2B5CE0",
            fontSize:       13,
            fontWeight:     600,
            cursor:         "pointer",
            transition:     "background 0.15s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(43,92,224,0.14)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(43,92,224,0.08)")}
        >
          <Upload size={15} />
          {label}
        </button>
      )}

      {/* ── REQUESTING / UPLOADING ── */}
      {(state === "requesting" || state === "uploading") && (
        <div style={{
          display:        "flex",
          flexDirection:  "column",
          gap:            8,
          padding:        "10px 14px",
          background:     "#F8FAFC",
          border:         "1px solid rgba(15,23,42,0.10)",
          borderRadius:   8,
          minWidth:       240,
        }}>
          {/* File name row */}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <FileText size={14} color="#64748B" />
            <span style={{ fontSize: 12, color: "#475569", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName}
            </span>
          </div>

          {state === "requesting" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "2px solid rgba(43,92,224,0.15)",
                borderTopColor: "#2B5CE0",
                animation: "spin 0.8s linear infinite",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
                Requesting upload URL…
              </span>
            </div>
          )}

          {state === "uploading" && (
            <>
              {/* Progress bar */}
              <div style={{ height: 4, borderRadius: 4, background: "rgba(43,92,224,0.12)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width:  `${progress}%`,
                  background: "linear-gradient(90deg, #2B5CE0, #60A5FA)",
                  borderRadius: 4,
                  transition: "width 0.2s ease",
                }} />
              </div>
              <span style={{ fontSize: 11, color: "#64748B", fontFamily: "JetBrains Mono, monospace", textAlign: "right" }}>
                {progress}%
              </span>
            </>
          )}
        </div>
      )}

      {/* ── SUCCESS ── */}
      {state === "success" && fileUrl && (
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           8,
          padding:       "10px 14px",
          background:    "rgba(22,163,74,0.06)",
          border:        "1px solid rgba(22,163,74,0.20)",
          borderRadius:  8,
          minWidth:      240,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <CheckCircle size={15} color="#16A34A" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#15803D" }}>Upload complete</span>
          </div>

          {/* URL row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              flex: 1, fontSize: 11, color: "#475569",
              fontFamily: "JetBrains Mono, monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              background: "#F1F5F9", borderRadius: 4, padding: "3px 7px",
              border: "1px solid rgba(15,23,42,0.07)",
            }}>
              {fileUrl}
            </span>
            <button
              onClick={copyUrl}
              title="Copy URL"
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:          4,
                padding:      "4px 10px",
                borderRadius: 6,
                border:       "1px solid rgba(15,23,42,0.12)",
                background:   copied ? "rgba(22,163,74,0.10)" : "#fff",
                color:        copied ? "#15803D" : "#64748B",
                fontSize:     11,
                fontWeight:   600,
                cursor:       "pointer",
                transition:   "all 0.15s",
                flexShrink:   0,
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Upload another */}
          <button
            onClick={reset}
            style={{
              alignSelf:    "flex-start",
              background:   "transparent",
              border:       "none",
              padding:      0,
              fontSize:     11,
              color:        "#94A3B8",
              cursor:       "pointer",
              textDecoration: "underline",
            }}
          >
            Upload another file
          </button>
        </div>
      )}

      {/* ── ERROR ── */}
      {state === "error" && (
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           7,
          padding:       "10px 14px",
          background:    "rgba(220,38,38,0.05)",
          border:        "1px solid rgba(220,38,38,0.18)",
          borderRadius:  8,
          minWidth:      240,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <XCircle size={15} color="#DC2626" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#B91C1C" }}>Upload failed</span>
          </div>
          {errorMsg && (
            <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
              {errorMsg}
            </span>
          )}
          <button
            onClick={() => { reset(); setTimeout(() => inputRef.current?.click(), 50); }}
            style={{
              alignSelf:    "flex-start",
              background:   "transparent",
              border:       "none",
              padding:      0,
              fontSize:     11,
              color:        "#2B5CE0",
              cursor:       "pointer",
              fontWeight:   600,
            }}
          >
            Try again
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
