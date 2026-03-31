"use client";

import { useEffect, useState } from "react";
import { FileText, ExternalLink, Download } from "lucide-react";

interface PdfFile {
  name: string;
  modifiedAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatFileName(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[_-]/g, " ");
}

// ── Mock data for Investment Cases / Client Presentations structure ────────────

interface MockFile {
  title: string;
  description: string;
  date: string;
  fund?: string;
  region: "chile" | "latam";
  category: "investment_cases" | "client_presentations";
  url: string;
}

const MOCK_FILES: MockFile[] = [
  {
    title: "Banco de Chile — Initiation of Coverage",
    description: "Strong capital position and improving ROE trajectory heading into 2026E.",
    date: "2026-02-14",
    region: "chile",
    category: "investment_cases",
    url: "#",
  },
  {
    title: "Copec — FV/EBITDA Re-rating Case",
    description: "Commodity cycle tailwind + capex discipline supports 15% upside to our TP.",
    date: "2026-01-22",
    region: "chile",
    category: "investment_cases",
    url: "#",
  },
  {
    title: "Ternium — Steel Demand Recovery",
    description: "Infrastructure spending in Mexico and Brazil to drive volume growth in H2 2026.",
    date: "2026-03-05",
    region: "latam",
    category: "investment_cases",
    url: "#",
  },
  {
    title: "Grupo Financiero Banorte — Rate Cycle Beneficiary",
    description: "NIM expansion and improving asset quality as Banxico cuts rates gradually.",
    date: "2025-12-10",
    region: "latam",
    category: "investment_cases",
    url: "#",
  },
  {
    title: "Pionero — Monthly Committee Deck",
    description: "Portfolio review, sector weights vs IGPA Small Cap, and attribution analysis.",
    date: "2026-03-13",
    fund: "Pionero",
    region: "chile",
    category: "client_presentations",
    url: "#",
  },
  {
    title: "MRV — Quarterly Investor Presentation",
    description: "Q1 2026 performance, macro outlook, and positioning changes vs IPSA benchmark.",
    date: "2026-03-01",
    fund: "MRV",
    region: "chile",
    category: "client_presentations",
    url: "#",
  },
  {
    title: "Orange — Strategy Update",
    description: "FTSE Chile All Cap tracking error, factor exposures, and ESG overlay summary.",
    date: "2026-02-28",
    fund: "Orange",
    region: "chile",
    category: "client_presentations",
    url: "#",
  },
  {
    title: "LATAM Equities — Investor Day Deck",
    description: "Cross-regional equity strategy for 2026 across Brazil, Mexico, Chile, and Colombia.",
    date: "2026-02-20",
    fund: "MLE",
    region: "latam",
    category: "client_presentations",
    url: "#",
  },
];

const CHILE_FUNDS = ["Pionero", "MRV", "Orange"];
const LATAM_FUNDS = ["MLE", "MSC", "Glory", "Mercer"];

// ── File row component ────────────────────────────────────────────────────────

function FileRow({ file }: { file: MockFile | PdfFile & { category?: string } }) {
  const isMock = "description" in file;
  const title = isMock ? (file as MockFile).title : formatFileName((file as PdfFile).name);
  const description = isMock ? (file as MockFile).description : "";
  const date = isMock ? (file as MockFile).date : (file as PdfFile).modifiedAt;
  const url = isMock
    ? (file as MockFile).url
    : `/api/presentations/download?file=${encodeURIComponent((file as PdfFile).name)}`;

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 last:border-0 transition-colors"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.02)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {/* PDF icon */}
      <div
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg"
        style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)" }}
      >
        <FileText size={16} style={{ color: "#DC2626" }} />
      </div>

      {/* Title + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "#0F172A" }}>
          {title}
        </p>
        {description && (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#64748B" }}>
            {description}
          </p>
        )}
      </div>

      {/* Date */}
      <span
        className="font-mono text-xs flex-shrink-0"
        style={{ color: "#94A3B8", minWidth: 100, textAlign: "right" }}
      >
        {formatDate(date)}
      </span>

      {/* View/Download button */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
        style={{
          background: "rgba(43,92,224,0.08)",
          color: "#2B5CE0",
          border: "1px solid rgba(43,92,224,0.20)",
          textDecoration: "none",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.14)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.08)")}
      >
        <Download size={11} />
        PDF
      </a>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PresentationsPage() {
  const [liveFiles, setLiveFiles] = useState<PdfFile[]>([]);
  const [loading, setLoading] = useState(true);

  const [mainCategory, setMainCategory] = useState<"investment_cases" | "client_presentations">(
    "investment_cases"
  );
  const [region, setRegion] = useState<"chile" | "latam">("chile");
  const [fundFilter, setFundFilter] = useState<string>("All");

  useEffect(() => {
    fetch("/api/presentations")
      .then((r) => r.json())
      .then((d: { files?: PdfFile[] }) => {
        setLiveFiles(d.files ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Reset fund filter when switching region or category
  function handleMainCategory(cat: "investment_cases" | "client_presentations") {
    setMainCategory(cat);
    setFundFilter("All");
  }
  function handleRegion(r: "chile" | "latam") {
    setRegion(r);
    setFundFilter("All");
  }

  // Filter mock files
  const filteredMock = MOCK_FILES.filter((f) => {
    if (f.category !== mainCategory) return false;
    if (f.region !== region) return false;
    if (mainCategory === "client_presentations" && fundFilter !== "All") {
      return f.fund === fundFilter;
    }
    return true;
  });

  const fundOptions = region === "chile" ? CHILE_FUNDS : LATAM_FUNDS;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }}
          />
          <p className="text-sm font-mono" style={{ color: "#64748B" }}>
            Loading presentations...
          </p>
        </div>
      </div>
    );
  }

  // Merge live files into the list (tagged as investment_cases / current region) if any exist
  const liveMapped: MockFile[] = liveFiles.map((f) => ({
    title: formatFileName(f.name),
    description: "",
    date: f.modifiedAt,
    region,
    category: mainCategory,
    url: `/api/presentations/download?file=${encodeURIComponent(f.name)}`,
  }));

  const displayFiles =
    filteredMock.length > 0 ? filteredMock : liveFiles.length > 0 ? liveMapped : [];

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
            Presentations
          </h1>
          <p className="text-xs mt-1" style={{ color: "#64748B" }}>
            Research reports and investor presentations
          </p>
        </div>
        <span
          className="text-xs font-mono px-2 py-1 rounded"
          style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
        >
          {displayFiles.length} document{displayFiles.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Level 1 — Main category tabs */}
      <div
        className="flex items-center gap-1 p-1 rounded-lg mb-4"
        style={{
          background: "rgba(15,23,42,0.04)",
          border: "1px solid rgba(15,23,42,0.08)",
          width: "fit-content",
        }}
      >
        {(
          [
            { key: "investment_cases", label: "Investment Cases" },
            { key: "client_presentations", label: "Client Presentations" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleMainCategory(key)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: mainCategory === key ? "rgba(43,92,224,0.10)" : "transparent",
              color: mainCategory === key ? "#1E3A8A" : "#64748B",
              border:
                mainCategory === key ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Level 2 + 3 — Region tabs + optional fund filter */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        {/* Region sub-tabs */}
        <div
          className="flex items-center gap-1 p-0.5 rounded-md"
          style={{ background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.08)" }}
        >
          {(["chile", "latam"] as const).map((r) => (
            <button
              key={r}
              onClick={() => handleRegion(r)}
              className="px-4 py-1 rounded text-xs font-semibold transition-all"
              style={{
                background: region === r ? "#fff" : "transparent",
                color: region === r ? "#1E3A8A" : "#64748B",
                boxShadow: region === r ? "0 1px 3px rgba(15,23,42,0.10)" : "none",
              }}
            >
              {r === "chile" ? "Chile" : "LATAM"}
            </button>
          ))}
        </div>

        {/* Fund filter (only for client presentations) */}
        {mainCategory === "client_presentations" && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>
              Fund:
            </span>
            <select
              value={fundFilter}
              onChange={(e) => setFundFilter(e.target.value)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                background: "#F8FAFF",
                border: "1px solid rgba(15,23,42,0.10)",
                color: "#334155",
                fontSize: 12,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="All">All Funds</option>
              {fundOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* File list */}
      {displayFiles.length === 0 ? (
        <div
          className="card flex flex-col items-center justify-center py-20 gap-4"
          style={{ color: "#94A3B8" }}
        >
          <FileText size={40} style={{ opacity: 0.3 }} />
          <p className="text-sm">No documents found for this selection.</p>
        </div>
      ) : (
        <div className="card overflow-hidden" style={{ padding: 0 }}>
          {displayFiles.map((file, i) => (
            <FileRow key={i} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}
