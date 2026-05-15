import QuantModelTable from "@/components/quant/QuantModelTable";

export default function QuantAnalysisPage() {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: 0 }}>
          Quant Analysis
        </h1>
        <p style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
          Multi-factor quantitative model — LatAm Equities ranking &amp; portfolio signals
        </p>
      </div>

      <QuantModelTable />

    </div>
  );
}
