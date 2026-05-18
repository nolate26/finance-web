import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Recibimos tu estructura JSON exacta (sin el array de 'images')
    const { schemaVersion, company, date, category, title, subject, html, source } = data;

    // Validación básica de seguridad
    if (!company || !html) {
      return NextResponse.json({ error: 'Faltan campos críticos (company o html)' }, { status: 400 });
    }

    // Inyección directa a la Base de Datos
    const newReport = await prisma.emailResearch.create({
      data: {
        schemaVersion: schemaVersion || "1.0",
        company:       company,
        date:          new Date(date),
        category:      category || 'Uncategorized',
        title:         title || null,
        subject:       subject || null,
        html:          html, // Se guarda el texto tal cual llegó
        from:          source?.from || null,
        receivedAt:    source?.receivedAt ? new Date(source.receivedAt) : null,
        messageId:     source?.messageId || null,
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Email guardado en la base de datos',
      id: newReport.id 
    });

  } catch (error) {
    console.error('Error procesando email:', error);
    return NextResponse.json({ error: 'Error interno del servidor', details: String(error) }, { status: 500 });
  }
}