import mammoth from 'mammoth';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { SoalLengkap } from '../types/cbt';
import { isImageUrl } from './mathFormat';

export interface ParsedWordSoal {
  uid: string;
  selected: boolean;
  nomor_soal: number;
  jenis_soal: string;
  teks_stimulus: string;
  gambar_stimulus_url: string;
  teks_soal: string;
  gambar_soal_url: string;
  pilihan_a: string;
  pilihan_b: string;
  pilihan_c: string;
  pilihan_d: string;
  kunci_jawaban: string;
  pembahasan: string;
  bobot: number;
  tka_mapel: string;
  tka_elemen: string;
  tka_subelemen: string;
  tka_indikator: string;
}

export interface WordParseResult {
  questions: ParsedWordSoal[];
  extractedImages: number;
  warnings: string[];
}

function blobToCompressedDataUrl(blob: Blob, maxDim = 960, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const isPng = blob.type.includes('png');
        let dataUrl = canvas.toDataURL(isPng ? 'image/webp' : 'image/jpeg', quality);
        if (dataUrl.length > 260000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.62);
        }
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Gambar dari dokumen Word tidak valid'));
    };
    img.src = objUrl;
  });
}

function serializeInlineNode(node: Node, images: string[]): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replace(/\u00a0/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'img') {
    const src = el.getAttribute('src') || '';
    if (src && isImageUrl(src)) {
      images.push(src);
    }
    return '';
  }

  if (tag === 'br') return '\n';

  let inner = '';
  el.childNodes.forEach((child) => {
    inner += serializeInlineNode(child, images);
  });

  if (tag === 'sup') {
    const t = inner.trim();
    return t ? `^{${t}}` : '';
  }
  if (tag === 'sub') {
    const t = inner.trim();
    return t ? `_{${t}}` : '';
  }
  if (tag === 'strong' || tag === 'b') {
    const t = inner.trim();
    if (!t) return inner;
    const lead = inner.match(/^\s*/)?.[0] || '';
    const trail = inner.match(/\s*$/)?.[0] || '';
    return `${lead}**${t}**${trail}`;
  }
  if (tag === 'em' || tag === 'i') {
    const t = inner.trim();
    if (!t) return inner;
    const lead = inner.match(/^\s*/)?.[0] || '';
    const trail = inner.match(/\s*$/)?.[0] || '';
    return `${lead}*${t}*${trail}`;
  }

  return inner;
}

interface FlatLine {
  text: string;
  images: string[];
}

function normalizeInlineSpaces(s: string): string {
  return s
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''))
    .join('\n')
    .trim();
}

function extractLinesFromElement(el: HTMLElement): FlatLine[] {
  const tag = el.tagName.toLowerCase();
  if (tag === 'p' || /^h[1-6]$/.test(tag) || tag === 'blockquote') {
    const images: string[] = [];
    const raw = serializeInlineNode(el, images);
    const cleaned = normalizeInlineSpaces(raw);
    if (!cleaned && images.length === 0) return [];
    const subLines = cleaned ? cleaned.split('\n') : [''];
    return subLines.map((line, idx) => ({
      text: line.trim(),
      images: idx === 0 ? images : [],
    }));
  }

  if (tag === 'img') {
    const src = el.getAttribute('src') || '';
    return src && isImageUrl(src) ? [{ text: '', images: [src] }] : [];
  }

  if (tag === 'ul') {
    const out: FlatLine[] = [];
    Array.from(el.children).forEach((child) => {
      if (child.tagName.toLowerCase() !== 'li') return;
      const sub = extractLinesFromListItem(child as HTMLElement, '• ');
      out.push(...sub);
    });
    return out;
  }

  if (tag === 'ol') {
    const typeAttr = (el.getAttribute('type') || '').trim();
    const startAttr = Number(el.getAttribute('start') || '1') || 1;
    const isAlpha = typeAttr === 'A' || typeAttr === 'a';
    const out: FlatLine[] = [];
    Array.from(el.children).forEach((child, idx) => {
      if (child.tagName.toLowerCase() !== 'li') return;
      const prefix = isAlpha
        ? `${String.fromCharCode(65 + (idx % 26))}. `
        : `${startAttr + idx}. `;
      out.push(...extractLinesFromListItem(child as HTMLElement, prefix));
    });
    return out;
  }

  if (tag === 'table') {
    // Non-question tables encountered inside stimulus/question body: flatten rows cleanly
    const out: FlatLine[] = [];
    el.querySelectorAll('tr').forEach((tr) => {
      const cells: string[] = [];
      const rowImages: string[] = [];
      tr.querySelectorAll('th, td').forEach((cell) => {
        const cImgs: string[] = [];
        const txt = normalizeInlineSpaces(serializeInlineNode(cell, cImgs));
        if (txt) cells.push(txt);
        rowImages.push(...cImgs);
      });
      if (cells.length > 0 || rowImages.length > 0) {
        out.push({ text: cells.join(' | '), images: rowImages });
      }
    });
    return out;
  }

  const out: FlatLine[] = [];
  Array.from(el.children).forEach((child) => {
    out.push(...extractLinesFromElement(child as HTMLElement));
  });
  return out;
}

function extractLinesFromListItem(li: HTMLElement, prefix: string): FlatLine[] {
  const out: FlatLine[] = [];
  const directTextImgs: string[] = [];
  let directText = '';
  const nestedBlocks: HTMLElement[] = [];

  li.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as HTMLElement).tagName.toLowerCase();
      if (tag === 'ol' || tag === 'ul' || tag === 'table' || tag === 'p') {
        if (directText.trim() || directTextImgs.length > 0) {
          out.push({
            text: `${out.length === 0 ? prefix : ''}${normalizeInlineSpaces(directText)}`.trim(),
            images: [...directTextImgs],
          });
          directText = '';
          directTextImgs.length = 0;
        }
        nestedBlocks.push(node as HTMLElement);
        return;
      }
    }
    directText += serializeInlineNode(node, directTextImgs);
  });

  if (directText.trim() || directTextImgs.length > 0) {
    out.push({
      text: `${out.length === 0 ? prefix : ''}${normalizeInlineSpaces(directText)}`.trim(),
      images: directTextImgs,
    });
  }

  nestedBlocks.forEach((blk, bIdx) => {
    const tag = blk.tagName.toLowerCase();
    if (tag === 'ol') {
      const childrenLis = Array.from(blk.children).filter(
        (c) => c.tagName.toLowerCase() === 'li'
      ) as HTMLElement[];
      const typeAttr = (blk.getAttribute('type') || '').trim();
      const useOptionLetters =
        typeAttr === 'A' ||
        typeAttr === 'a' ||
        (childrenLis.length >= 2 && childrenLis.length <= 4);
      childrenLis.forEach((nestedLi, nIdx) => {
        const subPrefix = useOptionLetters
          ? `${String.fromCharCode(65 + (nIdx % 26))}. `
          : `${nIdx + 1}. `;
        out.push(...extractLinesFromListItem(nestedLi, subPrefix));
      });
      return;
    }

    const subLines = extractLinesFromElement(blk);
    subLines.forEach((sl, sIdx) => {
      if (out.length === 0 && bIdx === 0 && sIdx === 0) {
        out.push({
          text: `${prefix}${sl.text}`.trim(),
          images: sl.images,
        });
      } else {
        out.push(sl);
      }
    });
  });

  return out;
}

function normalizeHeaderKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[*_`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mapColumnRole(header: string): string | null {
  const h = normalizeHeaderKey(header);
  if (!h) return null;
  if (h === 'no' || h === 'nomor' || h === 'nomor soal' || h === 'no soal') return 'nomor';
  if (h.includes('jenis') || h.includes('tipe')) return 'jenis';
  if (h.includes('gambar stimulus') || h.includes('img stimulus')) return 'gambar_stimulus';
  if (h.includes('stimulus') || h.includes('wacana')) return 'stimulus';
  if (h.includes('gambar soal') || h.includes('img soal')) return 'gambar_soal';
  if (h === 'soal' || h === 'pertanyaan' || h === 'teks soal' || h === 'butir soal') return 'soal';
  if (h === 'a' || h === 'pilihan a' || h === 'opsi a' || h === 'pernyataan a' || h === 'pil a')
    return 'pilihan_a';
  if (h === 'b' || h === 'pilihan b' || h === 'opsi b' || h === 'pernyataan b' || h === 'pil b')
    return 'pilihan_b';
  if (h === 'c' || h === 'pilihan c' || h === 'opsi c' || h === 'pernyataan c' || h === 'pil c')
    return 'pilihan_c';
  if (h === 'd' || h === 'pilihan d' || h === 'opsi d' || h === 'pernyataan d' || h === 'pil d')
    return 'pilihan_d';
  if (h.includes('kunci') || h === 'kj' || h === 'jawaban benar') return 'kunci';
  if (h.includes('pembahasan') || h.includes('penjelasan')) return 'pembahasan';
  if (h === 'bobot' || h === 'skor' || h === 'nilai') return 'bobot';
  if (h.includes('tka mapel') || h === 'mapel tka' || h === 'bidang tka') return 'tka_mapel';
  if (h.includes('subelemen') || h.includes('sub elemen')) return 'tka_subelemen';
  if (h.includes('elemen')) return 'tka_elemen';
  if (h.includes('indikator')) return 'tka_indikator';
  return null;
}

function extractCellValue(cell: Element): { text: string; imageUrl: string } {
  const imgs: string[] = [];
  const paragraphs = cell.querySelectorAll('p, li');
  let text = '';
  if (paragraphs.length > 0) {
    const parts: string[] = [];
    paragraphs.forEach((p) => {
      const t = normalizeInlineSpaces(serializeInlineNode(p, imgs));
      if (t) parts.push(t);
    });
    text = parts.join('\n');
  } else {
    text = normalizeInlineSpaces(serializeInlineNode(cell, imgs));
  }
  return {
    text: text.trim(),
    imageUrl: imgs[0] || '',
  };
}

function mergeCellTextAndImage(val: { text: string; imageUrl: string }): string {
  if (val.text && val.imageUrl) return `${val.text}\n${val.imageUrl}`;
  return val.text || val.imageUrl || '';
}

function normalizeJenisAndKunci(
  rawJenis: string,
  rawKunci: string
): { jenis_soal: string; kunci_jawaban: string } {
  const kClean = rawKunci
    .replace(/^\*+|\*+$/g, '')
    .trim();
  const jLower = rawJenis.toLowerCase().trim();

  let jenis_soal = 'PG';
  if (jLower.includes('mcma')) {
    jenis_soal = 'PGK MCMA';
  } else if (jLower.includes('kategori')) {
    const colonIdx = rawJenis.indexOf(':');
    const suffix = colonIdx >= 0 ? rawJenis.slice(colonIdx + 1).trim() : '';
    jenis_soal = `PGK Kategori:${suffix || 'Benar/Salah'}`;
  } else if (jLower === 'pg' || jLower.includes('pilihan ganda')) {
    jenis_soal = 'PG';
  } else if (!jLower) {
    if (/\b(benar|salah)\b/i.test(kClean)) {
      jenis_soal = 'PGK Kategori:Benar/Salah';
    } else if (/\b(sesuai|tidak\s+sesuai)\b/i.test(kClean)) {
      jenis_soal = 'PGK Kategori:Sesuai/Tidak Sesuai';
    } else if (/^[a-d](\s*[,;/]\s*[a-d])+$/i.test(kClean)) {
      jenis_soal = 'PGK MCMA';
    }
  }

  let kunci_jawaban = kClean;
  if (jenis_soal === 'PG') {
    const m = kClean.match(/[A-Da-d]/);
    kunci_jawaban = m ? m[0].toUpperCase() : kClean.toUpperCase();
  } else if (jenis_soal === 'PGK MCMA') {
    const letters = kClean
      .toUpperCase()
      .split(/[^A-D]+/)
      .filter((x) => /^[A-D]$/.test(x));
    kunci_jawaban = Array.from(new Set(letters)).join(',');
  } else if (jenis_soal.startsWith('PGK Kategori')) {
    kunci_jawaban = kClean
      .split(/[,;|/]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .join(',');
  }

  return { jenis_soal, kunci_jawaban };
}

function tryParseStructuredTable(
  table: HTMLTableElement,
  defaultBobot: number,
  startingNo: number
): ParsedWordSoal[] | null {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length < 2) return null;

  // 1) Try horizontal table with header row
  const headerCells = Array.from(rows[0].querySelectorAll('th, td'));
  const roles = headerCells.map((c) => mapColumnRole(c.textContent || ''));
  const hasQuestionCol = roles.includes('soal');
  const hasOptionOrKey = roles.includes('pilihan_a') || roles.includes('kunci');

  if (hasQuestionCol && hasOptionOrKey) {
    const out: ParsedWordSoal[] = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = Array.from(rows[r].querySelectorAll('th, td'));
      if (cells.length === 0) continue;

      const rec: Record<string, { text: string; imageUrl: string }> = {};
      roles.forEach((role, idx) => {
        if (role && cells[idx]) {
          rec[role] = extractCellValue(cells[idx]);
        }
      });

      const teksSoal = rec.soal?.text || '';
      const gambarSoal = rec.gambar_soal?.text || rec.gambar_soal?.imageUrl || rec.soal?.imageUrl || '';
      const teksStimulus = rec.stimulus?.text || '';
      const gambarStimulus =
        rec.gambar_stimulus?.text || rec.gambar_stimulus?.imageUrl || rec.stimulus?.imageUrl || '';

      if (!teksSoal && !gambarSoal && !teksStimulus) continue;

      const nomorParsed = Number(rec.nomor?.text.replace(/\D+/g, '')) || startingNo + out.length;
      const bobotParsed = Number(rec.bobot?.text.replace(',', '.')) || defaultBobot;
      const { jenis_soal, kunci_jawaban } = normalizeJenisAndKunci(
        rec.jenis?.text || '',
        rec.kunci?.text || ''
      );

      out.push({
        uid: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        selected: true,
        nomor_soal: nomorParsed,
        jenis_soal,
        teks_stimulus: teksStimulus,
        gambar_stimulus_url: gambarStimulus,
        teks_soal: teksSoal || '(Lihat gambar soal)',
        gambar_soal_url: gambarSoal,
        pilihan_a: rec.pilihan_a ? mergeCellTextAndImage(rec.pilihan_a) : '',
        pilihan_b: rec.pilihan_b ? mergeCellTextAndImage(rec.pilihan_b) : '',
        pilihan_c: rec.pilihan_c ? mergeCellTextAndImage(rec.pilihan_c) : '',
        pilihan_d: rec.pilihan_d ? mergeCellTextAndImage(rec.pilihan_d) : '',
        kunci_jawaban,
        pembahasan: rec.pembahasan?.text || '',
        bobot: bobotParsed,
        tka_mapel: rec.tka_mapel?.text || '',
        tka_elemen: rec.tka_elemen?.text || '',
        tka_subelemen: rec.tka_subelemen?.text || '',
        tka_indikator: rec.tka_indikator?.text || '',
      });
    }
    return out.length > 0 ? out : null;
  }

  // 2) Try 2-column vertical key-value card table (e.g. Row: [Soal | ...], [A | ...], [Kunci | ...])
  const isTwoColCard =
    rows.every((r) => r.querySelectorAll('th, td').length === 2) &&
    rows.some((r) => {
      const k = mapColumnRole(r.querySelectorAll('th, td')[0]?.textContent || '');
      return k === 'soal';
    }) &&
    rows.some((r) => {
      const k = mapColumnRole(r.querySelectorAll('th, td')[0]?.textContent || '');
      return k === 'pilihan_a' || k === 'kunci';
    });

  if (isTwoColCard) {
    const out: ParsedWordSoal[] = [];
    let current: Record<string, { text: string; imageUrl: string }> = {};
    const flushCard = () => {
      const teksSoal = current.soal?.text || '';
      const gambarSoal =
        current.gambar_soal?.text || current.gambar_soal?.imageUrl || current.soal?.imageUrl || '';
      if (!teksSoal && !gambarSoal) return;
      const nomorParsed = Number(current.nomor?.text.replace(/\D+/g, '')) || startingNo + out.length;
      const bobotParsed = Number(current.bobot?.text.replace(',', '.')) || defaultBobot;
      const { jenis_soal, kunci_jawaban } = normalizeJenisAndKunci(
        current.jenis?.text || '',
        current.kunci?.text || ''
      );
      out.push({
        uid: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        selected: true,
        nomor_soal: nomorParsed,
        jenis_soal,
        teks_stimulus: current.stimulus?.text || '',
        gambar_stimulus_url:
          current.gambar_stimulus?.text ||
          current.gambar_stimulus?.imageUrl ||
          current.stimulus?.imageUrl ||
          '',
        teks_soal: teksSoal || '(Lihat gambar soal)',
        gambar_soal_url: gambarSoal,
        pilihan_a: current.pilihan_a ? mergeCellTextAndImage(current.pilihan_a) : '',
        pilihan_b: current.pilihan_b ? mergeCellTextAndImage(current.pilihan_b) : '',
        pilihan_c: current.pilihan_c ? mergeCellTextAndImage(current.pilihan_c) : '',
        pilihan_d: current.pilihan_d ? mergeCellTextAndImage(current.pilihan_d) : '',
        kunci_jawaban,
        pembahasan: current.pembahasan?.text || '',
        bobot: bobotParsed,
        tka_mapel: current.tka_mapel?.text || '',
        tka_elemen: current.tka_elemen?.text || '',
        tka_subelemen: current.tka_subelemen?.text || '',
        tka_indikator: current.tka_indikator?.text || '',
      });
      current = {};
    };

    rows.forEach((tr) => {
      const cells = tr.querySelectorAll('th, td');
      const role = mapColumnRole(cells[0].textContent || '');
      if (!role) return;
      if ((role === 'nomor' || (role === 'soal' && current.soal)) && Object.keys(current).length > 0) {
        flushCard();
      }
      current[role] = extractCellValue(cells[1]);
    });
    flushCard();
    return out.length > 0 ? out : null;
  }

  return null;
}

interface DraftQuestion {
  nomor_soal: number;
  jenis_raw: string;
  stimulus_lines: string[];
  stimulus_images: string[];
  soal_lines: string[];
  soal_images: string[];
  options: Record<'A' | 'B' | 'C' | 'D', { lines: string[]; images: string[] }>;
  kunci_raw: string;
  inline_marked_keys: string[];
  pembahasan_lines: string[];
  bobot: number;
  tka_mapel: string;
  tka_elemen: string;
  tka_subelemen: string;
  tka_indikator: string;
  activeSection: 'stimulus' | 'soal' | 'option' | 'pembahasan';
  activeOptionKey: 'A' | 'B' | 'C' | 'D' | null;
}

function createDraft(nomor: number, defaultBobot: number): DraftQuestion {
  return {
    nomor_soal: nomor,
    jenis_raw: '',
    stimulus_lines: [],
    stimulus_images: [],
    soal_lines: [],
    soal_images: [],
    options: {
      A: { lines: [], images: [] },
      B: { lines: [], images: [] },
      C: { lines: [], images: [] },
      D: { lines: [], images: [] },
    },
    kunci_raw: '',
    inline_marked_keys: [],
    pembahasan_lines: [],
    bobot: defaultBobot,
    tka_mapel: '',
    tka_elemen: '',
    tka_subelemen: '',
    tka_indikator: '',
    activeSection: 'soal',
    activeOptionKey: null,
  };
}

function draftHasContent(d: DraftQuestion): boolean {
  return (
    d.soal_lines.length > 0 ||
    d.soal_images.length > 0 ||
    d.stimulus_lines.length > 0 ||
    d.stimulus_images.length > 0 ||
    Boolean(d.options.A.lines.length || d.options.B.lines.length)
  );
}

function finalizeDraft(d: DraftQuestion): ParsedWordSoal | null {
  if (!draftHasContent(d)) return null;

  const rawKunci = d.kunci_raw || d.inline_marked_keys.join(',');
  const { jenis_soal, kunci_jawaban } = normalizeJenisAndKunci(d.jenis_raw, rawKunci);

  const buildOption = (k: 'A' | 'B' | 'C' | 'D') => {
    const opt = d.options[k];
    const txt = opt.lines.join('\n').trim();
    const img = opt.images[0] || '';
    if (txt && img) return `${txt}\n${img}`;
    return txt || img || '';
  };

  let teks_stimulus = d.stimulus_lines.join('\n').trim();
  let gambar_stimulus_url = d.stimulus_images[0] || '';
  let teks_soal = d.soal_lines.join('\n').trim();
  let gambar_soal_url = d.soal_images[0] || '';

  if (!gambar_stimulus_url && d.soal_images.length >= 2 && teks_stimulus) {
    gambar_stimulus_url = d.soal_images[0];
    gambar_soal_url = d.soal_images[1];
  }

  if (!teks_soal && teks_stimulus) {
    teks_soal = teks_stimulus;
    teks_stimulus = '';
  }

  if (!teks_soal && !gambar_soal_url) return null;

  return {
    uid: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    selected: true,
    nomor_soal: d.nomor_soal,
    jenis_soal,
    teks_stimulus,
    gambar_stimulus_url,
    teks_soal: teks_soal || '(Lihat gambar soal)',
    gambar_soal_url,
    pilihan_a: buildOption('A'),
    pilihan_b: buildOption('B'),
    pilihan_c: buildOption('C'),
    pilihan_d: buildOption('D'),
    kunci_jawaban,
    pembahasan: d.pembahasan_lines.join('\n').trim(),
    bobot: d.bobot,
    tka_mapel: d.tka_mapel,
    tka_elemen: d.tka_elemen,
    tka_subelemen: d.tka_subelemen,
    tka_indikator: d.tka_indikator,
  };
}

/**
 * Splits lines like "A. 10   B. 20   C. 30   D. 40" into individual option segments.
 */
function splitInlineOptions(line: string): Array<{ key: 'A' | 'B' | 'C' | 'D'; text: string }> | null {
  const trimmed = line.trim();
  if (!/^[\(\[]?[A-Da-d][\)\].:]\s*/.test(trimmed)) return null;

  const segments: Array<{ key: 'A' | 'B' | 'C' | 'D'; text: string }> = [];
  const regex = /(?:^|(?:\s{2,}|\t+))[\(\[]?([A-Da-d])[\)\].:]\s*/g;
  const matches: Array<{ key: 'A' | 'B' | 'C' | 'D'; start: number; contentStart: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = regex.exec(trimmed)) !== null) {
    matches.push({
      key: m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D',
      start: m.index,
      contentStart: regex.lastIndex,
    });
  }

  if (matches.length === 0) return null;

  // Ensure monotonic option letters when multiple options appear on one line
  if (matches.length > 1) {
    for (let i = 1; i < matches.length; i++) {
      if (matches[i].key.charCodeAt(0) <= matches[i - 1].key.charCodeAt(0)) {
        return null;
      }
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const end = i + 1 < matches.length ? matches[i + 1].start : trimmed.length;
    segments.push({
      key: matches[i].key,
      text: trimmed.slice(matches[i].contentStart, end).trim(),
    });
  }
  return segments;
}

function parseLinesIntoQuestions(lines: FlatLine[], defaultBobot: number): ParsedWordSoal[] {
  const results: ParsedWordSoal[] = [];
  let draft: DraftQuestion | null = null;

  const pushCurrent = () => {
    if (!draft) return;
    const finalized = finalizeDraft(draft);
    if (finalized) results.push(finalized);
    draft = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const { text, images } = lines[i];
    const cleanText = text.replace(/^\*\*|\*\*$/g, '').trim() === '' ? '' : text.trim();

    if (!cleanText && images.length === 0) continue;

    if (/^[-=]{3,}$/.test(cleanText)) {
      pushCurrent();
      continue;
    }

    // Check explicit question start: "1. ...", "No. 1 ...", "Soal 1.", "1) ..."
    // Strip optional bold wrapper around question number like "**1.** Pertanyaan"
    const unboldNumLine = cleanText.replace(/^\*\*(\d{1,3}\s*[.)])\*\*\s*/, '$1 ');
    const qStartMatch = unboldNumLine.match(
      /^(?:(?:soal|no\.?|nomor)\s*(?:no\.?)?\s*)?(\d{1,3})\s*[.)]?\s*(.*)$/i
    );
    const hasExplicitWordPrefix = /^(?:soal|no\.?|nomor)\s*\d{1,3}/i.test(unboldNumLine);
    const hasNumberDotParen = /^\d{1,3}\s*[.)]/.test(unboldNumLine);

    if (qStartMatch && (hasExplicitWordPrefix || hasNumberDotParen)) {
      const qNum = Number(qStartMatch[1]);
      const rest = (qStartMatch[2] || '').replace(/^[.:)\-]+\s*/, '').trim();

      const hasStartedOptionsOrKey =
        draft !== null &&
        (draft.options.A.lines.length > 0 ||
          draft.options.B.lines.length > 0 ||
          draft.kunci_raw !== '' ||
          draft.pembahasan_lines.length > 0);

      const isExpectedSequential =
        draft !== null && qNum === draft.nomor_soal + 1 && draftHasContent(draft);

      if (draft === null || hasExplicitWordPrefix || hasStartedOptionsOrKey || isExpectedSequential) {
        pushCurrent();
        draft = createDraft(qNum || results.length + 1, defaultBobot);
        if (rest) {
          // Check inline "(Jenis: PGK MCMA)" at start of question
          const inlineJenis = rest.match(/^\(\s*jenis\s*:\s*([^)]+)\)\s*(.*)$/i);
          if (inlineJenis) {
            draft.jenis_raw = inlineJenis[1].trim();
            if (inlineJenis[2].trim()) draft.soal_lines.push(inlineJenis[2].trim());
          } else {
            draft.soal_lines.push(rest);
          }
        }
        if (images.length > 0) {
          draft.soal_images.push(...images);
        }
        continue;
      }
    }

    if (!draft) {
      // Allow Stimulus: or Jenis: before numbered question 1, or implicit Q1
      if (/^(?:stimulus|wacana|jenis|soal|pertanyaan)\s*:/i.test(cleanText) || images.length > 0) {
        draft = createDraft(results.length + 1, defaultBobot);
      } else {
        continue;
      }
    }

    // Check metadata prefixes
    const metaJenis = cleanText.match(/^(?:\*\*)?(?:jenis(?:\s+soal)?|tipe(?:\s+soal)?)(?:\*\*)?\s*:\s*(.+)$/i);
    if (metaJenis) {
      draft.jenis_raw = metaJenis[1].replace(/\*\*/g, '').trim();
      continue;
    }

    const metaStimulus = cleanText.match(/^(?:\*\*)?(?:teks\s+)?(?:stimulus|wacana)(?:\*\*)?\s*:\s*(.*)$/i);
    if (metaStimulus) {
      draft.activeSection = 'stimulus';
      draft.activeOptionKey = null;
      if (metaStimulus[1].trim()) draft.stimulus_lines.push(metaStimulus[1].trim());
      if (images.length > 0) draft.stimulus_images.push(...images);
      continue;
    }

    const metaSoal = cleanText.match(/^(?:\*\*)?(?:teks\s+soal|pertanyaan|soal)(?:\*\*)?\s*:\s*(.*)$/i);
    if (metaSoal) {
      draft.activeSection = 'soal';
      draft.activeOptionKey = null;
      if (metaSoal[1].trim()) draft.soal_lines.push(metaSoal[1].trim());
      if (images.length > 0) draft.soal_images.push(...images);
      continue;
    }

    const metaKunci = cleanText.match(/^(?:\*\*)?(?:kunci(?:\s+jawaban)?|jawaban|kj)(?:\*\*)?\s*:\s*(.+)$/i);
    if (metaKunci) {
      draft.kunci_raw = metaKunci[1].replace(/\*\*/g, '').trim();
      draft.activeOptionKey = null;
      continue;
    }

    const metaBobot = cleanText.match(/^(?:\*\*)?(?:bobot|skor|nilai)(?:\*\*)?\s*:\s*(\d+(?:[.,]\d+)?)/i);
    if (metaBobot) {
      draft.bobot = Number(metaBobot[1].replace(',', '.')) || defaultBobot;
      continue;
    }

    const metaPembahasan = cleanText.match(/^(?:\*\*)?(?:pembahasan|penjelasan)(?:\*\*)?\s*:\s*(.*)$/i);
    if (metaPembahasan) {
      draft.activeSection = 'pembahasan';
      draft.activeOptionKey = null;
      if (metaPembahasan[1].trim()) draft.pembahasan_lines.push(metaPembahasan[1].trim());
      continue;
    }

    const metaMapel = cleanText.match(/^(?:\*\*)?(?:tka\s*mapel|mapel\s*tka|bidang)(?:\*\*)?\s*:\s*(.+)$/i);
    if (metaMapel) {
      draft.tka_mapel = metaMapel[1].replace(/\*\*/g, '').trim();
      continue;
    }

    const metaElemen = cleanText.match(/^(?:\*\*)?(?:tka\s*elemen|elemen)(?:\*\*)?\s*:\s*(.+)$/i);
    if (metaElemen) {
      draft.tka_elemen = metaElemen[1].replace(/\*\*/g, '').trim();
      continue;
    }

    const metaSub = cleanText.match(/^(?:\*\*)?(?:tka\s*sub\s*-?\s*elemen|sub\s*-?\s*elemen)(?:\*\*)?\s*:\s*(.+)$/i);
    if (metaSub) {
      draft.tka_subelemen = metaSub[1].replace(/\*\*/g, '').trim();
      continue;
    }

    const metaInd = cleanText.match(/^(?:\*\*)?(?:tka\s*indikator|indikator)(?:\*\*)?\s*:\s*(.+)$/i);
    if (metaInd) {
      draft.tka_indikator = metaInd[1].replace(/\*\*/g, '').trim();
      continue;
    }

    // Check option(s) A..D
    const unboldOptLine = cleanText.replace(/^\*\*([\(\[]?[A-Da-d][\)\].:])\*\*\s*/, '$1 ');
    const optSegments = splitInlineOptions(unboldOptLine);
    if (optSegments && optSegments.length > 0) {
      draft.activeSection = 'option';
      optSegments.forEach((seg, segIdx) => {
        let optText = seg.text;
        const starMark = optText.match(/^(.*?)\s*(?:\*|\[benar\]|\(benar\)|\(kunci\))$/i);
        if (starMark && starMark[1].trim()) {
          optText = starMark[1].trim();
          if (!draft!.inline_marked_keys.includes(seg.key)) {
            draft!.inline_marked_keys.push(seg.key);
          }
        }
        if (optText) draft!.options[seg.key].lines.push(optText);
        if (segIdx === 0 && images.length > 0) {
          draft!.options[seg.key].images.push(...images);
        }
        draft!.activeOptionKey = seg.key;
      });
      continue;
    }

    // Continuation line / image for active section
    if (draft.activeSection === 'stimulus') {
      if (cleanText) draft.stimulus_lines.push(cleanText);
      if (images.length > 0) draft.stimulus_images.push(...images);
    } else if (draft.activeSection === 'pembahasan') {
      if (cleanText) draft.pembahasan_lines.push(cleanText);
    } else if (draft.activeSection === 'option' && draft.activeOptionKey) {
      if (cleanText) draft.options[draft.activeOptionKey].lines.push(cleanText);
      if (images.length > 0) draft.options[draft.activeOptionKey].images.push(...images);
    } else {
      if (cleanText) draft.soal_lines.push(cleanText);
      if (images.length > 0) draft.soal_images.push(...images);
    }
  }

  pushCurrent();
  return results;
}

export async function parseWordDocxFile(
  file: File,
  defaultBobot = 10
): Promise<WordParseResult> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
    throw new Error(
      'Format .doc (Word lama) belum didukung langsung. Silakan buka di Word lalu Save As sebagai .docx.'
    );
  }
  if (!lowerName.endsWith('.docx')) {
    throw new Error('Pilih file Microsoft Word berformat .docx.');
  }

  const arrayBuffer = await file.arrayBuffer();
  let extractedImages = 0;
  const warnings: string[] = [];

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        try {
          const buf = await image.readAsArrayBuffer();
          const blob = new Blob([buf], { type: image.contentType || 'image/png' });
          const dataUrl = await blobToCompressedDataUrl(blob);
          extractedImages++;
          return { src: dataUrl };
        } catch {
          warnings.push('Sebagian gambar (misal format WMF/EMF) tidak dapat dikonversi browser.');
          return { src: '' };
        }
      }),
    }
  );

  const parser = new DOMParser();
  const doc = parser.parseFromString(result.value, 'text/html');

  const tableQuestions: ParsedWordSoal[] = [];
  const textBlocks: FlatLine[] = [];

  Array.from(doc.body.children).forEach((child) => {
    const el = child as HTMLElement;
    if (el.tagName.toLowerCase() === 'table') {
      const parsedTable = tryParseStructuredTable(
        el as HTMLTableElement,
        defaultBobot,
        tableQuestions.length + 1
      );
      if (parsedTable && parsedTable.length > 0) {
        tableQuestions.push(...parsedTable);
        return;
      }
    }
    textBlocks.push(...extractLinesFromElement(el));
  });

  const textQuestions = parseLinesIntoQuestions(textBlocks, defaultBobot);
  const questions = [...tableQuestions, ...textQuestions];

  if (questions.length === 0) {
    warnings.push(
      'Tidak ditemukan butir soal yang sesuai pola. Pastikan soal diawali nomor (1., 2., ...) dengan pilihan A–D, atau gunakan Template Word.'
    );
  }

  return {
    questions,
    extractedImages,
    warnings: Array.from(new Set(warnings)),
  };
}

export async function downloadWordTemplate(): Promise<void> {
  const tableHeaderCells = [
    'No',
    'Jenis',
    'Stimulus',
    'Soal',
    'A',
    'B',
    'C',
    'D',
    'Kunci',
    'Pembahasan',
    'Bobot',
  ].map(
    (label) =>
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 18 })],
          }),
        ],
      })
  );

  const sampleRowValues = [
    '4',
    'PG',
    'Siswa kelas 6 mengamati data panen buah di kebun sekolah.',
    'Berapa jumlah apel jika 2 keranjang masing-masing berisi 15 buah?',
    '20 buah',
    '25 buah',
    '30 buah',
    '35 buah',
    'C',
    '2 x 15 = 30 buah.',
    '10',
  ].map(
    (val) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })] })],
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'TEMPLATE IMPOR SOAL WORD (.docx) - CBT', bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Anda boleh menulis soal dengan Format 1 (Naskah Bernomor) atau Format 2 (Tabel). Gambar dapat disisipkan langsung di Word di bawah Stimulus, Pertanyaan, atau Pilihan A–D.',
                italics: true,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: 'FORMAT 1: NASKAH BERNOMOR', bold: true })],
          }),
          new Paragraph({ text: '1. Stimulus: Bacalah teks berikut dengan cermat!' }),
          new Paragraph({ text: 'Air memiliki rumus kimia H2O dan sangat penting bagi kehidupan.' }),
          new Paragraph({
            children: [
              new TextRun('Pertanyaan: Hasil dari 5'),
              new TextRun({ text: '2', superScript: true }),
              new TextRun(' + 10 adalah ....'),
            ],
          }),
          new Paragraph({ text: 'A. 20' }),
          new Paragraph({ text: 'B. 25' }),
          new Paragraph({ text: 'C. 35' }),
          new Paragraph({ text: 'D. 45' }),
          new Paragraph({ text: 'Kunci: C' }),
          new Paragraph({ text: 'Bobot: 10' }),
          new Paragraph({ text: 'Pembahasan: 5 pangkat 2 adalah 25, ditambah 10 menjadi 35.' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '2. Jenis: PGK MCMA' }),
          new Paragraph({ text: 'Pilihlah dua bilangan prima di bawah ini!' }),
          new Paragraph({ text: 'A. 2' }),
          new Paragraph({ text: 'B. 4' }),
          new Paragraph({ text: 'C. 5' }),
          new Paragraph({ text: 'D. 9' }),
          new Paragraph({ text: 'Kunci: A, C' }),
          new Paragraph({ text: 'Bobot: 10' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '3. Jenis: PGK Kategori:Benar/Salah' }),
          new Paragraph({ text: 'Tentukan Benar atau Salah untuk setiap pernyataan berikut!' }),
          new Paragraph({ text: 'A. Jakarta adalah ibu kota Indonesia saat ini' }),
          new Paragraph({ text: 'B. Jumlah bulan dalam satu tahun adalah 10 bulan' }),
          new Paragraph({ text: 'C. Air membeku pada suhu 0 derajat Celcius' }),
          new Paragraph({ text: 'D. Segitiga memiliki 4 buah sisi' }),
          new Paragraph({ text: 'Kunci: Benar, Salah, Benar, Salah' }),
          new Paragraph({ text: 'Bobot: 10' }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: 'FORMAT 2: TABEL WORD', bold: true })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: tableHeaderCells }),
              new TableRow({ children: sampleRowValues }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_soal_cbt.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function mapWordSoalsForImport(
  items: ParsedWordSoal[],
  existingCount: number,
  renumberSequentially: boolean
): Partial<SoalLengkap>[] {
  const base = Date.now();
  return items
    .filter((x) => x.selected)
    .map((item, idx) => ({
      id_soal: `S${base}_${idx}`,
      nomor_soal: renumberSequentially ? existingCount + idx + 1 : item.nomor_soal || idx + 1,
      jenis_soal: item.jenis_soal || 'PG',
      teks_stimulus: item.teks_stimulus,
      gambar_stimulus_url: item.gambar_stimulus_url,
      teks_soal: item.teks_soal,
      gambar_soal_url: item.gambar_soal_url,
      pilihan_a: item.pilihan_a,
      pilihan_b: item.pilihan_b,
      pilihan_c: item.pilihan_c,
      pilihan_d: item.pilihan_d,
      kunci_jawaban: item.kunci_jawaban,
      pembahasan: item.pembahasan,
      bobot: Number(item.bobot) || 10,
      tka_mapel: item.tka_mapel,
      tka_elemen: item.tka_elemen,
      tka_subelemen: item.tka_subelemen,
      tka_indikator: item.tka_indikator,
    }));
}
