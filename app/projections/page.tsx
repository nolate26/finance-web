"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProjectionsTable from "@/components/projections/ProjectionsTable";
import type { ProjectionRowAPI } from "@/app/api/projections/route";
import { Calendar } from "lucide-react";

interface ProjectionsData {
  generatedAt: string | null;
  prevAt:      string | null;
  base_year:   number;
  rows:        ProjectionRowAPI[];
}

function formatDate(d: string): string {
  const [datePart, timePart] = d.split(" ");
  const [y, m, day] = datePart.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const hhmm = timePart?.slice(0, 5) ?? "";
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}${hhmm ? ` · ${hhmm}` : ""}`;
}

export default function ProjectionsPage() {
  const [data, setData]               = useState<ProjectionsData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [selectedSector, setSelectedSector] = useState<string>("");

  // Se reusa al guardar una edición: la vista vuelve a pedir los datos ya con el overlay
  // aplicado, así el Δ y la firma de la celda quedan al día sin recargar la página.
  const load = useCallback(() => {
    fetch("/api/projections")
      .then((r) => r.json())
      .then((d) => { setData(d as ProjectionsData); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

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
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(32,68,220,0.15)", borderTopColor: "#2044DC" }}
          />
          <p className="text-sm font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.62)" }}>
            Loading projections...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p style={{ color: "#F8485E" }}>Error loading projections data</p>
      </div>
    );
  }

  const hasDelta = data.rows.some((r) => r.delta !== null);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "#0D0D38" }}>
            Analyst Projections
          </h1>
          <p className="text-xs mt-1" style={{ color: "rgba(13,13,56,0.62)" }}>
            Financial estimates for {data.base_year}E–{data.base_year + 2}E
            {hasDelta && (
              <span
                style={{
                  marginLeft: 8,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "rgba(32,68,220,0.08)",
                  color: "#2044DC",
                  fontWeight: 600,
                }}
              >
                + revision deltas
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {data.generatedAt && (
            <div className="flex items-center gap-1.5 text-xs font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.45)" }}>
              <Calendar size={11} />
              <span>Latest: {formatDate(data.generatedAt)}</span>
            </div>
          )}
          {data.prevAt && (
            <div className="flex items-center gap-1.5 text-xs font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.28)" }}>
              <Calendar size={11} />
              <span>Previous: {formatDate(data.prevAt)}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-xs font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.28)" }}>
            <span>{filteredRows.length} / {data.rows.length} companies</span>
            <span>Fuente: Proyecciones Chile.xlsx</span>
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
            background: "#F5F7FD",
            border: "1px solid rgba(13,13,56,0.10)",
            color: selectedSector ? "#0D0D38" : "rgba(13,13,56,0.62)",
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
            style={{
              color: "#2044DC",
              background: "rgba(32,68,220,0.08)",
              border: "1px solid rgba(32,68,220,0.20)",
            }}
          >
            Clear
          </button>
        )}
      </div>

      <ProjectionsTable
        rows={filteredRows}
        base_year={data.base_year ?? 2025}
        prevAt={data.prevAt}
        onSaved={load}
      />
    </div>
  );
}
