import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { table } from 'console';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { table, rows } = data;

    if (!table || !rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    // Usamos skipDuplicates para proteger la base de datos de cargas repetidas
    switch (table) {
      // --- TABLAS DE MARKET (Las que ya funcionan) ---
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

      // --- NUEVAS TABLAS DE FONDOS Y UNIVERSO ---
      case 'FundPortfolioWeights':
        await prisma.fundPortfolioWeights.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'ProyeccionesFinancieras':
        await prisma.proyeccionesFinancieras.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'MonedaFundReturns':
        await prisma.monedaFundReturns.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'SsUniverse':
        await prisma.ssUniverse.createMany({ data: rows, skipDuplicates: true });
        break;
      case 'PerformanceAttribution':
        await prisma.performanceAttribution.createMany({ data: rows, skipDuplicates: true });
        break;

      default:
        return NextResponse.json({ error: `Tabla ${table} no reconocida` }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `Inyectados ${rows.length} registros en ${table}` });
  } catch (error) {
    // Mejoramos el log para ver el error real si algo falla en Prisma
    console.error(`Error en API [${table}]:`, error);
    return NextResponse.json({ error: 'Error interno del servidor', details: String(error) }, { status: 500 });
  }
}