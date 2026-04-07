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

    // Usamos skipDuplicates como red de seguridad (por si corres el script 2 veces el mismo día)
    switch (table) {
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
      default:
        return NextResponse.json({ error: `Tabla ${table} no reconocida` }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `Inyectados ${rows.length} registros en ${table}` });
  } catch (error) {
    console.error(`Error en API [${table}]:`, error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}