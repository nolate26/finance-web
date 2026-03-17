# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Research Hub** — plataforma web centralizada de análisis de inversiones. Dark institutional UI. Runs fully on localhost reading local data files.

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
    fondos/route.ts       # Lists Excel files or parses Cartera vs Benchmark sheet
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
  Fondos/                 # Excel fund reports
    Reportes Exposición *.xlsx
```

## Data Notes

**Fondos Excel files:** Only the `MRV` file parses correctly (openpyxl-compatible). `ORANGE` and `PIONERO` files return a zip error — likely an older Excel format. The API handles this gracefully and returns `{ error: "..." }` for those funds.

**Excel parsing:** The `Cartera vs Benchmark` sheet has no standard headers. Data rows are identified by: `col[1]` = numeric rank, `col[3]` = company string, `col[4]` = portfolio %, `col[5]` = benchmark %, `col[6]` = overweight.

**CSV parsing:** Done server-side with `papaparse` (header: true, dynamicTyping: true).

## Design System

Dark blue institutional theme. Key CSS variables in `app/globals.css`:
- Background: `#050B18` → `#0A1628` → `#0F2040`
- Accent: `#3B82F6` (blue), `#06B6D4` (cyan), `#10B981` (green), `#EF4444` (red)
- Positive values: green `#10B981` / Negative: red `#EF4444`
- `.card` class: gradient bg + blue border
- `.grid-bg` class: subtle grid lines on body

## Adding New Funds / Data

- Drop new `.xlsx` files into `data/Fondos/` — they auto-appear in the fund selector (filename must match `DD-MM-YYYY FUNDNAME` pattern)
- Drop updated CSVs into `data/Economia/` — picked up on next API call
- All API routes read from disk on each request (no caching). Add `export const revalidate = 60` to API routes for ISR if needed.
