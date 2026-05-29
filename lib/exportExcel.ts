type CellValue = string | number | null | undefined;

export interface SheetDef {
  name:    string;
  headers: string[];
  rows:    CellValue[][];
}

const HEADER_STYLE = {
  font:      { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
  fill:      { patternType: "solid", fgColor: { rgb: "1E3A8A" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: false },
  border: {
    bottom: { style: "thin", color: { rgb: "93C5FD" } },
    right:  { style: "thin", color: { rgb: "93C5FD" } },
  },
};

const SECTION_STYLE = {
  font:  { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
  fill:  { patternType: "solid", fgColor: { rgb: "334155" } },
  alignment: { horizontal: "left", vertical: "center" },
};

export async function downloadExcel(sheets: SheetDef[], filename: string): Promise<void> {
  // Dynamic import avoids SSR issues
  const XLSX = await import("xlsx-js-style");

  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const aoa: CellValue[][] = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Style header row
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = HEADER_STYLE;
    }

    // Style any "section" rows (rows whose first cell ends in "___section")
    for (let r = 1; r <= range.e.r; r++) {
      const first = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      if (first?.v && String(first.v).endsWith("___section")) {
        first.v = String(first.v).replace("___section", "");
        for (let c2 = range.s.c; c2 <= range.e.c; c2++) {
          const addr2 = XLSX.utils.encode_cell({ r, c: c2 });
          if (!ws[addr2]) ws[addr2] = { v: "", t: "s" };
          ws[addr2].s = SECTION_STYLE;
        }
      }
    }

    // Auto column widths (max 50)
    ws["!cols"] = sheet.headers.map((h, ci) => {
      const maxLen = Math.max(
        h.length,
        ...sheet.rows.map((row) => String(row[ci] ?? "").length)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 8), 50) };
    });

    // Freeze first row
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
