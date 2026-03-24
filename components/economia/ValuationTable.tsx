"use client";

interface ResumenRow {
  Index: string;
  "Today (P/E)": number | null;
  median: number | null;
  max: number | null;
  min: number | null;
  stdDev: number | null;
  discount: number | null;
}

interface Props {
  data: ResumenRow[];
  onSelectIndex: (idx: string) => void;
  selectedIndices: string[];
}

const INDEX_GROUPS = [
  { label: "LATAM",  indices: ["MSCI EM LatAm", "MSCI EM Small Cap", "IPSA (Chile)", "Bovespa (Brasil)", "Mexbol (Mexico)", "Merval (Argentina)", "Colcap (Colombia)", "BVL (Peru)", "SMLLBV (Brasil)"] },
  { label: "EEUU",   indices: ["Dow Jones (US)", "S&P 500 (US)", "Nasdaq 100 (US)", "Russell 2000 (US)"] },
  { label: "EUROPA", indices: ["Stoxx Europe 600", "FTSE 100 (UK)", "DAX (Alemania)", "CAC 40 (Francia)", "Swiss Market (Suiza)"] },
  { label: "ASIA",   indices: ["Nikkei 225 (Japon)", "Topix Index (Japon)", "Hang Seng (Hong Kong)", "Hang Seng Tech (Hong Kong)", "CSI 300 (China)", "Kospi Index (Corea)"] },
  { label: "OTROS",  indices: ["S&P/ASX 200 (Australia)", "Nifty 50 (India)"] },
];

const ALL_GROUPED = new Set(INDEX_GROUPS.flatMap((g) => g.indices));
const SLOT_COLORS = ["#2B5CE0", "#D97706", "#059669"];

function discountColor(d: number | null): string {
  if (d == null) return "#64748B";
  if (d > 10) return "#059669";
  if (d < -10) return "#DC2626";
  return "#D97706";
}

function pct(v: number, min: number, range: number) {
  return Math.max(0, Math.min(100, ((v - min) / range) * 100));
}

function peBar(
  today: number | null,
  median: number | null,
  min: number | null,
  max: number | null,
  stdDev: number | null,
) {
  if (median == null || min == null || max == null || max === min) {
    return { todayPct: null, medianPct: 50, sigmaLeftPct: null, sigmaWidthPct: null };
  }
  const range = max - min;
  const medianPct = pct(median, min, range);
  const todayPct  = today != null ? pct(today, min, range) : null;

  let sigmaLeftPct: number | null = null;
  let sigmaWidthPct: number | null = null;
  if (stdDev != null && stdDev > 0) {
    const lo = Math.max(min, median - stdDev);
    const hi = Math.min(max, median + stdDev);
    sigmaLeftPct  = pct(lo, min, range);
    sigmaWidthPct = pct(hi, min, range) - sigmaLeftPct;
  }

  return { todayPct, medianPct, sigmaLeftPct, sigmaWidthPct };
}

function IndexRow({ row, slot, slotColor, isLast, onSelectIndex }: {
  row: ResumenRow;
  slot: number;
  slotColor: string | null;
  isLast: boolean;
  onSelectIndex: (idx: string) => void;
}) {
  const isActive = slot !== -1;
  const discColor = discountColor(row.discount);
  const { todayPct, medianPct, sigmaLeftPct, sigmaWidthPct } = peBar(row["Today (P/E)"], row.median, row.min, row.max, row.stdDev);

  return (
    <tr
      onClick={() => onSelectIndex(row.Index)}
      className="cursor-pointer transition-all duration-150"
      style={{
        borderBottom: isLast
          ? "2px solid rgba(15,23,42,0.10)"
          : "1px solid rgba(15,23,42,0.05)",
        background: isActive ? `${slotColor}10` : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* Index name */}
      <td className="px-4 py-2.5 font-medium" style={{ color: isActive ? slotColor! : "#334155" }}>
        <div className="flex items-center gap-2">
          {isActive && (
            <span
              className="text-[9px] font-bold font-mono rounded px-1 py-0.5 leading-none"
              style={{ background: `${slotColor}20`, color: slotColor!, border: `1px solid ${slotColor}40` }}
            >
              G{slot + 1}
            </span>
          )}
          {row.Index}
        </div>
      </td>

      {/* P/E Hoy */}
      <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: "#0F172A" }}>
        {row["Today (P/E)"] != null ? `${row["Today (P/E)"]!.toFixed(1)}x` : "—"}
      </td>

      {/* Mediana 10Y */}
      <td className="px-4 py-2.5 font-mono" style={{ color: "#475569" }}>
        {row.median != null ? `${row.median.toFixed(1)}x` : "—"}
      </td>

      {/* Descuento */}
      <td className="px-4 py-2.5">
        {row.discount != null ? (
          <span
            className="font-mono font-semibold text-[11px] px-2 py-0.5 rounded-full"
            style={{ color: discColor, background: `${discColor}14`, border: `1px solid ${discColor}30` }}
          >
            {row.discount > 0 ? "+" : ""}{row.discount.toFixed(1)}%
          </span>
        ) : (
          <span style={{ color: "#CBD5E1" }}>—</span>
        )}
      </td>

      {/* Range ±1σ bar */}
      <td className="px-4 py-2.5 w-44">
        <div
          className="relative h-4 rounded-sm overflow-hidden"
          style={{ background: "rgba(15,23,42,0.06)" }}
        >
          {/* ±1σ band */}
          {sigmaLeftPct != null && sigmaWidthPct != null && (
            <div
              className="absolute top-0 bottom-0 rounded-sm"
              style={{
                left: `${sigmaLeftPct}%`,
                width: `${sigmaWidthPct}%`,
                background: "rgba(100,116,139,0.22)",
              }}
            />
          )}
          {/* Median tick */}
          <div
            className="absolute top-0 bottom-0 w-px"
            style={{ left: `${medianPct}%`, background: "rgba(100,116,139,0.55)" }}
          />
          {/* Today dot */}
          {todayPct != null && (
            <div
              className="absolute top-1 bottom-1 w-1.5 rounded-sm"
              style={{ left: `${todayPct}%`, background: discColor }}
            />
          )}
        </div>
        <div className="flex justify-between mt-0.5 text-[10px]" style={{ color: "#94A3B8" }}>
          <span>{row.min != null ? row.min.toFixed(0) : ""}</span>
          <span>{row.max != null ? row.max.toFixed(0) : ""}</span>
        </div>
      </td>
    </tr>
  );
}

export default function ValuationTable({ data, onSelectIndex, selectedIndices }: Props) {
  const dataMap = new Map(data.map((r) => [r.Index, r]));
  const ungrouped = data.filter((r) => !ALL_GROUPED.has(r.Index));

  return (
    <div className="card overflow-hidden">
      <div
        className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: "rgba(15,23,42,0.07)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Valuación P/E</h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
            Precio/Utilidad actual vs histórico (en moneda local) — click para graficar
          </p>
        </div>
        <span className="text-xs font-mono px-2 py-1 rounded"
          style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
        >
          {data.length} índices
        </span>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "#F0F4FA" }}>
              {["Índice", "P/E Hoy", "Mediana 10Y", "Descuento", "Range ±1σ"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left font-medium tracking-wide"
                  style={{ color: "#64748B" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INDEX_GROUPS.map((group) => {
              const rows = group.indices
                .map((idx) => dataMap.get(idx))
                .filter((r): r is ResumenRow => r !== undefined);
              if (rows.length === 0) return null;
              return (
                <>
                  <tr key={`hdr-${group.label}`}>
                    <td
                      colSpan={5}
                      className="px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase"
                      style={{ background: "#EEF2FA", color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}
                    >
                      {group.label}
                    </td>
                  </tr>
                  {rows.map((row, i) => {
                    const slot = selectedIndices.indexOf(row.Index);
                    return (
                      <IndexRow
                        key={row.Index}
                        row={row}
                        slot={slot}
                        slotColor={slot !== -1 ? SLOT_COLORS[slot] : null}
                        isLast={i === rows.length - 1}
                        onSelectIndex={onSelectIndex}
                      />
                    );
                  })}
                </>
              );
            })}
            {/* Ungrouped indices at the end */}
            {ungrouped.length > 0 && (
              <>
                <tr key="hdr-otros">
                  <td
                    colSpan={5}
                    className="px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase"
                    style={{ background: "#EEF2FA", color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}
                  >
                    OTROS
                  </td>
                </tr>
                {ungrouped.map((row, i) => {
                  const slot = selectedIndices.indexOf(row.Index);
                  return (
                    <IndexRow
                      key={row.Index}
                      row={row}
                      slot={slot}
                      slotColor={slot !== -1 ? SLOT_COLORS[slot] : null}
                      isLast={i === ungrouped.length - 1}
                      onSelectIndex={onSelectIndex}
                    />
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
