# CLAUDE.md — Research Hub

This file provides guidance to Claude Code when working with this repository.

## Project Overview
**Research Hub** — plataforma web centralizada de análisis de inversiones para equipos AGF. **Light institutional UI** (Patria style), English-language interface. **Currently running LOCALLY ONLY** (Railway deployment is paused). All data is served from CSV/JSON files committed to the repo.

## Development Commands
```bash
# Node is at: C:\Program Files\nodejs\ 
export PATH="/c/Program Files/nodejs:$PATH"

npm run dev      # Dev server → http://localhost:3000
npm run lint     # ESLint
npx tsc --noEmit # TypeScript check (no build output)


app/
  layout.tsx                  # Root layout — renders <Navbar />
  api/
    economia/route.ts         # Reads Economia CSVs → JSON
    macro/route.ts            # Reads macro CSVs → JSON
    commodities/route.ts      # Reads commodities CSVs → JSON
    fondos/route.ts           # Lists & parses Fondos CSVs, Returns, and Sectors
    chile/stock-selection/route.ts # Reads companies.csv & companies_sector.csv
    chile/top-picks/route.ts  # Manages Top Picks JSON state and uploads
    projections/route.ts      # Reads proyecciones_YYYYMMDD_HHMMSS.csv → JSON
  economia/page.tsx           # Market tab
  fondos/page.tsx             # Funds tab (Chile | LATAM)
  chile/page.tsx              # Chile Equities tab (Stock Selection & Top Picks)
  latam/page.tsx              # LatAm Equities tab (Placeholder)
  projections/page.tsx        # Analyst Projections tab

components/
  Navbar.tsx                  # Fixed top nav
  economia/
    ValuationTable.tsx        # P/E table, geographic groups
    PEHistoryChart.tsx        # Recharts LineChart
    PerformanceTable.tsx      # Returns + EV/EBITDA
    MacroPanel.tsx            # GDP | Inflation | 10Y Rate
    TenYearChart.tsx          # Dual-axis chart
    CommoditiesPanel.tsx      # Historical | Projections
  fondos/
    CarteraTable.tsx          # Full portfolio table
    FundReturnsTable.tsx      # Quarterly returns
  chile/
    CompanyTable.tsx          # Full screen dynamically sized Stock Selection table
    IndicesTable.tsx          # Top summary table with Double Headers
    TopPicksCurrent.tsx       # Vertical list with Target Prices and Rationales
    TopPicksHistorical.tsx    # Scrollable matrix filtered by Year
  projections/
    ProjectionsTable.tsx      # Double-header table

data/
  Economia/
    Economic Data/              # Economia & Macro CSVs
  Fondos/
    Fondos_record/              # Snapshots: {FundName}_{YYYY-MM-DD}.csv
    Retornos/
      retornos_limpio.csv       # Historical performance
  Stock_selection_Chile/
    companies.csv               # Raw company data with top metadata rows
    companies_sector.csv        # Mapping: company -> sector
    indices.csv                 # Index summaries
    top_picks.json              # Historical Top Picks matrix and current rationales
  Projections/
    proyecciones_YYYYMMDD_HHMMSS.csv



ata Notes: Fondos (/api/fondos)
Portfolio Snapshots: Live in data/Fondos/Fondos_record/. Column detection by position.

Returns Data: Live in data/Fondos/Retornos/retornos_limpio.csv. Contains historical performance rows grouped by Fondo.

Sectors: Cross-referenced with data/Stock_selection_Chile/companies_sector.csv. The API matches the portfolio's Empresa with this file to inject a Sector field.

Fund Region Classification: CHILE_FUNDS = { Pionero, Moneda_Renta_Variable, Orange }

UI layout: Chile/LATAM tabs → fund quick-select → FundReturnsTable → portfolio date stepper → sector filter → CarteraTable + CarteraChart side-by-side.

Design System & Formatting
Light institutional theme. All UI text in English.

Colors & Formatting: Use fmtPct for all return values. Positive alpha/OP in green (#10B981), negative in red (#EF4444).

Typography & Hierarchy: Critical data points (like Target Prices) must be visually distinct (larger size, heavier weight, primary brand colors like #1D4ED8).

Tables: Optimize for desktop real estate. Use calc(100vh - Xpx) for main data tables to ensure they stretch to the bottom of the viewport with internal scrolling. Use sticky top-0 for table headers.

Null Safety: NM guard: always run values through a toNum() helper. Handle missing or "NM" strings by rendering a clean, centered dash (—). Never render NaN or undefined in the UI.