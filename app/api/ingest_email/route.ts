import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
 
export async function POST(request: Request) {
  try {
    const data = await request.json();
 
    const {
      schemaVersion,
      company,
      date,
      category,
      title,
      recommendation,
      target_price,
      subject,
      html,
      source
    } = data;
 
    // Validación
    if (!company || !html) {
      return NextResponse.json(
        { error: 'Faltan campos críticos (company o html)' },
        { status: 400 }
      );
    }
 
    // asegurar array
    const companies = Array.isArray(company) ? company : [company];
 
    // convertir target_price a número
    const parsedTargetPrice =
      target_price !== undefined &&
      target_price !== null &&
      target_price !== ''
        ? Number(target_price)
        : null;
 
    const reports = await Promise.all(
      companies.map((ticker: string) =>
        prisma.emailResearch.create({
          data: {
            schemaVersion: schemaVersion || "1.0",
            company: ticker,
            date: date ? new Date(date) : new Date(),
            category: category || 'Uncategorized',
            title: title || null,
            recommendation: recommendation || null,
            targetPrice: parsedTargetPrice, // ✅ ESTE ES EL CAMBIO IMPORTANTE
            subject: subject || null,
            html: html,
            from: source?.from || null,
            receivedAt: source?.receivedAt
              ? new Date(source.receivedAt)
              : null,
            messageId: source?.messageId || null,
          }
        })
      )
    );
 
    return NextResponse.json({
      success: true,
      message: `${reports.length} registros creados`,
      ids: reports.map(r => r.id)
    });
 
  } catch (error) {
    console.error('Error procesando email:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}
 