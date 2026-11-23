import * as XLSX from 'xlsx';

export function exportRowsToExcel(
  filename: string,
  headers: string[],
  rows: Record<string, unknown>[]
): void {
  const data = [
    headers,
    ...rows.map((r) => headers.map((h) => (r[h] == null ? '' : r[h]))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(42, h.length + 8)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export interface StructuredExcelOptions {
  filename: string;
  sheetName?: string;
  titleRows: unknown[][];
  headers: string[];
  rows: Record<string, unknown>[];
  summaryRows?: unknown[][];
  mergeTopRowsCount?: number;
}

export function exportStructuredExcel({
  filename,
  sheetName = 'Rekap Nilai',
  titleRows,
  headers,
  rows,
  summaryRows = [],
  mergeTopRowsCount = 1,
}: StructuredExcelOptions): void {
  const tableRows = rows.map((r) => headers.map((h) => (r[h] == null ? '' : r[h])));
  const aoa: unknown[][] = [
    ...titleRows,
    [],
    headers,
    ...tableRows,
    ...(summaryRows.length > 0 ? [[], ...summaryRows] : []),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  if (mergeTopRowsCount > 0 && headers.length > 1) {
    ws['!merges'] = Array.from({ length: mergeTopRowsCount }, (_, rIdx) => ({
      s: { r: rIdx, c: 0 },
      e: { r: rIdx, c: headers.length - 1 },
    }));
  }

  ws['!cols'] = headers.map((h, colIdx) => {
    const maxDataLen = tableRows.reduce((max, row) => {
      const len = String(row[colIdx] ?? '').length;
      return Math.max(max, len);
    }, h.length);
    return { wch: Math.max(10, Math.min(42, maxDataLen + 5)) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export async function readExcelOrCsvFile(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}
