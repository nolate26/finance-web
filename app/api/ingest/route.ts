import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeTicker } from '@/lib/issuer';
import { normBBG } from '@/lib/bbg';
// ❌ ELIMINADO: import { table } from 'console'; (Esto rompe la API en producción)

// createMany necesita que todas las filas tengan el mismo set de claves:
// rellenamos con null las que falten en alguna fila del payload.
// Además así sale un solo INSERT multi-fila, y Postgres asigna los id en el
// orden del array → los lectores que hacen orderBy:{id:"asc"} sobre los KPIs
// (app/api/companies/[ticker]/model|bank-model) conservan el orden de la planilla.
function normalizeRows(rows: Record<string, any>[]): any[] {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  return rows.map((r) => {
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = r[k] ?? null;
    return out;
  });
}

// Replica el "último gana" del loop de upsert ante claves repetidas:
// createMany explotaría contra el índice único.
function dedupeBy<T>(rows: T[], key: (r: T) => string): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(key(r), r);
  return [...map.values()];
}

export async function POST(request: Request) {
  // Declaramos la variable afuera para que sobreviva si ocurre un error
  let tableName = 'Desconocida';

  try {
    const data = await request.json();
    const { table, rows } = data;

    // 1. Validamos que al menos venga el nombre de la tabla
    if (!table) {
      return NextResponse.json({ error: 'Payload inválido: Falta la tabla' }, { status: 400 });
    }

    // 2. Hacemos la excepción para nuestro modelo de Excel
  if (table !== 'AnalystModel' && table !== 'BankModel' && (!rows || !Array.isArray(rows))) {
      return NextResponse.json({ error: 'Payload inválido: Faltan las rows' }, { status: 400 });
    }

    // Guardamos el nombre real para el log
    tableName = table;

    // Usamos skipDuplicates para proteger la base de datos de cargas repetidas
    switch (table) {
      // --- TABLAS DE MARKET ---
      case 'PeHistorico':
        await prisma.peHistorico.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'CommodityHistorico':
        await prisma.commodityHistorico.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'MacroHistorico':
        await prisma.macroHistorico.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'MacroForecasts':
        await prisma.macroForecasts.createMany({ data: rows });
        break;
      case 'CommodityForecasts':
        await prisma.commodityForecasts.createMany({ data: rows });
        break;
      case 'PeSummarySnapshot':
        await prisma.peSummarySnapshot.createMany({ data: rows });
        break;
      case 'EquityCompsSnapshot':
        await prisma.equityCompsSnapshot.createMany({ data: rows });
        break;

      // --- TABLAS DE FONDOS Y UNIVERSO ---
      case 'FundPortfolioWeights':
        await prisma.fundPortfolioWeight.createMany({ data: rows, skipDuplicates: true }); 
        break;
      case 'ProyeccionesFinancieras':
        await prisma.proyecciones_financieras.createMany({ data: rows, skipDuplicates: true }); 
        break;
      case 'MonedaFundReturns':
        await prisma.monedaFundReturn.createMany({ data: rows, skipDuplicates: true }); 
        break;
  
      case 'PerformanceAttribution':
        await prisma.performanceAttribution.createMany({ data: rows, skipDuplicates: true });
        break;

      case 'EmpresasIndustriasV2':         
        await prisma.empresasIndustriasV2.createMany({data: rows, skipDuplicates: true, });// Protege contra tickers duplicados                 
        break;
 



      case 'AnalystRecommendationHistory':
        await prisma.analystRecommendationHistory.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'CompanyIsin':
        await prisma.companyIsin.createMany({ data: rows, skipDuplicates: true });
        break;


      // --- ACTUALIZACIONES DE TABLAS EXISTENTES ---
      case 'EmpresasIndustrias_Description':
        // Como es una actualización, usamos un bucle con updateMany
        // updateMany es seguro: si el ticker no existe, no hace nada y no rompe el servidor.
        for (const row of rows) {
          if (row.ticker_bloomberg && row.company_description) {
            // v2 guarda los tickers en MAYÚSCULAS → matcheamos con UPPER en ambos lados.
            // Solo rellenamos descripciones vacías en el destino (IS NULL OR = '').
            await prisma.empresasIndustriasV2.updateMany({
              where: {
                tickerBloomberg: row.ticker_bloomberg.toUpperCase(),
                OR: [{ companyDescription: null }, { companyDescription: "" }],
              },
              data: { companyDescription: row.company_description },
            });
          }
        }
        break;

      // El payload es SIEMPRE el snapshot completo de un (ticker, updateDate),
      // así que reemplazamos financials y KPIs enteros: 5 queries en vez de N.
      case 'BankModel': {
        const { header: bHeader, financials: bFinancials, kpis: bKpis } = data;

        if (!bHeader || !bFinancials) {
          return NextResponse.json(
            { error: 'Payload inválido: Faltan datos del modelo de banco' },
            { status: 400 }
          );
        }

        // El ticker se canoniza acá (trim + espacios colapsados + MAYÚSCULA). Es la misma
        // forma que usa empresas_industrias_v2, y es lo que permite que el deep-dive lo
        // encuentre: si entra "BCI CI Equity" queda huérfano de la maestra y el modelo se
        // vuelve inalcanzable desde la UI aunque los datos estén bien cargados.
        const bankTicker = normalizeTicker(bHeader.ticker);
        if (!bankTicker) {
          return NextResponse.json(
            { error: 'Payload inválido: el header del modelo de banco no trae ticker' },
            { status: 400 }
          );
        }

        const bankDate = new Date(bHeader.updateDate);
        const bankKey = { ticker: bankTicker, updateDate: bankDate };

        const bankFinRows = normalizeRows(
          bFinancials.map((f: any) => ({ ...bankKey, ...f }))
        );

        // Unicidad por (kpiName + kpiOrder): la planilla repite nombres como "Var %"
        // dentro de una sección, y a veces reinicia el contador de orden en sub-bloques.
        const bankKpiRows = normalizeRows(
          dedupeBy(
            (Array.isArray(bKpis) ? bKpis : []).map((k: any) => ({
              ...bankKey,
              year:        k.year,
              sectionName: k.sectionName,
              kpiName:     k.kpiName,
              kpiOrder:    k.kpiOrder,
              value:       k.value,
            })),
            (r) => `${r.year}|${r.sectionName}|${r.kpiName}|${r.kpiOrder}`
          )
        );

        await prisma.$transaction(async (tx) => {
          // 1. Header — dentro del tx: financials y KPIs tienen FK contra él.
          await tx.bankHeader.upsert({
            where: { ticker_updateDate: bankKey },
            update: {
              recc:     bHeader.recc,
              tp:       bHeader.tp,
              analyst:  bHeader.analyst,
              currency: bHeader.currency,
              unit:     bHeader.unit,
              thesis:   bHeader.thesis,
              link:     bHeader.link
            },
            create: {
              ...bankKey,
              recc:       bHeader.recc,
              tp:         bHeader.tp,
              analyst:    bHeader.analyst,
              currency:   bHeader.currency,
              unit:       bHeader.unit,
              thesis:     bHeader.thesis,
              link:       bHeader.link
            }
          });

          // 2. Financials
          await tx.bankFinancials.deleteMany({ where: bankKey });
          if (bankFinRows.length > 0) {
            await tx.bankFinancials.createMany({ data: bankFinRows });
          }

          // 3. KPIs
          await tx.bankKPI.deleteMany({ where: bankKey });
          if (bankKpiRows.length > 0) {
            await tx.bankKPI.createMany({ data: bankKpiRows });
          }
        }, { timeout: 20_000 });

        return NextResponse.json({
          success: true,
          message: `Snapshot de banco ${bankTicker} guardado: ${bankFinRows.length} años + ${bankKpiRows.length} KPIs.`
        });
      }


      // --- TABLA TOTAL RETURN INDEX (UPSERT) ---
      case 'TotalReturnIndex':
        // Mapeamos las filas para crear una lista de operaciones UPSERT
        const triUpserts = rows.map((row: any) => {
          // Extraemos los valores soportando tanto camelCase como snake_case 
          // dependiendo de cómo los envíe tu script de Python
          const triToday = row.triToday ?? row.tri_today ?? null;
          const tri1m = row.tri1m ?? row.tri_1m ?? null;
          const tri3m = row.tri3m ?? row.tri_3m ?? null;
          const tri6m = row.tri6m ?? row.tri_6m ?? null;
          const tri1y = row.tri1y ?? row.tri_1y ?? null;
          const tri2y = row.tri2y ?? row.tri_2y ?? null;

          return prisma.totalReturnIndex.upsert({
            // El 'where' busca la llave única compuesta que definiste (@@unique)
            where: {
              ticker_date: {
                ticker: row.ticker,
                date: new Date(row.date),
              },
            },
            // Si lo encuentra, ACTUALIZA estos campos
            update: {
              triToday,
              tri1m,
              tri3m,
              tri6m,
              tri1y,
              tri2y,
            },
            // Si no lo encuentra, CREA una fila nueva
            create: {
              ticker: row.ticker,
              date: new Date(row.date),
              triToday,
              tri1m,
              tri3m,
              tri6m,
              tri1y,
              tri2y,
            },
          });
        });

        // Ejecutamos todas las operaciones de golpe en la base de datos
        await prisma.$transaction(triUpserts);
        break;





      // --- NUEVAS TABLAS: COMPANY DEEP DIVE ---
      case 'ValuationHistory':
        await prisma.valuationHistory.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'ConsensusEstimate':
        await prisma.consensusEstimate.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'PriceVsEarnings':
        await prisma.priceVsEarnings.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'ShortInterest':
        await prisma.shortInterest.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'PriceRange52w':
        await prisma.priceRange52w.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'AnalystRecommendation':
        await prisma.analystRecommendation.createMany({ data: rows, skipDuplicates: true });
        break;

      // 👇 AGREGA ESTO AQUÍ 👇
      case 'EarningsSurprise':
        // Mapeamos explícitamente la fecha para evitar errores de parseo de ISO strings
        const earningsRows = rows.map((r: any) => ({
          ...r,
          reportDate: new Date(r.reportDate)
        }));
        await prisma.earningsSurprise.createMany({ 
          data: earningsRows, 
          skipDuplicates: true 
        });
        break;
        // 👇 NUEVO CASO PARA TIPOS DE CAMBIO 👇
      case 'QuarterlyFxRate':
        const fxRows = rows.map((r: any) => ({
          country: r.country,
          quarter: r.quarter,
          currency: r.currency,
          avgRate: r.avgRate ?? r.avg_rate ?? null,
        }));
        await prisma.quarterlyFxRate.createMany({
          data: fxRows,
          skipDuplicates: true // Esto garantiza que se llene una sola vez por quarter/país
        });
        break;
      // 👆 HASTA AQUÍ 👆
      // Mismo criterio que BankModel: snapshot completo → reemplazo total.
      case 'AnalystModel': {
        const { header, financials, kpis } = data;

        if (!header || !financials) {
          return NextResponse.json(
            { error: 'Payload inválido: Faltan datos del modelo' },
            { status: 400 }
          );
        }

        // Mismo criterio que BankModel: ticker canónico en MAYÚSCULA.
        const modelTicker = normalizeTicker(header.ticker);
        if (!modelTicker) {
          return NextResponse.json(
            { error: 'Payload inválido: el header del modelo no trae ticker' },
            { status: 400 }
          );
        }

        const modelDate = new Date(header.updateDate);
        const modelKey = { ticker: modelTicker, updateDate: modelDate };

        const modelFinRows = normalizeRows(
          financials.map((f: any) => ({ ...modelKey, ...f }))
        );

        // Unicidad por (kpiName + kpiOrder), igual que BankKPI. Antes deduplicaba solo
        // por kpiName y descartaba en silencio las filas que repiten nombre dentro de
        // una sección (el típico "Var %"): así se perdieron 649 KPIs en 12 modelos.
        const modelKpiRows = normalizeRows(
          dedupeBy(
            (Array.isArray(kpis) ? kpis : []).map((k: any) => ({
              ...modelKey,
              year:        k.year,
              sectionName: k.sectionName,
              kpiName:     k.kpiName,
              kpiOrder:    k.kpiOrder,
              value:       k.value,
            })),
            (r) => `${r.year}|${r.sectionName}|${r.kpiName}|${r.kpiOrder}`
          )
        );

        await prisma.$transaction(async (tx) => {
          // 1. Header — dentro del tx: financials y KPIs tienen FK contra él.
          await tx.modelHeader.upsert({
            where: { ticker_updateDate: modelKey },
            update: {
              recc:     header.recc,
              tp:       header.tp,
              analyst:  header.analyst,
              currency: header.currency,
              unit:     header.unit,
              thesis:   header.thesis,
              link:     header.link
            },
            create: {
              ...modelKey,
              recc:       header.recc,
              tp:         header.tp,
              analyst:    header.analyst,
              currency:   header.currency,
              unit:       header.unit,
              thesis:     header.thesis,
              link:       header.link
            }
          });

          // 2. Financials
          await tx.modelFinancials.deleteMany({ where: modelKey });
          if (modelFinRows.length > 0) {
            await tx.modelFinancials.createMany({ data: modelFinRows });
          }

          // 3. KPIs
          await tx.modelKPI.deleteMany({ where: modelKey });
          if (modelKpiRows.length > 0) {
            await tx.modelKPI.createMany({ data: modelKpiRows });
          }
        }, { timeout: 20_000 });

        return NextResponse.json({
          success: true,
          message: `Snapshot de ${modelTicker} guardado: ${modelFinRows.length} años + ${modelKpiRows.length} KPIs.`
        });
      }
      // 👆 HASTA AQUÍ 👆
      case 'LastRun':
        await prisma.lastRun.createMany({ data: rows, skipDuplicates: true });
        break;

      // --- VISTA: SS LATAM ---
      case 'LatamEquitySnapshot':
        await prisma.latamEquitySnapshot.createMany({ data: rows });
        break;

      // --- NUEVAS TABLAS: SIGNALS Y BENCHMARK ---
      case 'MomentumSignal':
        const momentumRows = rows.map((r: any) => ({
          // Mantenemos la fecha para no perder la historia
          signalDate: new Date(r.signalDate ?? r.signal_date ?? r.date),
          ticker:     r.ticker ?? r.Ticker,
 
          // Señal cruda (skip-return en %) y puntaje relativo 0-100
          signal:     r.signal ?? r.Signal ?? null,
          score:      r.score ?? r.Score ?? null,
 
          // zscore: el campo físico es z_score, pero @map lo resuelve Prisma
          zscore:     r.zscore ?? r.z_score ?? r.zScore ?? null,
 
          // rank ordinal (1 = mejor momentum)
          rank:       r.rank ?? r.Rank ?? null,
        }));
 
        await prisma.momentumSignal.createMany({
          data: momentumRows,
          skipDuplicates: true // Evita duplicados si corres el script 2 veces el mismo día
        });
        break;
      // --- NUEVAS TABLAS: SIGNALS Y BENCHMARK ---
      case 'SignalRaw':
        const signalRows = rows.map((r: any) => ({
          // Mantenemos la fecha para no perder la historia
          signalDate: new Date(r.signalDate ?? r.signal_date ?? r.date),
          ticker:     r.ticker ?? r.Ticker,
          
          score:      r.score ?? r.Score ?? null,
          value:      r.value ?? r.Value ?? null,
          quality:    r.quality ?? r.Quality ?? null,
          
          pe:         r.pe ?? r.PE ?? null,
          dy:         r.dy ?? r.DY ?? null,
          roe:        r.roe ?? r.ROE ?? null,
          
          // Captura ΔROE ya sea que Python lo envíe como delta_roe, dRoe o literal ΔROE
          deltaRoe:   r.deltaRoe ?? r.delta_roe ?? r.dRoe ?? r['ΔROE'] ?? null,
          price:      r.price ?? r.Price ?? null,
          
          // Convertimos a booleano de forma segura
          top20:      r.top20 !== undefined ? Boolean(r.top20) : (r.Top20 !== undefined ? Boolean(r.Top20) : null),
        }));

        await prisma.signalRaw.createMany({ 
          data: signalRows, 
          skipDuplicates: true // Evita duplicados si corres el script 2 veces el mismo día
        });
        break;


      case 'BetaSensitivity':
        await prisma.betaSensitivity.createMany({ 
          data: rows, 
          skipDuplicates: true 
        });
        break;
        
      case 'BenchmarkMxla':
        const benchRows = rows.map((r: any) => ({
          date: new Date(r.date),
          pxClose: r.pxClose ?? r.px_close ?? null,
        }));
        await prisma.benchmarkMxla.createMany({ 
          data: benchRows, 
          skipDuplicates: true 
        });
        break;

      case 'StockSelectionV1':
        const ssRows = rows.map((r: any) => ({
          company:     r.company,
          currency:    r.currency,
          metric:      r.metric,
          series:      r.series ?? 'TOTAL',
          fiscalYear:  r.fiscalYear ?? r.fiscal_year,
          quarter:     r.quarter,
          periodLabel: r.periodLabel ?? r.period_label,
          value:       r.value ?? null,
        }));
 
        await prisma.stockSelectionV1.createMany({
          data: ssRows,
          skipDuplicates: true
        });
        break;

      // --- RETORNOS DE STOCK SELECTION (SNAPSHOT: REEMPLAZO TOTAL) ---
      // ⚠️ ÚNICO caso que BORRA antes de insertar. El resto de las tablas acumulan
      // historia; ésta guarda un solo estado vigente, así que cada corrida pisa la
      // anterior. Si algún día se quiere serie, hay que cambiar la @id del modelo a
      // [tickerBBG, asOf] y sacar el deleteMany de acá.
      //
      // Payload:
      //   { table: "TickerReturnSnapshot", units: "pct" | "dec", source: "bloomberg",
      //     rows: [{ ticker, company, as_of, currency, price,
      //              ret_month, ret_ytd, ret_year, ret_3y, ret_5y }, ...] }
      //   units: "dec" (default) → 0.0512 = +5,12% · "pct" → 5.12 = +5,12%.
      //   ret_3y / ret_5y se guardan ANUALIZADOS (CAGR), que es como los muestra la vista.
      case 'TickerReturnSnapshot': {
        const units = String(data.units ?? 'dec').toLowerCase();
        if (units !== 'dec' && units !== 'pct') {
          return NextResponse.json({ error: `units debe ser "dec" o "pct" (recibí "${units}")` }, { status: 400 });
        }
        const scale = units === 'pct' ? 0.01 : 1;

        const numOf = (v: any): number | null => {
          if (v === null || v === undefined || v === '') return null;
          const n = typeof v === 'number' ? v : Number(String(v).replace('%', '').trim());
          return Number.isFinite(n) ? n : null;
        };
        const retOf = (v: any): number | null => { const n = numOf(v); return n === null ? null : n * scale; };

        // El ticker se normaliza acá (no en Python): "CAP CI Equity" → "CAP CI", que es
        // la forma con la que la vista hace el cruce. Así da igual cómo lo mande el script.
        const snapRows = dedupeBy(
          (rows as any[])
            .map((r: any) => {
              const rawDate = r.asOf ?? r.as_of ?? r.date ?? r.fecha;
              const asOf = rawDate ? new Date(rawDate) : null;
              const ccy = r.currency ?? r.moneda ?? null;
              return {
                tickerBBG: normBBG(r.tickerBBG ?? r.ticker_bbg ?? r.ticker ?? r.Ticker),
                company:   r.company ?? r.empresa ?? null,
                asOf,
                currency:  typeof ccy === 'string' ? ccy.trim().toUpperCase() || null : null,
                price:     numOf(r.price ?? r.px_last ?? r.pxLast ?? r.PX_LAST),
                retMonth:  retOf(r.retMonth ?? r.ret_month ?? r.mes),
                retYtd:    retOf(r.retYtd   ?? r.ret_ytd   ?? r.ytd),
                retYear:   retOf(r.retYear  ?? r.ret_year  ?? r.year),
                ret3y:     retOf(r.ret3y    ?? r.ret_3y    ?? r.l3y),
                ret5y:     retOf(r.ret5y    ?? r.ret_5y    ?? r.l5y),
                source:    r.source ?? data.source ?? 'bloomberg',
              };
            })
            // Sin ticker o sin fecha la fila no sirve: no se puede cruzar ni fechar.
            .filter((r) => r.tickerBBG && r.asOf && !isNaN((r.asOf as Date).getTime())),
          (r) => r.tickerBBG as string,
        );

        // Guarda: nunca borrar el snapshot vigente por un payload vacío o ilegible.
        if (snapRows.length === 0) {
          return NextResponse.json(
            { error: 'Ninguna fila válida (falta ticker o fecha). NO se borró el snapshot anterior.' },
            { status: 400 },
          );
        }

        const [{ count: deleted }] = await prisma.$transaction([
          prisma.tickerReturnSnapshot.deleteMany({}),
          prisma.tickerReturnSnapshot.createMany({ data: snapRows as any }),
        ]);

        // Chequeo de unidades: un retorno de ±150% en este universo delata que el payload
        // venía en porcentaje declarado como decimal (o al revés). Se avisa, no se bloquea.
        const allRets = snapRows.flatMap((r) => [r.retMonth, r.retYtd, r.retYear, r.ret3y, r.ret5y])
          .filter((v): v is number => v !== null);
        const maxAbs = allRets.length ? Math.max(...allRets.map(Math.abs)) : 0;
        const warning = maxAbs > 1.5
          ? `Hay retornos de hasta ${(maxAbs * 100).toFixed(0)}%. ¿El payload venía en porcentaje? Reenviá con units:"pct".`
          : null;

        // Cruce: un ticker que no homologa contra empresas_industrias_v2 queda invisible
        // en Stock Selection. Se devuelve la lista para que el script lo muestre.
        const empresas = await prisma.empresasIndustriasV2.findMany({ select: { tickerBloomberg: true } });
        const known = new Set(empresas.map((e) => normBBG(e.tickerBloomberg)).filter(Boolean));
        const orphans = snapRows.map((r) => r.tickerBBG as string).filter((t) => !known.has(t));

        return NextResponse.json({
          success: true,
          message: `Snapshot de retornos reemplazado: ${deleted} filas borradas, ${snapRows.length} escritas (units=${units}).`,
          replaced: deleted,
          written: snapRows.length,
          warning,
          orphans, // tickers sin homologación → no se ven en la vista
        });
      }

      default:
        return NextResponse.json({ error: `Tabla ${table} no reconocida` }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `Inyectados ${rows.length} registros en ${table}` });
  } catch (error) {
    // Ahora usamos tableName, que está definida de forma segura
    console.error(`Error en API [${tableName}]:`, error);
    return NextResponse.json({ error: 'Error interno del servidor', details: String(error) }, { status: 500 });
  }
}