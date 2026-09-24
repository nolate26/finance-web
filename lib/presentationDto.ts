import type { Recommendation } from "@/lib/recommendations";

/**
 * Forma de una presentación tal como viaja a la UI. Vive acá y no en la route
 * porque la comparten GET, POST y PATCH, y los route files de Next sólo pueden
 * exportar handlers.
 */

export interface PresentationTickerDTO {
  ticker:         string;
  company_name:   string;               // nombre_latam de la maestra
  country:        string | null;        // country_risk
  target_price:   number | null;
  recommendation: Recommendation | null;
}

export interface Presentation {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  category: string;
  region: string;
  /** Texto libre heredado (un ticker suelto). Para investment cases manda `tickers`. */
  company_name: string | null;
  is_sell_side: boolean;
  created_at: string;
  /** Fecha del caso (la del informe). ISO corto "YYYY-MM-DD" o null. */
  case_date: string | null;
  uploaded_by: string | null;
  review_status: "pending" | "approved";
  reviewed_by: string | null;
  reviewed_at: string | null;
  tickers: PresentationTickerDTO[];
}

/** Lo que Prisma devuelve con `include: PRESENTATION_INCLUDE`. */
interface PresentationRow {
  id: string; title: string; description: string | null; file_url: string;
  category: string; region: string; company_name: string | null; is_sell_side: boolean;
  created_at: Date; caseDate: Date | null; uploadedBy: string | null;
  reviewStatus: string; reviewedBy: string | null; reviewedAt: Date | null;
  tickers: {
    ticker: string; targetPrice: number | null; recommendation: string | null;
    empresa: { nombreLatam: string; countryRisk: string };
  }[];
}

export const PRESENTATION_INCLUDE = {
  tickers: {
    include: { empresa: { select: { nombreLatam: true, countryRisk: true } } },
    orderBy: { ticker: "asc" },
  },
} as const;

export function toPresentationDTO(p: PresentationRow): Presentation {
  return {
    id:            p.id,
    title:         p.title,
    description:   p.description,
    file_url:      p.file_url,
    category:      p.category,
    region:        p.region,
    company_name:  p.company_name,
    is_sell_side:  p.is_sell_side,
    created_at:    p.created_at.toISOString(),
    case_date:     p.caseDate ? p.caseDate.toISOString().slice(0, 10) : null,
    uploaded_by:   p.uploadedBy,
    review_status: p.reviewStatus === "pending" ? "pending" : "approved",
    reviewed_by:   p.reviewedBy,
    reviewed_at:   p.reviewedAt ? p.reviewedAt.toISOString() : null,
    tickers: p.tickers.map((t) => ({
      ticker:         t.ticker,
      company_name:   t.empresa.nombreLatam,
      country:        t.empresa.countryRisk || null,
      target_price:   t.targetPrice,
      recommendation: (t.recommendation as Recommendation | null) ?? null,
    })),
  };
}

/** Sólo los investment cases pasan por revisión del admin. */
export const REVIEWABLE_CATEGORY = "investment_cases";
