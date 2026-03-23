# CLAUDE.md — Research Hub

This file provides guidance to Claude Code when working with this repository.
# CLAUDE.md — Research Hub

This file provides guidance to Claude Code when working with this repository.

---

## Multi-Agent Sequential Workflow Protocol

Claude, you are configured to act as a multi-agent system. When executing complex tasks, you MUST sequence your work by adopting the following 3 distinct roles in order. Never mix these roles in a single execution step.

### Agent 1: The Backend & Data Engineer
**Responsibility:** Data fetching, parsing, and API routes.
1. **Plan:** Analyze CSV structures and the requested feature.
2. **Execute:** Modify `app/api/...` routes. Parse data safely (handling nulls, missing columns).
3. **Output:** Ensure the API returns clean, typed JSON data ready for the frontend.
*Hand-off:* Do not touch React components until the API is fully verified.

### Agent 2: The UI/UX Frontend Engineer
**Responsibility:** React components, Recharts, and Tailwind CSS.
1. **Consume:** Read the JSON structure provided by Agent 1.
2. **Execute:** Build or modify components in `components/` and `app/`. Strictly follow the **Design System** (Light Institutional Theme) and Recharts Patterns.
3. **Refine:** Ensure conditional rendering (e.g., green/red for positive/negative), responsive grids, and geographic separators are applied.
*Hand-off:* Do not proceed until the UI exactly matches the analytical requirements.

### Agent 3: The QA & Corrections Auditor
**Responsibility:** Code quality, TypeScript safety, and bug patching.
1. **Test:** ALWAYS run `npm run lint` and `npx tsc --noEmit`.
2. **Audit:** Check for common Next.js/React bugs (e.g., missing keys in maps, hydration errors, uncontrolled chart axes).
3. **Patch:** If errors are found, fix them silently before presenting the final result to the user.

---

## Project Overview

---

## Agentic Workflow Protocol (The 4 Steps)

Claude, when executing complex tasks, UI refactors, or feature additions, you MUST follow this 4-step protocol:
1. **Context Update:** Check if `CLAUDE.md` needs updating based on the user's request. If rules change, update this file first.
2. **Search & Analyze (Plan):** Use `grep`, `ls`, or AST search tools to locate all affected files. **Present a plan** to the user outlining which files will be touched before making massive changes.
3. **Execute (Edit/Patch):** Apply the changes using tools. Preserve existing logic unless instructed otherwise.
4. **Verify (Test):** ALWAYS run `npm run lint` and `npx tsc --noEmit` after your edits to ensure no types or ESLint rules were broken.

---

## Project Overview

**Research Hub** — plataforma web centralizada de análisis de inversiones para equipos AGF. **Light institutional UI** (Patria style), English-language interface. **Currently running LOCALLY ONLY** (Railway deployment is paused). All data is served from CSV files committed to the repo.

---

## Development Commands

```bash
# Node is at: C:\Program Files\nodejs\  (add to PATH if needed)
export PATH="/c/Program Files/nodejs:$PATH"

npm run dev      # Dev server → http://localhost:3000
npm run lint     # ESLint
npx tsc --noEmit # TypeScript check (no build output)

npm install --prefer-offline   # Use cache on poor connectivity
rm -rf .next && npm run dev    # Hard reset if dev server crashes
```

---

## Architecture

**Pure Next.js 15 (App Router)** — no separate backend. API routes read files server-side on each request (no caching).

```text
app/
  layout.tsx                  # Root layout — renders <Navbar />
  page.tsx                    # Redirects → /economia
  api/
    economia/route.ts          # Reads Economia CSVs → JSON
    macro/route.ts             # Reads macro CSVs → JSON
    commodities/route.ts       # Reads commodities CSVs → JSON
    fondos/route.ts            # Lists & parses Fondos CSVs, Returns, and Sectors
    companies/route.ts         # Reads companies.csv
    projections/route.ts       # Reads latest proyecciones_YYYYMMDD_HHMMSS.csv → JSON
  economia/page.tsx            # Market tab
  fondos/page.tsx              # Funds tab (Chile | LATAM)
  companies/page.tsx           # Companies tab
  projections/page.tsx         # Analyst Projections tab

components/
  Navbar.tsx                   # Fixed top nav
  economia/
    ValuationTable.tsx         # P/E table, geographic groups
    PEHistoryChart.tsx         # Recharts LineChart
    PerformanceTable.tsx       # Returns + EV/EBITDA
    MacroPanel.tsx             # GDP | Inflation | 10Y Rate
    TenYearChart.tsx           # Dual-axis chart
    CommoditiesPanel.tsx       # Historical | Projections
  fondos/
    CarteraChart.tsx           # Horizontal BarChart overweight/underweight (Filterable by Sector)
    CarteraTable.tsx           # Full portfolio table (sortable, default by fund)
    FundReturnsTable.tsx       # Quarterly returns: Net, Gross, Benchmark, OP/UP
  projections/
    ProjectionsTable.tsx       # Double-header table: Ingresos | EBITDA | EBIT | Utilidad per year
  companies/
    # ...

data/
  Economia/
    Economic Data/               # Economia & Macro CSVs
  Fondos/
    Fondos_record/               # Snapshots: {FundName}_{YYYY-MM-DD}.csv
    Retornos/
      retornos_limpio.csv        # Historical performance (YTD, 1Y, 3Y, 5Y, Alpha, etc.)
  Companies/
    companies.csv
    companies_sector.csv         # Mapping: company -> sector
  Projections/
    proyecciones_YYYYMMDD_HHMMSS.csv  # Analyst projections; first line is # Generado: <timestamp>
```

---

## Data Notes

### Fondos CSVs (`/api/fondos`)
- **Portfolio Snapshots**: Live in `data/Fondos/Fondos_record/`. Column detection by position.
- **Returns Data**: Live in `data/Fondos/Retornos/retornos_limpio.csv`. Contains historical performance rows (Net, Gross, Benchmark, OP/UP) grouped by `Fondo`.
- **Sectors**: Cross-referenced with `data/Companies/companies_sector.csv`. The API should match the portfolio's `Empresa` with this file to inject a `Sector` field.
- Fund region classification:
  - `CHILE_FUNDS = { Pionero, Moneda_Renta_Variable, Orange }`
- **UI layout**: Chile/LATAM tabs → fund quick-select → **FundReturnsTable** → portfolio date stepper → sector filter → **CarteraTable + CarteraChart side-by-side on desktop (vertical stack on mobile)**. (KPI cards removed).

---

## Design System & Formatting

Light institutional theme. All UI text in **English**.

- Use `fmtPct` for all return values. Positive alpha/OP in green (`#10B981`), negative in red (`#EF4444`).
- **NM guard**: always run values through a `toNum()` helper.
```