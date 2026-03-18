# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Research Hub** — plataforma web centralizada de análisis de inversiones. Dark institutional UI, English-language UI. Deployed on Railway (auto-deploy on push to `main`). Reads data files committed to the repo.

## Development Commands

```bash
# Node is at: C:\Program Files\nodejs\  (add to PATH if needed)
export PATH="/c/Program Files/nodejs:$PATH"

npm run dev      # Start dev server → http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint check
npx tsc --noEmit # TypeScript check (no build output)

# Install (network issues? use --prefer-offline to use npm cache)
npm install --prefer-offline
```

## Architecture

**Pure Next.js 15 (App Router)** — no separate backend. API routes handle all data reading server-side.

```
app/
  layout.tsx              # Root layout with Navbar
  page.tsx                # Redirects → /economia
  api/
    economia/route.ts     # Reads all 3 CSVs, returns JSON
    fondos/route.ts       # Lists CSV files and parses cartera data
    companies/route.ts    # Reads companies.csv; supports ?sector= ?search=
  economia/page.tsx       # Market tab (client component)
  fondos/page.tsx         # Funds tab (client component)
  companies/page.tsx      # Companies tab (client component)
lib/
  companies.ts            # Shared Company type + SECTOR_MAP (Spanish → English)
components/
  Navbar.tsx              # Fixed top nav — tabs: Market / Funds / Companies
  economia/
    ValuationTable.tsx    # P/E table with mini sparkbar + click to select index
    PEHistoryChart.tsx    # Recharts LineChart with reference lines (avg, ±1σ)
    PerformanceTable.tsx  # Returns table (1W/1M/3M/YTD/1Y/3Y/5Y) + multiples
  fondos/
    CarteraChart.tsx      # Horizontal BarChart overweight/underweight sorted
    CarteraTable.tsx      # Detailed table with inline weight bar
  companies/
    KPISummary.tsx        # 5 KPI cards: count, mkt cap, median EV/EBITDA, avg 1Y ret, recs
    CompanyTable.tsx      # Paginated sortable table (20/page), clickable rows
    CompanyModal.tsx      # Right-side detail panel: returns chart, multiples, estimates
    IndustryView.tsx      # Sector grid with median metrics + company chips
data/
  Economia/               # CSV data files
    historia_pe_5Y.csv    # Daily P/E history for 18 indices (2021–today)
    resumen_pe.csv        # P/E today + hist avg + ±1σ + discount
    tabla_maestra_comps.csv  # Returns by period + EV/EBITDA, P/U, ROE
  Fondos/                 # Fund CSV snapshots — pattern: {FundName}_{YYYY-MM-DD}.csv
    # Chile funds: Pionero, Moneda_Renta_Variable (MRV), Orange
    # LATAM funds: Glory, Mercer, Moneda_Latin_America_Equities_(LX), Moneda_Latin_America_Small_Cap_(LX)
  Companies/
    companies.csv         # ~105 Chilean listed companies, 57 columns (schema in caude.md)
```

## Data Notes

### companies.csv
- ~105 rows, one per company. All monetary values in MM CLP.
- `sector` column uses Spanish labels — map to English via `SECTOR_MAP` in `lib/companies.ts`
- `recommendation` values: `Mantener` (Hold) / `Comprar` (Buy) / `Vender` (Sell)
- `"NM"` means "Not Meaningful" (e.g. negative P/E) — treat as `null` everywhere, never display raw
- Refresh: re-run `scripts/excel_to_csv.py --input data/ss.xlsx --output data/Companies/companies.csv` when source Excel is updated

### Fondos CSVs
Filename pattern: `{FundName}_{YYYY-MM-DD}.csv` — the date suffix makes each snapshot unique.

Dynamic column detection by position — col[0]=company, col[1]=portfolio_pct, col[2]=benchmark_pct (header used to extract benchmark name, e.g. `% IPSA` → `IPSA`), col[3]=overweight. Optional named columns: `industria`, `analista`, `top_pick`, `observacion`.

**Fund IDs:** `{FundName}_{YYYY-MM-DD}` — unique key. UI splits funds into Chile / LATAM sub-tabs. Display name mapping lives in `app/api/fondos/route.ts` (`DISPLAY_NAMES`). Chile funds: `Pionero`, `Moneda_Renta_Variable`, `Orange`. LATAM: `Glory`, `Mercer`, `Moneda_Latin_America_Equities_(LX)`, `Moneda_Latin_America_Small_Cap_(LX)`.

**UI layout:** Chile/LATAM region tabs → fund quick-select buttons → snapshot history pills → KPI strip → full-width table → full-width chart.

**CSV parsing:** Done server-side with `papaparse` (header: true, skipEmptyLines: true).

**`xlsx` package removed** — no longer used; all fund data is in CSV format.

## Design System

Dark blue institutional theme. All UI text in **English**. Key CSS variables in `app/globals.css`:
- Background: `#050B18` → `#0A1628` → `#0F2040`
- Accent: `#3B82F6` (blue), `#06B6D4` (cyan), `#10B981` (green), `#EF4444` (red)
- Recommendation colors: Buy `#10B981` / Hold `#F59E0B` / Sell `#EF4444`
- Positive values: green `#10B981` / Negative: red `#EF4444`
- `.card` class: gradient bg + blue border
- `.grid-bg` class: subtle grid lines on body

## Railway Deployment

- Linked to GitHub repo `nolate26/finance-web`, auto-deploys on push to `main`
- Region: `europe-west4`
- Railway auto-detects Next.js — runs `npm run build` then `npm start`
- No environment variables required
- Data files in `data/` are committed to the repo and available at deploy time

## Adding New Funds / Data

- **Fondos:** Drop new CSVs into `data/Fondos/` matching pattern `FundName_YYYY-MM-DD.csv` — auto-appear in fund selector after committing and pushing. To add a new fund to Chile/LATAM classification, update `CHILE_FUNDS` set in `app/api/fondos/route.ts` and add a display name to `DISPLAY_NAMES`.
- **Economía:** Drop updated CSVs into `data/Economia/` — picked up on next API call
- **Companies:** Replace `data/Companies/companies.csv` — picked up on next API call
- All API routes read from disk on each request (no caching)
