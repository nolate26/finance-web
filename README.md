# Research Hub — Plataforma de Análisis de Inversiones

Plataforma web interna de análisis de inversiones con UI institucional dark. Consolida datos de economía global (P/E históricos) y carteras de fondos en una sola interfaz.

## Stack

- **Next.js 15** (App Router) — frontend + API routes en un solo proyecto
- **Recharts** — gráficos interactivos (LineChart, BarChart)
- **Tailwind CSS** — dark theme institucional
- **PapaParse** — parsing de CSVs server-side

## Tabs

### Economía
- KPI cards: P/E actual de S&P 500, Nasdaq, IPSA, Nikkei
- Tabla de valorización de 18 índices globales con posición vs histórico (±1σ)
- Gráfico de historia P/E con período ajustable (1A / 3A / 5A) y líneas de referencia
- Tabla de retornos y múltiplos (1W → 5Y, EV/EBITDA, P/U, ROE)

### Fondos
- Selector con historial de snapshots por fondo
- Gráfico horizontal overweight/underweight vs benchmark
- Tabla detallada: peso portafolio, benchmark, sobrepondearción, industria, analista, top picks, observaciones

## Estructura de datos

```
data/
  Economia/
    historia_pe_5Y.csv          # P/E diario de 18 índices (2021–hoy)
    resumen_pe.csv              # P/E actual + promedio histórico + ±1σ
    tabla_maestra_comps.csv     # Retornos por período + múltiplos
  Fondos/
    {Fondo}-{DD-MM-YYYY}.csv    # Snapshot de cartera vs benchmark
```

### Agregar nuevos datos

**Economía:** Reemplazar los CSVs en `data/Economia/` — se leen en cada request.

**Fondos:** Agregar un CSV en `data/Fondos/` con el patrón `NombreFondo-DD-MM-YYYY.csv`. El archivo debe tener columnas posicionales:
- col[0]: nombre empresa
- col[1]: `% Portfolio`
- col[2]: `% {nombre_benchmark}` (el nombre se extrae del header)
- col[3]: overweight
- columnas opcionales: `industria`, `analista`, `top_pick`, `observacion`

Múltiples archivos del mismo fondo aparecen como snapshots históricos en el selector.

## Deploy

El proyecto está deployado en [Railway](https://railway.app). Cada push a `main` gatilla un redeploy automático.

### Variables de entorno

No se requieren variables de entorno. La app lee archivos desde `data/` en el filesystem del deploy.

## Desarrollo local

```bash
# Node en Windows (si no está en PATH)
export PATH="/c/Program Files/nodejs:$PATH"

npm install
npm run dev    # → http://localhost:3000
```
