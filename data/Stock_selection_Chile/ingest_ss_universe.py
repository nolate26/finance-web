"""
Ingesta de Stock Selection Chile → tabla ss_universe en PostgreSQL.

Archivos fuente:
  companies.csv  → record_type = 'company'
  indices.csv    → record_type = 'index'

Estructura de cada CSV:
  Row 0 → "cierre_cartera, <date>"   (metadata)
  Row 1 → "precios, <date>"
  Row 2 → "resultados, <quarter>"
  Row 3 → (blank)
  Row 4 → column header
  Row 5+ → data

Columna duplicada en el CSV original (exportado desde Excel):
  El CSV tiene dos columnas llamadas "ebitda_ltm" (índices 12 y 17 en el header).
  Pandas las renombra automáticamente a "ebitda_ltm" y "ebitda_ltm.1".
  Este script renombra la segunda (índice 17, 0-based) a "ebitda_ltm_b".
"""

import re
import os
import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text
from datetime import date

# ── Configuración ─────────────────────────────────────────────────────────────
# Leer DATABASE_URL desde variable de entorno o hardcodear para desarrollo local.
# Formato: "postgresql://user:password@host:5432/research_db"
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/research_db",
)

DATA_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Helpers ───────────────────────────────────────────────────────────────────

# Valores que representan "sin dato" en los CSVs exportados desde Excel
_NULL_STRINGS = {"", " ", "-", "NM", "ND", "NA", "N/A", "n/a", "nan", "#N/A", "ak"}


def clean_numeric_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Reemplaza strings vacíos, espacios, guiones y tokens sin-dato por np.nan
    en todas las columnas numéricas (Float64).
    Luego convierte a float nativo para que SQLAlchemy envíe NULL a Postgres.
    """
    for col in df.columns:
        if df[col].dtype == object:
            # Normalizar espacios y reemplazar tokens nulos
            df[col] = df[col].str.strip()
            df[col] = df[col].replace(_NULL_STRINGS, np.nan)

    # Columnas numéricas: convertir todo lo que no sea string de control
    numeric_cols = [
        c for c in df.columns
        if c not in {
            "cierre_cartera", "record_type", "company", "source_file",
            "precios", "resultados", "recommendation", "rec_date",
            "div_policy", "sector",
        }
    ]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def read_csv_with_metadata(filepath: str, record_type: str) -> pd.DataFrame:
    """
    Lee un CSV del universo Chile con su estructura de metadata en las primeras filas.
    Devuelve un DataFrame listo para ingestar.
    """
    source_file = os.path.basename(filepath)

    # ── Extraer metadata de las primeras 3 filas ──────────────────────────────
    # Row 0: cierre_cartera,<date>
    # Row 1: precios,<date>
    # Row 2: resultados,<quarter>
    #
    # ALTERNATIVA: si exportas directo desde Excel con openpyxl puedes leer
    # la celda A1 del workbook para obtener cierre_cartera sin depender del CSV:
    #   import openpyxl; wb = openpyxl.load_workbook("file.xlsx"); ws = wb.active
    #   cierre_cartera_raw = ws["B1"].value  # fecha como datetime nativo de Excel
    meta_rows = pd.read_csv(filepath, header=None, nrows=3)
    cierre_cartera_raw: str = str(meta_rows.iloc[0, 1]).strip()   # e.g. "2025-12-31"
    precios_val: str         = str(meta_rows.iloc[1, 1]).strip()   # e.g. "2026-01-13"
    resultados_val: str      = str(meta_rows.iloc[2, 1]).strip()   # e.g. "3Q 2025"

    # Parsear cierre_cartera a date
    cierre_cartera: date = pd.to_datetime(cierre_cartera_raw).date()

    # ── Leer datos (header en row 4, datos en row 5+) ─────────────────────────
    df = pd.read_csv(filepath, skiprows=4, header=0)

    # Eliminar filas completamente vacías
    df.dropna(how="all", inplace=True)

    # ── Renombrar columna duplicada ───────────────────────────────────────────
    # Pandas lee el CSV y renombra automáticamente la segunda "ebitda_ltm"
    # (posición 17, 0-based en el header de datos) como "ebitda_ltm.1".
    # La renombramos a "ebitda_ltm_b" para que coincida con el schema.
    rename_map: dict[str, str] = {
        # Columna duplicada
        "ebitda_ltm.1": "ebitda_ltm_b",
        # Capitalización inconsistente en el CSV original
        "FV":            "fv",
        "Fv_ebitda_2024": "fv_ebitda_2024",
        "Fv_ebitda_ltm":  "fv_ebitda_ltm",
        "Fv_ebitda_2025e": "fv_ebitda_2025e",
        "Fv_ebitda_2026e": "fv_ebitda_2026e",
        "Fv_ebitda_2027e": "fv_ebitda_2027e",
    }
    df.rename(columns=rename_map, inplace=True)

    # ── Añadir columnas de metadata ───────────────────────────────────────────
    df["cierre_cartera"] = cierre_cartera
    df["record_type"]    = record_type
    df["source_file"]    = source_file
    df["precios"]        = precios_val
    df["resultados"]     = resultados_val

    # ── Limpiar datos numéricos ───────────────────────────────────────────────
    df = clean_numeric_data(df)

    # ── Reordenar columnas al orden del schema ────────────────────────────────
    SCHEMA_COLS = [
        "cierre_cartera", "record_type", "company", "source_file",
        "precios", "resultados",
        "pio_vs_igpa_mc_sc", "mrv_vs_ipsa",
        "recommendation", "rec_date", "div_policy", "sector",
        "price", "target_price",
        "ret_1m", "ret_ytd", "ret_1y", "ret_5y",
        "mkt_cap_bn", "net_debt", "fv",
        "ebitda_prev", "ebitda_ltm", "ebitda_ltm_b", "ebitda_ltm2", "ebitda_chg",
        "ebitda_2025e", "ebitda_2026e", "ebitda_2027e",
        "net_income_prev", "net_income_ltm", "net_income_chg",
        "fv_ebitda_2024", "fv_ebitda_ltm", "fv_ebitda_2025e",
        "fv_ebitda_2026e", "fv_ebitda_2027e",
        "ni_2024", "ni_ltm", "ni_2025e", "ni_2026e", "ni_2027e",
        "pe_2024", "pe_ltm", "pe_2025e", "pe_2026e", "pe_2027e",
        "peg_2026e", "p_ce_ltm", "p_bv_ltm",
        "roe_ltm", "roe_2025e", "roe_2026e",
        "fv_s_ltm", "fv_ic_ltm", "leverage_ltm", "roic_ltm",
        "div_yield_2026e", "div_yield_2026e_b",
        "div_yield_ltm", "div_yield_lagged", "div_yield_2022",
    ]
    # Incluir solo las columnas que existen en el DataFrame
    final_cols = [c for c in SCHEMA_COLS if c in df.columns]
    return df[final_cols]


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    engine = create_engine(DATABASE_URL)

    # Leer y procesar ambos archivos
    df_companies = read_csv_with_metadata(
        os.path.join(DATA_DIR, "companies.csv"),
        record_type="company",
    )
    df_indices = read_csv_with_metadata(
        os.path.join(DATA_DIR, "indices.csv"),
        record_type="index",
    )

    df_all = pd.concat([df_companies, df_indices], ignore_index=True)

    print(f"Companies: {len(df_companies)} rows")
    print(f"Indices:   {len(df_indices)} rows")
    print(f"Total:     {len(df_all)} rows → uploading to ss_universe...")

    # Upsert: borrar las filas del mismo cierre_cartera antes de insertar
    # (evita duplicados si el script se corre más de una vez para la misma fecha)
    cierre = df_all["cierre_cartera"].iloc[0]
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM ss_universe WHERE cierre_cartera = :d"),
            {"d": cierre},
        )

    df_all.to_sql(
        name="ss_universe",
        con=engine,
        if_exists="append",
        index=False,
        method="multi",
        chunksize=200,
    )

    print("Done.")


if __name__ == "__main__":
    main()
