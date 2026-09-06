"use client";

import ConsensusCheckTable from "@/components/latam/ConsensusCheckTable";
import { FONT_SECONDARY } from "@/lib/patriaTheme";

export default function EstimatesPage() {
  return (
    <div className="max-w-[1800px] mx-auto px-6 py-6">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>
          Moneda Estimates
        </h1>
        <p style={{ fontSize: 12, marginTop: 5, color: "rgba(13,13,56,0.62)", fontWeight: 500, letterSpacing: "0.01em" }}>
          Moneda analyst estimates vs Bloomberg consensus · latest model snapshot per company
        </p>
      </div>

      <p style={{ fontSize: 12, color: "rgba(13,13,56,0.62)", marginBottom: 14, fontFamily: FONT_SECONDARY }}>
        Click a row to open the full model.
      </p>

      <ConsensusCheckTable />
    </div>
  );
}
