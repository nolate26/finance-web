// empresas_industrias_v2.country_risk → nombre visible. Códigos de 2 letras tal como
// están en la maestra (validados en /api/companies/unmapped). Un código que no esté
// acá se muestra tal cual.
export const COUNTRY_NAMES: Record<string, string> = {
  AR: "Argentina", BR: "Brazil", CL: "Chile", CN: "China", CO: "Colombia",
  MX: "Mexico", PA: "Panama", PE: "Peru", US: "United States", UY: "Uruguay", OT: "Other",
};

export const countryName = (c: string) => COUNTRY_NAMES[c] ?? c;
