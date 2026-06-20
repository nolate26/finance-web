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
 
    // Asegurar array
    const companies = Array.isArray(company) ? company : [company];
 
    // Convertir target_price a número
    const parsedTargetPrice =
      target_price !== undefined &&
      target_price !== null &&
      target_price !== ''
        ? Number(target_price)
        : null;

    // ✅ NUEVO: Lógica robusta para parsear la fecha
    let finalDate = new Date(); // Por defecto usa la fecha actual
    if (date) {
      // Si la fecha es un texto y tiene formato DD-MM-YYYY (ej: 19-06-2026)
      if (typeof date === 'string' && date.includes('-')) {
        const parts = date.split('-');
        // Comprobamos si el primer elemento es el día (ej: '19')
        if (parts.length === 3 && parts[0].length <= 2) {
          const validDateString = `${parts[2]}-${parts[1]}-${parts[0]}`; // Lo pasamos a YYYY-MM-DD
          finalDate = new Date(validDateString);
        } else {
          finalDate = new Date(date);
        }
      } else {
        finalDate = new Date(date);
      }
      
      // Si por alguna razón la fecha sigue siendo inválida, usamos la actual como respaldo
      if (isNaN(finalDate.getTime())) {
        finalDate = new Date();
      }
    }
 
    const reports = await Promise.all(
      companies.map((ticker: string) =>
        prisma.emailResearch.create({
          data: {
            schemaVersion: schemaVersion || "1.0",
            company: ticker,
            date: finalDate, // ✅ AQUÍ USAMOS LA FECHA YA PARSEADA Y SEGURA
            category: category || 'Uncategorized',
            title: title || null,
            recommendation: recommendation || null,
            targetPrice: parsedTargetPrice,
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