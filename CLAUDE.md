# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Research Hub** — plataforma web centralizada de análisis de inversiones. Dark institutional UI. Deployed on Railway (auto-deploy on push to `main`). Reads data files committed to the repo.

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
  economia/page.tsx       # Economía tab (client component)
  fondos/page.tsx         # Fondos tab (client component)
components/
  Navbar.tsx              # Fixed top nav, tab switching
  economia/
    ValuationTable.tsx    # P/E table with mini sparkbar + click to select index
    PEHistoryChart.tsx    # Recharts LineChart with reference lines (avg, ±1σ)
    PerformanceTable.tsx  # Returns table (1W/1M/3M/YTD/1Y/3Y/5Y) + multiples
  fondos/
    CarteraChart.tsx      # Horizontal BarChart overweight/underweight sorted
    CarteraTable.tsx      # Detailed table with inline weight bar
data/
  Economia/               # CSV data files
    historia_pe_5Y.csv    # Daily P/E history for 18 indices (2021–today)
    resumen_pe.csv        # P/E today + hist avg + ±1σ + discount
    tabla_maestra_comps.csv  # Returns by period + EV/EBITDA, P/U, ROE
  Fondos/                 # Fund CSV snapshots
    {FundName}-{DD-MM-YYYY}.csv
```

## Data Notes

**Fondos CSVs:** Dynamic column detection by position — col[0]=company, col[1]=portfolio_pct, col[2]=benchmark_pct (header used to extract benchmark name, e.g. `% IPSA` → `IPSA`), col[3]=overweight. Optional named columns: `industria`, `analista`, `top_pick`, `observacion`.

**Fund IDs:** `{NAME}-{DD-MM-YYYY}` — unique across multiple snapshots of the same fund. Quick-switch buttons show the latest snapshot per fund; the dropdown shows all snapshots.

**CSV parsing:** Done server-side with `papaparse` (header: true, skipEmptyLines: true).

**`xlsx` package removed** — no longer used; all fund data is in CSV format.

## Design System

Dark blue institutional theme. Key CSS variables in `app/globals.css`:
- Background: `#050B18` → `#0A1628` → `#0F2040`
- Accent: `#3B82F6` (blue), `#06B6D4` (cyan), `#10B981` (green), `#EF4444` (red)
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

- Drop new CSVs into `data/Fondos/` matching pattern `FundName-DD-MM-YYYY.csv` — auto-appear in fund selector after committing and pushing
- Drop updated CSVs into `data/Economia/` — picked up on next API call
- All API routes read from disk on each request (no caching)
