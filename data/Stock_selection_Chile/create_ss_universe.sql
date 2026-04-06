-- DDL generado desde schema.prisma → model SsUniverse
-- Ejecutar en DBeaver contra research_db antes de correr el script Python.

CREATE TABLE IF NOT EXISTS ss_universe (
    -- ── Primary Key (composite) ─────────────────────────────────────────────
    cierre_cartera   DATE          NOT NULL,
    record_type      VARCHAR(20)   NOT NULL,   -- 'company' | 'index'
    company          VARCHAR(200)  NOT NULL,

    -- ── Metadata ─────────────────────────────────────────────────────────────
    source_file      VARCHAR(255),
    precios          VARCHAR(50),              -- fecha snapshot de precios
    resultados       VARCHAR(50),              -- quarter de resultados, e.g. "3Q 2025"

    -- ── Relative performance vs benchmarks ───────────────────────────────────
    pio_vs_igpa_mc_sc DOUBLE PRECISION,
    mrv_vs_ipsa       DOUBLE PRECISION,

    -- ── Qualitative / string fields ──────────────────────────────────────────
    recommendation   VARCHAR(50),
    rec_date         VARCHAR(50),
    div_policy       VARCHAR(100),
    sector           VARCHAR(100),

    -- ── Price & returns ───────────────────────────────────────────────────────
    price            DOUBLE PRECISION,
    target_price     DOUBLE PRECISION,
    ret_1m           DOUBLE PRECISION,
    ret_ytd          DOUBLE PRECISION,
    ret_1y           DOUBLE PRECISION,
    ret_5y           DOUBLE PRECISION,

    -- ── Balance sheet ─────────────────────────────────────────────────────────
    mkt_cap_bn       DOUBLE PRECISION,
    net_debt         DOUBLE PRECISION,
    fv               DOUBLE PRECISION,

    -- ── EBITDA ───────────────────────────────────────────────────────────────
    ebitda_prev      DOUBLE PRECISION,
    ebitda_ltm       DOUBLE PRECISION,
    ebitda_ltm_b     DOUBLE PRECISION,        -- columna 18 duplicada del Excel
    ebitda_ltm2      DOUBLE PRECISION,
    ebitda_chg       DOUBLE PRECISION,
    ebitda_2025e     DOUBLE PRECISION,
    ebitda_2026e     DOUBLE PRECISION,
    ebitda_2027e     DOUBLE PRECISION,

    -- ── Net income ───────────────────────────────────────────────────────────
    net_income_prev  DOUBLE PRECISION,
    net_income_ltm   DOUBLE PRECISION,
    net_income_chg   DOUBLE PRECISION,

    -- ── EV/EBITDA multiples ──────────────────────────────────────────────────
    fv_ebitda_2024   DOUBLE PRECISION,
    fv_ebitda_ltm    DOUBLE PRECISION,
    fv_ebitda_2025e  DOUBLE PRECISION,
    fv_ebitda_2026e  DOUBLE PRECISION,
    fv_ebitda_2027e  DOUBLE PRECISION,

    -- ── NI & P/E ─────────────────────────────────────────────────────────────
    ni_2024          DOUBLE PRECISION,
    ni_ltm           DOUBLE PRECISION,
    ni_2025e         DOUBLE PRECISION,
    ni_2026e         DOUBLE PRECISION,
    ni_2027e         DOUBLE PRECISION,
    pe_2024          DOUBLE PRECISION,
    pe_ltm           DOUBLE PRECISION,
    pe_2025e         DOUBLE PRECISION,
    pe_2026e         DOUBLE PRECISION,
    pe_2027e         DOUBLE PRECISION,
    peg_2026e        DOUBLE PRECISION,

    -- ── Other valuation ratios ────────────────────────────────────────────────
    p_ce_ltm         DOUBLE PRECISION,
    p_bv_ltm         DOUBLE PRECISION,
    roe_ltm          DOUBLE PRECISION,
    roe_2025e        DOUBLE PRECISION,
    roe_2026e        DOUBLE PRECISION,
    fv_s_ltm         DOUBLE PRECISION,
    fv_ic_ltm        DOUBLE PRECISION,
    leverage_ltm     DOUBLE PRECISION,
    roic_ltm         DOUBLE PRECISION,

    -- ── Dividend yields ───────────────────────────────────────────────────────
    div_yield_2026e  DOUBLE PRECISION,
    div_yield_2026e_b DOUBLE PRECISION,
    div_yield_ltm    DOUBLE PRECISION,
    div_yield_lagged DOUBLE PRECISION,
    div_yield_2022   DOUBLE PRECISION,

    CONSTRAINT ss_universe_pkey PRIMARY KEY (cierre_cartera, record_type, company)
);

-- Índices opcionales para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_ss_universe_date        ON ss_universe (cierre_cartera DESC);
CREATE INDEX IF NOT EXISTS idx_ss_universe_record_type ON ss_universe (record_type);
CREATE INDEX IF NOT EXISTS idx_ss_universe_sector      ON ss_universe (sector);
