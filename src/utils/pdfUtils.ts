import { jsPDF } from 'jspdf';
import autoTable, { type Styles } from 'jspdf-autotable';
import type { PaketUjian, Pengaturan, SoalLengkap } from '../types/cbt';
import { getActiveOptions, parseOptionValue } from './mathFormat';

export interface PdfMetaPair {
  label: string;
  value: string;
}

export interface ReportHeaderOptions {
  title: string;
  schoolName?: string;
  schoolSubtitle?: string;
  metaPairs?: PdfMetaPair[];
}

export interface ExportTablePdfOptions extends ReportHeaderOptions {
  filename: string;
  orientation?: 'portrait' | 'landscape';
  headers: (string | number)[];
  rows: (string | number)[][];
  footRows?: (string | number)[][];
  columnStyles?: Record<number, Partial<Styles>>;
}

export function stripRichMarkup(input: string | undefined | null): string {
  if (!input) return '';
  return String(input)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'akar($1)')
    .replace(/\\times/g, 'x')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, ':')
    .replace(/\\leq/g, '<=')
    .replace(/\\geq/g, '>=')
    .replace(/\\neq/g, '!=')
    .replace(/\\pm/g, '±')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function drawReportHeader(doc: jsPDF, opts: ReportHeaderOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text((opts.schoolName || 'Portal Ujian CBT').toUpperCase(), marginX, y);
  y += 5;

  if (opts.schoolSubtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const subLines = doc.splitTextToSize(opts.schoolSubtitle, pageWidth - marginX * 2) as string[];
    doc.text(subLines, marginX, y);
    y += subLines.length * 3.8 + 1;
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  const titleLines = doc.splitTextToSize(opts.title, pageWidth - marginX * 2) as string[];
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 4.6 + 2;

  const metaPairs = opts.metaPairs || [];
  if (metaPairs.length > 0) {
    const colWidth = (pageWidth - marginX * 2) / 2;
    doc.setFontSize(8.2);
    for (let i = 0; i < metaPairs.length; i += 2) {
      const left = metaPairs[i];
      const right = metaPairs[i + 1];
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text(`${left.label}:`, marginX, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const leftVal = doc.splitTextToSize(left.value || '-', colWidth - 36) as string[];
      doc.text(leftVal[0] || '-', marginX + 34, y);

      if (right) {
        const rightX = marginX + colWidth + 2;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text(`${right.label}:`, rightX, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        const rightVal = doc.splitTextToSize(right.value || '-', colWidth - 36) as string[];
        doc.text(rightVal[0] || '-', rightX + 34, y);
      }
      y += 4.3;
    }
    y += 1.5;
  }

  return y;
}

function addPageFooters(doc: jsPDF): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const stamp = new Date().toLocaleString('id-ID');

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Dicetak: ${stamp}`, 14, pageHeight - 8);
    doc.text(`Halaman ${i} / ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }
}

export function exportTablePdf(opts: ExportTablePdfOptions): void {
  const doc = new jsPDF({
    orientation: opts.orientation || 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const startY = drawReportHeader(doc, opts);

  autoTable(doc, {
    startY,
    head: [opts.headers.map((h) => String(h))],
    body: opts.rows.map((r) => r.map((c) => (c === null || c === undefined ? '-' : String(c)))),
    foot: opts.footRows
      ? opts.footRows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))))
      : undefined,
    margin: { left: 14, right: 14, bottom: 14 },
    styles: {
      font: 'helvetica',
      fontSize: opts.headers.length > 10 ? 7 : 8,
      cellPadding: opts.headers.length > 10 ? 1.5 : 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: opts.columnStyles,
  });

  addPageFooters(doc);
  doc.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`);
}

interface LoadedPdfImage {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
  width: number;
  height: number;
}

function getPdfImageCandidates(rawUrl: string): string[] {
  const url = rawUrl.trim();
  if (!url) return [];
  const driveMatch =
    url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/) ||
    url.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (!driveMatch) return [url];
  const id = driveMatch[1];
  return Array.from(
    new Set([
      url,
      `https://lh3.googleusercontent.com/d/${id}=w1200`,
      `https://drive.google.com/thumbnail?sz=w1200&id=${id}`,
    ])
  );
}

function loadImageElement(src: string, useCors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors) img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    const timer = window.setTimeout(() => reject(new Error('Image timeout')), 9000);
    img.onload = () => {
      window.clearTimeout(timer);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve(img);
      else reject(new Error('Empty image'));
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Image load failed'));
    };
    img.src = src;
  });
}

function imageToCanvasData(img: HTMLImageElement, isPngPreferred: boolean): LoadedPdfImage {
  const maxDim = 1200;
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable');
  }
  if (!isPngPreferred) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  const format: 'PNG' | 'JPEG' = isPngPreferred ? 'PNG' : 'JPEG';
  const dataUrl = isPngPreferred
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', 0.88);
  return { dataUrl, format, width: w, height: h };
}

async function loadImageForPdf(rawUrl: string | undefined | null): Promise<LoadedPdfImage | null> {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;

  if (/^data:image\//i.test(trimmed)) {
    try {
      const img = await loadImageElement(trimmed, false);
      const isPng = /^data:image\/png/i.test(trimmed);
      return imageToCanvasData(img, isPng);
    } catch {
      return null;
    }
  }

  for (const candidate of getPdfImageCandidates(trimmed)) {
    try {
      const res = await fetch(candidate, { mode: 'cors', referrerPolicy: 'no-referrer' });
      if (res.ok) {
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        try {
          const img = await loadImageElement(objUrl, false);
          const isPng = blob.type.includes('png');
          return imageToCanvasData(img, isPng);
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      }
    } catch {
      // fallback to direct Image element with crossOrigin
    }

    try {
      const img = await loadImageElement(candidate, true);
      return imageToCanvasData(img, candidate.toLowerCase().includes('.png'));
    } catch {
      // try next candidate
    }
  }

  return null;
}

export async function exportBankSoalPdf(
  paket: PaketUjian,
  soals: SoalLengkap[],
  settings?: Pengaturan,
  includeAnswers = true
): Promise<{ embeddedImages: number; skippedImages: number }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const maxTextWidth = pageWidth - marginX * 2;
  const totalBobot = soals.reduce((sum, q) => sum + (Number(q.bobot) || 0), 0);

  let y = drawReportHeader(doc, {
    title: `Naskah Soal: ${paket.nama_paket_soal}`,
    schoolName: settings?.judul || 'CBT - Computer Based Test',
    schoolSubtitle: settings?.subjudul || '',
    metaPairs: [
      { label: 'Mata Pelajaran', value: paket.mata_pelajaran || '-' },
      { label: 'Jumlah Soal', value: `${soals.length} butir (Total bobot ${totalBobot})` },
      { label: 'Durasi', value: `${paket.durasi_menit} menit` },
      { label: 'Token Paket', value: paket.token_paket_soal || '-' },
    ],
  });

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 16) {
      doc.addPage();
      y = 16;
    }
  };

  const writeWrapped = (
    text: string,
    x: number,
    width: number,
    fontSize: number,
    style: 'normal' | 'bold' | 'italic' = 'normal',
    color: [number, number, number] = [15, 23, 42],
    lineStep = 4.4
  ) => {
    if (!text) return;
    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, width) as string[];
    lines.forEach((line) => {
      ensureSpace(lineStep + 1);
      doc.text(line, x, y);
      y += lineStep;
    });
  };

  let embeddedImages = 0;
  let skippedImages = 0;

  const drawPdfImage = async (
    url: string | undefined | null,
    x: number,
    maxW: number,
    maxH: number,
    fallbackLabel: string
  ) => {
    const trimmed = String(url || '').trim();
    if (!trimmed) return;
    const img = await loadImageForPdf(trimmed);
    if (!img) {
      skippedImages++;
      writeWrapped(
        `[${fallbackLabel} tidak dapat disematkan otomatis]`,
        x,
        maxW,
        8,
        'italic',
        [148, 163, 184],
        3.8
      );
      return;
    }
    const pxToMm = 0.264583;
    const natW = img.width * pxToMm;
    const natH = img.height * pxToMm;
    const scale = Math.min(maxW / natW, maxH / natH, 1);
    const drawW = Math.max(12, natW * scale);
    const drawH = Math.max(8, natH * scale);
    ensureSpace(drawH + 4);
    doc.addImage(img.dataUrl, img.format, x, y, drawW, drawH, undefined, 'FAST');
    y += drawH + 2.5;
    embeddedImages++;
  };

  for (let idx = 0; idx < soals.length; idx++) {
    const q = soals[idx];
    ensureSpace(22);

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(marginX, y - 3.6, maxTextWidth, 6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    const metaLabel = includeAnswers
      ? `No. ${q.nomor_soal}  |  ${q.jenis_soal}  |  Bobot: ${q.bobot}  |  Kunci: ${q.kunci_jawaban || '-'}`
      : `No. ${q.nomor_soal}  |  ${q.jenis_soal}  |  Bobot: ${q.bobot}`;
    doc.text(metaLabel, marginX + 2.5, y + 0.3);
    y += 5.5;

    const stimulus = stripRichMarkup(q.teks_stimulus);
    if (stimulus) {
      writeWrapped(stimulus, marginX + 2, maxTextWidth - 4, 8.8, 'italic', [71, 85, 105], 4.2);
      y += 1;
    }
    if (q.gambar_stimulus_url) {
      await drawPdfImage(q.gambar_stimulus_url, marginX + 2, 115, 55, 'Gambar stimulus');
    }

    const soalText = stripRichMarkup(q.teks_soal);
    if (soalText) {
      writeWrapped(soalText, marginX + 1, maxTextWidth - 2, 9.5, 'normal', [15, 23, 42], 4.5);
      y += 1;
    }
    if (q.gambar_soal_url) {
      await drawPdfImage(q.gambar_soal_url, marginX + 2, 115, 58, 'Gambar soal');
    }

    const options = getActiveOptions(q);
    for (const opt of options) {
      const parsed = parseOptionValue(opt.value);
      const optClean = stripRichMarkup(parsed.text);
      if (optClean) {
        writeWrapped(
          `${opt.key}. ${optClean}`,
          marginX + 5,
          maxTextWidth - 7,
          9,
          'normal',
          [51, 65, 85],
          4.2
        );
      } else if (parsed.imageUrl) {
        writeWrapped(`${opt.key}.`, marginX + 5, maxTextWidth - 7, 9, 'normal', [51, 65, 85], 4);
      }
      if (parsed.imageUrl) {
        await drawPdfImage(parsed.imageUrl, marginX + 10, 75, 38, `Gambar pilihan ${opt.key}`);
      }
    }

    if (includeAnswers && q.pembahasan) {
      const pemb = stripRichMarkup(q.pembahasan);
      if (pemb) {
        y += 0.5;
        writeWrapped(`Pembahasan: ${pemb}`, marginX + 3, maxTextWidth - 5, 8.3, 'italic', [4, 120, 87], 4);
      }
    }

    y += 3.5;
    if (idx < soals.length - 1) {
      ensureSpace(4);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(marginX, y - 1.5, pageWidth - marginX, y - 1.5);
      y += 2;
    }
  }

  addPageFooters(doc);
  const cleanName = paket.nama_paket_soal.replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`bank_soal_${cleanName || 'paket'}.pdf`);
  return { embeddedImages, skippedImages };
}

export function triggerPrintOrPdf(
  fallbackPdf: () => void | Promise<unknown>,
  onFallbackNotice?: (msg: string) => void
): void {
  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  if (inIframe) {
    void Promise.resolve(fallbackPdf());
    onFallbackNotice?.('Mode preview membatasi dialog cetak browser; file PDF otomatis diunduh.');
    return;
  }

  try {
    window.print();
  } catch {
    void Promise.resolve(fallbackPdf());
    onFallbackNotice?.('Dialog cetak tidak tersedia; file PDF otomatis diunduh.');
  }
}
