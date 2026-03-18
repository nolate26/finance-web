# CLAUDE.md — Research Hub

This file provides guidance to Claude Code when working with this repository.

---

## Project Overview

**Research Hub** — plataforma web centralizada de análisis de inversiones para equipos AGF. Dark institutional UI, English-language interface. Deployed on Railway (auto-deploy on push to `main`). All data is served from CSV files committed to the repo.

---

## Development Commands

```bash
# Node is at: C:\Program Files\nodejs\  (add to PATH if needed)
export PATH="/c/Program Files/nodejs:$PATH"

npm run dev      # Dev server → http://localhost:3000
npm run build    # Production build (run before pushing to catch errors)
npm run lint     # ESLint
npx tsc --noEmit # TypeScript check (no build output)

npm install --prefer-offline   # Use cache on poor connectivity
rm -rf .next && npm run dev    # Hard reset if dev server crashes
```

---

## Architecture

**Pure Next.js 15 (App Router)** — no separate backend. API routes read files server-side on each request (no caching).

```
app/
  layout.tsx                  # Root layout — renders <Navbar />
  page.tsx                    # Redirects → /economia
  api/
    economia/route.ts          # Reads 3 Economia CSVs → JSON
    macro/route.ts             # Reads macro_details/ CSVs → JSON
    fondos/route.ts            # Lists & parses Fondos CSVs
    companies/route.ts         # Reads companies.csv; ?sector= ?search=
  economia/page.tsx            # Market tab (sub-tabs: Valuations | Macro | Commodities)
  fondos/page.tsx              # Funds tab (Chile | LATAM sub-tabs)
  companies/page.tsx           # Companies tab

lib/
  companies.ts                 # Company type + SECTOR_MAP (ES→EN)

components/
  Navbar.tsx                   # Fixed top nav — Market / Funds / Companies
  economia/
    ValuationTable.tsx         # P/E table (18 indices), mini bar, clickable
    PEHistoryChart.tsx         # Recharts LineChart, period selector, ±1σ refs
    PerformanceTable.tsx       # Returns (1W→5Y) + EV/EBITDA, P/U, ROE
    MacroPanel.tsx             # Country cards + projection table (GDP/Inflation/Rate)
    CommoditiesPanel.tsx       # Commodities table — historical + forecasts
  fondos/
    CarteraChart.tsx           # Horizontal BarChart overweight/underweight
    CarteraTable.tsx           # Full table: #, Empresa, %Port, %Bench, OW, Industria, Analista, Top Pick, Obs
  companies/
    KPISummary.tsx             # 5 KPI cards: count, mkt cap, EV/EBITDA, 1Y ret, recs
    CompanyTable.tsx           # Paginated (20/page) sortable table, clickable rows
    CompanyModal.tsx           # Right-side detail panel: returns chart, multiples, estimates
    IndustryView.tsx           # Sector grid with median metrics + company chips

data/
  Economia/
    historia_pe_5Y.csv         # Daily P/E history — 18 indices (2021–today)
    resumen_pe.csv             # P/E today + hist avg + ±1σ + discount
    tabla_maestra_comps.csv    # Returns by period + EV/EBITDA, P/U, ROE
    macro_details/
      all_countries_annual.csv    # GDP/Inflation/Rate projections 2025–2030 (6 LATAM countries)
      all_countries_quarterly.csv # Same metrics quarterly (Q1 25 – Q4 27)
      Commodities_prices.csv      # Copper, Brent, Iron Ore, Pulp, Soy — hist + forecasts
  Fondos/                         # Pattern: {FundName}_{YYYY-MM-DD}.csv
    # Chile: Pionero, Moneda_Renta_Variable (→ MRV), Orange
    # LATAM: Glory, Mercer, Moneda_Latin_America_Equities_(LX), Moneda_Latin_America_Small_Cap_(LX)
  Companies/
    companies.csv              # ~105 Chilean listed companies, 57 columns
```

---

## Data Notes

### Fondos CSVs
- Filename: `{FundName}_{YYYY-MM-DD}.csv` — the date suffix makes each snapshot unique
- Column detection by **position**: col[0]=company, col[1]=%portfolio, col[2]=%benchmark, col[3]=overweight
- Benchmark name extracted from col[2] header: `"% IPSA"` → `"IPSA"`
- Optional named columns: `industria`, `analista`, `top_pick`, `observacion`
- Fund region classification and display names live in `app/api/fondos/route.ts`:
  - `CHILE_FUNDS = { Pionero, Moneda_Renta_Variable, Orange }`
  - `DISPLAY_NAMES = { Moneda_Renta_Variable → "MRV", Moneda_Latin_America_Equities_(LX) → "LA Equities (LX)", ... }`
- UI layout: Chile/LATAM tabs → fund quick-select → snapshot history pills → KPI strip → **table on top, chart below**

### companies.csv
- ~105 rows, one per company. All monetary values in **MM CLP**
- `sector` uses Spanish labels → mapped to English via `SECTOR_MAP` in `lib/companies.ts`
- `recommendation`: `Mantener` (Hold) / `Comprar` (Buy) / `Vender` (Sell)
- `"NM"` = "Not Meaningful" (e.g. negative P/E) → treat as `null`, **never display raw NM**
- To refresh: `python scripts/excel_to_csv.py --input data/ss.xlsx --output data/Companies/companies.csv`

### macro_details CSVs
- `all_countries_annual.csv`: COUNTRY, METRIC, 2025–2030. Countries: Brazil, Chile, Mexico, Colombia, Peru, Argentina
- Metric names are cleaned to: `GDP Growth`, `Inflation`, `Policy Rate`, `10Y Rate` (mapping in `/api/macro/route.ts`)
- `"-"` values = not available → converted to `null`
- `Commodities_prices.csv`: historical year columns have `.0` suffix (e.g. `2025.0`); forecast columns are `2026e`, `2027e`, `2028e`

---

## Design System

Dark blue institutional theme. All UI text in **English**.

| Token | Value |
|---|---|
| Background (deep) | `#050B18` |
| Background (card) | `#0A1628` |
| Background (elevated) | `#0F2040` |
| Accent blue | `#3B82F6` |
| Accent cyan | `#06B6D4` |
| Positive / Buy | `#10B981` |
| Negative / Sell | `#EF4444` |
| Hold / Warning | `#F59E0B` |
| Text primary | `#E2E8F0` |
| Text muted | `#475569` |

- `.card` class: gradient bg + `1px solid rgba(59,130,246,0.15)` border
- `.grid-bg` class: subtle grid lines on body
- Numbers: `font-mono` (JetBrains Mono)
- Use `style={{}}` props for colors (not Tailwind color utilities) — matches existing patterns
- Formatters: `fmtPct` (+12.3%), `fmtX` (8.2x), `fmtMM` (1,234 MM CLP), `fmtPrice` (1,234.5)
- **NM guard**: always run values through a `toNum()` helper that returns `null` for NM/empty/non-numeric

---

## Railway Deployment

- Repo: `nolate26/finance-web` → auto-deploys on push to `main`
- Region: `europe-west4`
- Build: `npm run build` → `npm start` (Next.js auto-detects)
- No environment variables required
- All data files in `data/` are committed and available at deploy time
- Next.js version: `15.3.8` (fixes CVE-2025-66478 that blocked Railway deploy)

---

## Adding / Refreshing Data

| Data | Action |
|---|---|
| New fund snapshot | Drop `FundName_YYYY-MM-DD.csv` into `data/Fondos/` → commit → push |
| New fund (not in classification) | Add to `CHILE_FUNDS` or leave for LATAM; add `DISPLAY_NAMES` entry in `app/api/fondos/route.ts` |
| Update Economia CSVs | Replace files in `data/Economia/` → commit → push |
| Update macro projections | Replace files in `data/Economia/macro_details/` → commit → push |
| Update companies | Run `scripts/excel_to_csv.py` → commit `data/Companies/companies.csv` → push |

All API routes read from disk on each request — no server restart needed after Railway redeploy.
