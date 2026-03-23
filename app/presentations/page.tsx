"use client";

import { useEffect, useState } from "react";
import { FileText, ExternalLink } from "lucide-react";

interface PdfFile {
  name: string;
  modifiedAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatFileName(name: string): string {
  // Remove .pdf extension and replace underscores/hyphens with spaces
  return name.replace(/\.pdf$/i, "").replace(/[_-]/g, " ");
}

export default function PresentationsPage() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/presentations")
      .then((r) => r.json())
      .then((d: { files?: PdfFile[] }) => {
        setFiles(d.files ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }} />
          <p className="text-sm font-mono" style={{ color: "#64748B" }}>Loading presentations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
            Presentations
          </h1>
          <p className="text-xs mt-1" style={{ color: "#64748B" }}>
            Research reports and investor presentations — click to open
          </p>
        </div>
        <span className="text-xs font-mono px-2 py-1 rounded"
          style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
        >
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      {files.length === 0 ? (
        <div
          className="card flex flex-col items-center justify-center py-20 gap-4"
          style={{ color: "#94A3B8" }}
        >
          <FileText size={40} style={{ opacity: 0.3 }} />
          <p className="text-sm">No presentations found.</p>
          <p className="text-xs" style={{ color: "#CBD5E1" }}>
            Add PDF files to <code className="font-mono">data/Presentations/</code>
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#F0F4FA" }}>
                <th className="px-5 py-3 text-left font-medium" style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>
                  Document
                </th>
                <th className="px-5 py-3 text-right font-medium" style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)", width: 160 }}>
                  Date
                </th>
                <th className="px-5 py-3 text-center font-medium" style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)", width: 100 }}>
                  Open
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((file, i) => (
                <tr
                  key={file.name}
                  style={{ borderBottom: i < files.length - 1 ? "1px solid rgba(15,23,42,0.05)" : "none" }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <FileText size={16} style={{ color: "#2B5CE0", flexShrink: 0, opacity: 0.7 }} />
                      <span className="font-medium" style={{ color: "#0F172A" }}>
                        {formatFileName(file.name)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs" style={{ color: "#64748B" }}>
                    {formatDate(file.modifiedAt)}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <a
                      href={`/api/presentations/download?file=${encodeURIComponent(file.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all"
                      style={{
                        background: "rgba(43,92,224,0.08)",
                        color: "#2B5CE0",
                        border: "1px solid rgba(43,92,224,0.20)",
                        textDecoration: "none",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.15)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.08)";
                      }}
                    >
                      <ExternalLink size={11} />
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
