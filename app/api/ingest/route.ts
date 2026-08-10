import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

        const bankDate = new Date(bHeader.updateDate);
        const bankKey = { ticker: bHeader.ticker, updateDate: bankDate };

        const bankFinRows = normalizeRows(
          bFinancials.map((f: any) => ({ ...bankKey, ...f }))
        );

        // Unicidad por kpiOrder, no por kpiName: la planilla repite nombres como "Var %".
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
            (r) => `${r.year}|${r.sectionName}|${r.kpiOrder}`
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
              thesis:   bHeader.thesis,
              link:     bHeader.link
            },
            create: {
              ...bankKey,
              recc:       bHeader.recc,
              tp:         bHeader.tp,
              analyst:    bHeader.analyst,
              currency:   bHeader.currency,
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
          message: `Snapshot de banco ${bHeader.ticker} guardado: ${bankFinRows.length} años + ${bankKpiRows.length} KPIs.`
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

        const modelDate = new Date(header.updateDate);
        const modelKey = { ticker: header.ticker, updateDate: modelDate };

        const modelFinRows = normalizeRows(
          financials.map((f: any) => ({ ...modelKey, ...f }))
        );

        // Acá la unicidad es por kpiName (a diferencia de BankKPI, que usa kpiOrder).
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
            (r) => `${r.year}|${r.sectionName}|${r.kpiName}`
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
          message: `Snapshot de ${header.ticker} guardado: ${modelFinRows.length} años + ${modelKpiRows.length} KPIs.`
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