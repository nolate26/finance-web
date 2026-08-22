import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { requireAdmin } from "@/lib/auth";
import { codePatchFor, fixYahooTicker } from "@/lib/yahooTickerFixes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Probar un símbolo de Yahoo ANTES de guardarlo. Sin esto, un ticker deslistado se guarda
// sin chistar y la empresa aparece en Stock Selection sin precio ni retornos — que es
// exactamente el modo de falla que llenó lib/yahooTickerFixes.
//
// Se consultan las dos vías que usa la vista: quote (nombre/bolsa/precio actual) y chart
// (la serie de cierres con la que se calculan los retornos). Un símbolo que responde quote
// pero no chart daría precio sin retornos, así que se informan por separado.

export interface VerifyResult {
  ticker: string;          // lo que se pidió
  effective: string;       // lo que realmente se consulta (tras el parche en código)
  codePatch: string | null;
  ok: boolean;             // resuelve por alguna de las dos vías
  name: string | null;
  exchange: string | null;
  currency: string | null;
  price: number | null;
  lastClose: number | null;
  lastDate: string | null; // YYYY-MM-DD del último cierre
  points: number;          // nº de cierres en 1 año (0 = sin serie → sin retornos)
  hasChart: boolean;
  error: string | null;
}

interface YQuote { regularMarketPrice?: number; currency?: string; longName?: string; shortName?: string; fullExchangeName?: string; exchange?: string }
interface YChartQ { date: Date; close: number | null }
interface YChart { meta?: { currency?: string }; quotes: YChartQ[] }

export async function GET(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const raw = (request.nextUrl.searchParams.get("ticker") ?? "").trim();
  if (!raw) return NextResponse.json({ error: "Falta el ticker" }, { status: 400 });
  if (raw.length > 30 || !/^[A-Za-z0-9.^=-]+$/.test(raw)) {
    return NextResponse.json({ error: "Ticker con formato inválido" }, { status: 400 });
  }

  const effective = fixYahooTicker(raw) ?? raw;
  const res: VerifyResult = {
    ticker: raw, effective, codePatch: codePatchFor(raw), ok: false,
    name: null, exchange: null, currency: null, price: null,
    lastClose: null, lastDate: null, points: 0, hasChart: false, error: null,
  };

  const [quote, chart] = await Promise.all([
    yf.quote(effective).then((q) => q as YQuote | null).catch(() => null),
    yf
      .chart(effective, { period1: new Date(Date.now() - 370 * 86400000), period2: new Date(), interval: "1d" })
      .then((c) => c as YChart)
      .catch(() => null),
  ]);

  if (quote) {
    res.name = quote.longName ?? quote.shortName ?? null;
    res.exchange = quote.fullExchangeName ?? quote.exchange ?? null;
    res.currency = quote.currency ?? null;
    res.price = quote.regularMarketPrice != null && isFinite(quote.regularMarketPrice) ? quote.regularMarketPrice : null;
  }
  const closes = (chart?.quotes ?? []).filter((q) => q.close != null && isFinite(q.close as number) && q.date);
  res.points = closes.length;
  res.hasChart = closes.length > 0;
  if (closes.length) {
    const last = closes[closes.length - 1];
    res.lastClose = last.close as number;
    res.lastDate = new Date(last.date).toISOString().slice(0, 10);
    res.currency = res.currency ?? chart?.meta?.currency ?? null;
  }

  res.ok = res.price != null || res.hasChart;
  if (!res.ok) res.error = "Yahoo no devuelve datos para este símbolo (deslistado o inexistente).";
  else if (!res.hasChart) res.error = "Responde precio pero no trae serie histórica: la fila quedaría sin retornos.";

  return NextResponse.json(res);
}
