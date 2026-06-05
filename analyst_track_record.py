"""
Backtesting aislado de "Total Return" para recomendaciones de analistas.

Script autocontenido (sin conexión a la base de datos real) para validar la
lógica de cálculo de Total Return / Retorno Anualizado de las recomendaciones
históricas de analistas (tabla AnalystRecommendationHistory).

Decisiones de diseño:
  - Precio ajustado: yf.download(..., auto_adjust=True) -> se usa la columna
    'Close' (ya ajustada por dividendos/splits). Se etiqueta como "(Adj)".
  - Días sin precio (fin de semana/feriado): se toma el SIGUIENTE día hábil
    (primer precio disponible en o después de la fecha -> forward).
  - Una sola llamada a yfinance por ejecución de la función.
  - Sin fallback offline: si yfinance no devuelve datos, se lanza un error.

Requiere: pandas, yfinance y conexión a internet.
"""

import pandas as pd
import yfinance as yf


# ---------------------------------------------------------------------------
# Paso 1 — Data simulada (Mock Data)
# ---------------------------------------------------------------------------

# Simula la tabla AnalystRecommendationHistory.
df_history = pd.DataFrame(
    [
        # Analista RM siguiendo CMPC (3 recomendaciones -> 3 tramos Entry/Exit)
        {"date": "2024-10-22", "type": "Initiation", "analyst": "RM",
         "company": "CMPC", "recommendation": "Comprar", "targetPrice": 1850},
        {"date": "2025-02-14", "type": "Update", "analyst": "RM",
         "company": "CMPC", "recommendation": "Mantener", "targetPrice": 1700},
        {"date": "2025-06-03", "type": "Update", "analyst": "RM",
         "company": "CMPC", "recommendation": "Comprar", "targetPrice": 1950},

        # Analista DL siguiendo BSANTANDER (2 recomendaciones)
        {"date": "2024-11-05", "type": "Initiation", "analyst": "DL",
         "company": "BSANTANDER", "recommendation": "Comprar", "targetPrice": 55},
        {"date": "2025-04-10", "type": "Update", "analyst": "DL",
         "company": "BSANTANDER", "recommendation": "Vender", "targetPrice": 48},

        # Analista RM siguiendo ENTEL (1 recomendación -> Exit = end_date)
        {"date": "2025-03-11", "type": "Initiation", "analyst": "RM",
         "company": "ENTEL", "recommendation": "Comprar", "targetPrice": 320},
    ]
)
df_history["date"] = pd.to_datetime(df_history["date"])

# Simula el cruce company -> Ticker de Yahoo Finance.
df_tickers = pd.DataFrame(
    [
        {"company": "CMPC", "ticker": "CMPC.SN"},
        {"company": "BSANTANDER", "ticker": "BSAN.SN"},
        {"company": "ENTEL", "ticker": "ENTEL.SN"},
    ]
)


# Columnas que devuelve siempre la función (útil para el caso "sin filas").
_OUTPUT_COLUMNS = [
    "date", "type", "analyst", "company", "recommendation", "targetPrice",
    "Ticker", "Currency",
    "Entry Date", "Entry Price (Adj)",
    "Exit Date", "Exit Price (Adj)",
    "Total Return %", "Annualized Return %",
]


# ---------------------------------------------------------------------------
# Paso 2 — Función principal
# ---------------------------------------------------------------------------

def calculate_analyst_track_record(start_date, end_date, analyst_id,
                                   company_name, currency):
    """Calcula el track record (Total Return) de un analista sobre una empresa.

    Para cada recomendación del analista sobre la empresa se define:
      - Entry: fecha y precio ajustado de la recomendación.
      - Exit: fecha y precio ajustado de la SIGUIENTE recomendación del mismo
        analista/empresa. Para la última recomendación, la Exit Date es el
        end_date ingresado.

    Parameters
    ----------
    start_date, end_date : str | datetime
        Rango de fechas (inclusive) sobre el cual filtrar las recomendaciones.
    analyst_id : str
        Identificador del analista (ej. "RM", "DL").
    company_name : str
        Nombre de la empresa en df_history (ej. "CMPC").
    currency : str
        Moneda objetivo. Por ahora es informativa (ver stub de conversión FX).

    Returns
    -------
    pandas.DataFrame
        Información original del reporte + columnas Ticker, Entry/Exit Date,
        Entry/Exit Price (Adj), Total Return % y Annualized Return %.
    """
    # 1. Normalización de fechas (tz-naive, a medianoche).
    start_ts = pd.to_datetime(start_date).normalize()
    end_ts = pd.to_datetime(end_date).normalize()

    # 2. Filtrado de recomendaciones.
    mask = (
        (df_history["analyst"] == analyst_id)
        & (df_history["company"] == company_name)
        & (df_history["date"] >= start_ts)
        & (df_history["date"] <= end_ts)
    )
    recs = (
        df_history.loc[mask]
        .sort_values("date")
        .reset_index(drop=True)
    )

    if recs.empty:
        print(f"[aviso] Sin recomendaciones para analyst='{analyst_id}', "
              f"company='{company_name}' en {start_ts.date()}..{end_ts.date()}.")
        return pd.DataFrame(columns=_OUTPUT_COLUMNS)

    # 3. Mapeo company -> Ticker de Yahoo Finance.
    ticker_match = df_tickers.loc[df_tickers["company"] == company_name, "ticker"]
    if ticker_match.empty:
        raise ValueError(
            f"No existe Ticker mapeado para la empresa '{company_name}' en df_tickers."
        )
    ticker = ticker_match.iloc[0]

    # 4. Descarga de precios: UNA sola llamada a yfinance.
    #    Rango: desde la primera recomendación hasta end_date + buffer.
    #    El buffer permite forward-fill del Exit Price si end_date es feriado.
    #    (yfinance trata 'end' como exclusivo, así que el buffer también lo cubre.)
    download_start = recs["date"].min().normalize()
    download_end = end_ts + pd.Timedelta(days=7)

    data = yf.download(
        ticker,
        start=download_start.strftime("%Y-%m-%d"),
        end=download_end.strftime("%Y-%m-%d"),
        auto_adjust=True,
        progress=False,
    )

    if data is None or data.empty:
        raise RuntimeError(
            f"yfinance no devolvió datos para el Ticker '{ticker}' en el rango "
            f"{download_start.date()}..{download_end.date()}. "
            f"Verifica el ticker y la conexión a internet."
        )

    # Robustez: aplanar columnas MultiIndex (yfinance las usa para multi-ticker).
    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.droplevel(-1)

    # 'Close' ya viene ajustado por auto_adjust=True.
    prices = data["Close"].copy()

    # Normalización del índice de precios a fechas tz-naive a medianoche.
    if isinstance(prices.index, pd.DatetimeIndex) and prices.index.tz is not None:
        prices.index = prices.index.tz_localize(None)
    prices.index = prices.index.normalize()
    prices = prices[~prices.index.duplicated(keep="first")].sort_index()

    # 5. Helper: lookup forward (primer precio en o después de la fecha objetivo).
    def lookup_forward(target_ts):
        pos = prices.index.searchsorted(target_ts, side="left")
        if pos >= len(prices.index):
            return float("nan"), pd.NaT
        return float(prices.iloc[pos]), prices.index[pos]

    # 6. Backtesting Entry/Exit + 7. Cálculos financieros.
    rows = []
    n = len(recs)
    for i in range(n):
        rec = recs.iloc[i]
        entry_date = rec["date"].normalize()

        # Exit = siguiente recomendación; última -> end_date.
        if i < n - 1:
            exit_date = recs.iloc[i + 1]["date"].normalize()
        else:
            exit_date = end_ts

        entry_price, _ = lookup_forward(entry_date)
        exit_price, _ = lookup_forward(exit_date)

        days = (exit_date - entry_date).days

        if (pd.notna(entry_price) and pd.notna(exit_price)
                and entry_price > 0):
            total_return = (exit_price / entry_price - 1) * 100
            if days > 0:
                annualized = ((exit_price / entry_price) ** (365 / days) - 1) * 100
            else:
                annualized = float("nan")
        else:
            total_return = float("nan")
            annualized = float("nan")

        rows.append({
            **rec.to_dict(),
            "Ticker": ticker,
            "Currency": currency,  # informativo; ver stub de FX más abajo.
            "Entry Date": entry_date,
            "Entry Price (Adj)": entry_price,
            "Exit Date": exit_date,
            "Exit Price (Adj)": exit_price,
            "Total Return %": total_return,
            "Annualized Return %": annualized,
        })

    result = pd.DataFrame(rows)

    # --- Stub de conversión de moneda (FX) -------------------------------
    # Los precios de tickers .SN están en CLP. Si en el futuro se requiere
    # entregar los precios/retornos en otra `currency`, aquí se descargaría
    # el par FX (p.ej. "USDCLP=X") y se convertirían Entry/Exit Price antes
    # de calcular los retornos. Por ahora `currency` es solo informativa.
    # ---------------------------------------------------------------------

    # Redondeo de columnas financieras a 2 decimales.
    money_cols = ["Entry Price (Adj)", "Exit Price (Adj)",
                  "Total Return %", "Annualized Return %"]
    result[money_cols] = result[money_cols].round(2)

    # Orden de columnas canónico.
    return result[_OUTPUT_COLUMNS]


# ---------------------------------------------------------------------------
# Paso 3 — Demo ejecutable
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", None)

    print("=== df_history (mock AnalystRecommendationHistory) ===")
    print(df_history.to_string(index=False))
    print("\n=== df_tickers (mock cruce company -> Yahoo Ticker) ===")
    print(df_tickers.to_string(index=False))

    print("\n=== Track record: analista 'RM' sobre 'CMPC' ===")
    track = calculate_analyst_track_record(
        start_date="2024-01-01",
        end_date="2025-06-05",
        analyst_id="RM",
        company_name="CMPC",
        currency="CLP",
    )
    print(track.to_string(index=False))
