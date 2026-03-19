"use client";

import { Company, SECTOR_MAP } from "@/lib/companies";

interface Props {
  companies: Company[];
  onSectorClick: (sector: string) => void;
  activeSector: string | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function IndustryView({ companies, onSectorClick, activeSector }: Props) {
  // Group by Spanish sector key
  const sectorMap = new Map<string, Company[]>();
  for (const c of companies) {
    const s = (c.sector as string) ?? "Unknown";
    if (!sectorMap.has(s)) sectorMap.set(s, []);
    sectorMap.get(s)!.push(c);
  }

  const sectors = Array.from(sectorMap.entries()).sort((a, b) => b[1].length - a[1].length);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 14,
      }}
    >
      {sectors.map(([spanishSector, cos]) => {
        const displayName = SECTOR_MAP[spanishSector] ?? spanishSector;
        const isActive = activeSector === spanishSector;

        const ebitdaVals = cos
          .map((c) => c.Fv_ebitda_ltm)
          .filter((v): v is number => typeof v === "number");
        const medEbitda = median(ebitdaVals);

        const ret1yVals = cos
          .map((c) => c.ret_1y)
          .filter((v): v is number => typeof v === "number");
        const medRet1y = median(ret1yVals);

        const CHIP_LIMIT = 8;
        const shown = cos.slice(0, CHIP_LIMIT);
        const overflow = cos.length - CHIP_LIMIT;

        return (
          <div
            key={spanishSector}
            onClick={() => onSectorClick(isActive ? "" : spanishSector)}
            className="card"
            style={{
              padding: "16px 18px",
              cursor: "pointer",
              border: isActive
                ? "1px solid rgba(43,92,224,0.5)"
                : "1px solid rgba(43,92,224,0.15)",
              boxShadow: isActive ? "0 0 0 1px rgba(43,92,224,0.2)" : "none",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(43,92,224,0.3)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(43,92,224,0.15)";
              }
            }}
          >
            {/* Title row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isActive ? "#fff" : "#C5D4FF",
                }}
              >
                {displayName}
              </div>
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: isActive ? "rgba(43,92,224,0.2)" : "rgba(43,92,224,0.08)",
                  color: isActive ? "#2B5CE0" : "#475569",
                  border: `1px solid ${isActive ? "rgba(43,92,224,0.4)" : "rgba(43,92,224,0.15)"}`,
                }}
              >
                {cos.length}
              </span>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>
                  Median FV/EBITDA
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}
                >
                  {medEbitda !== null ? medEbitda.toFixed(1) + "x" : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>
                  Median 1Y Ret
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color:
                      medRet1y === null
                        ? "#475569"
                        : medRet1y >= 0
                        ? "#10B981"
                        : "#EF4444",
                  }}
                >
                  {medRet1y !== null
                    ? (medRet1y >= 0 ? "+" : "") + (medRet1y * 100).toFixed(1) + "%"
                    : "—"}
                </div>
              </div>
            </div>

            {/* Company chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {shown.map((c) => (
                <span
                  key={c.company as string}
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(80,128,255,0.07)",
                    color: "#5080FF",
                    border: "1px solid rgba(80,128,255,0.15)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.company as string}
                </span>
              ))}
              {overflow > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(71,85,105,0.15)",
                    color: "#64748B",
                    border: "1px solid rgba(71,85,105,0.2)",
                  }}
                >
                  +{overflow} more
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
