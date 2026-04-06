"use client";

import { useEffect, useMemo, useState } from "react";
import ProjectionsTable, { ProjectionRow } from "@/components/projections/ProjectionsTable";
import { Calendar } from "lucide-react";

interface ProjectionsData {
  generatedAt: string | null;
  rows: ProjectionRow[];
}

function formatDate(d: string): string {
  const [datePart, timePart] = d.split(" ");
  const [y, m, day] = datePart.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const hhmm = timePart?.slice(0, 5) ?? "";
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}${hhmm ? ` · ${hhmm}` : ""}`;
}

export default function ProjectionsPage() {
  const [data, setData] = useState<ProjectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string>("");

  useEffect(() => {
    fetch("/api/projections")
      .then((r) => r.json())
      .then((d) => { setData(d as ProjectionsData); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const uniqueSectors = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.rows.map((r) => r.sector).filter(Boolean))).sort();
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!selectedSector) return data.rows;
    return data.rows.filter((r) => r.sector === selectedSector);
  }, [data, selectedSector]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }} />
          <p className="text-sm font-mono" style={{ color: "#64748B" }}>Loading projections...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p style={{ color: "#DC2626" }}>Error loading projections data</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
            Analyst Projections
          </h1>
          <p className="text-xs mt-1" style={{ color: "#64748B" }}>
            Financial estimates for 2025–2027 · Metrics shown only when 3-year series is complete
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {data.generatedAt && (
            <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#94A3B8" }}>
              <Calendar size={11} />
              <span>Generated: {formatDate(data.generatedAt)}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-xs font-mono" style={{ color: "#CBD5E1" }}>
            <span>{filteredRows.length} / {data.rows.length} companies</span>
            <span>Fuente: Proyecciones Chile.xlsx </span>
          </div>
        </div>
      </div>

      {/* Sector filter */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={selectedSector}
          onChange={(e) => setSelectedSector(e.target.value)}
          style={{
            padding: "7px 12px",
            borderRadius: 7,
            background: "#F8FAFF",
            border: "1px solid rgba(15,23,42,0.10)",
            color: selectedSector ? "#0F172A" : "#64748B",
            fontSize: 13,
            cursor: "pointer",
            outline: "none",
            minWidth: 180,
          }}
        >
          <option value="">All Sectors</option>
          {uniqueSectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {selectedSector && (
          <button
            onClick={() => setSelectedSector("")}
            className="text-xs px-2 py-1 rounded"
            style={{ color: "#2B5CE0", background: "rgba(43,92,224,0.08)", border: "1px solid rgba(43,92,224,0.20)" }}
          >
            Clear
          </button>
        )}
      </div>

      <ProjectionsTable rows={filteredRows} />
    </div>
  );
}
