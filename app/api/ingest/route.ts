import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// ❌ ELIMINADO: import { table } from 'console'; (Esto rompe la API en producción)

export async function POST(request: Request) {
  // Declaramos la variable afuera para que sobreviva si ocurre un error
  let tableName = 'Desconocida';

  try {
    const data = await request.json();
    const { table, rows } = data;

    if (!table || !rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
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
      case 'SsUniverse':
        await prisma.ssUniverse.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'PerformanceAttribution':
        await prisma.performanceAttribution.createMany({ data: rows, skipDuplicates: true });
        break;


      // --- ACTUALIZACIONES DE TABLAS EXISTENTES ---
      case 'EmpresasIndustrias_Description':
        // Como es una actualización, usamos un bucle con updateMany
        // updateMany es seguro: si el ticker no existe, no hace nada y no rompe el servidor.
        for (const row of rows) {
          if (row.ticker_bloomberg && row.company_description) {
            await prisma.empresasIndustrias.updateMany({
              where: { tickerBloomberg: row.ticker_bloomberg },
              data: { companyDescription: row.company_description },
            });
          }
        }
        break;


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
      case 'LastRun':
        await prisma.lastRun.createMany({ data: rows, skipDuplicates: true });
        break;

      // --- VISTA: SS LATAM ---
      case 'LatamEquitySnapshot':
        await prisma.latamEquitySnapshot.createMany({ data: rows });
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