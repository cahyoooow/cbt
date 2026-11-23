import type { AnswerValue, ReviewItem, SoalLengkap, SoalPublik } from '../types/cbt';

export const normalizeText = (s: unknown): string =>
  String(s == null ? '' : s)
    .toLowerCase()
    .replace(/\s+/g, '');

export const slugifyName = (s: unknown): string => {
  const cleaned = String(s == null ? '' : s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'siswa_' + Date.now();
};

export const safeDocId = (s: unknown): string => {
  const cleaned = String(s == null ? '' : s)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 120) || 'doc_' + Date.now();
};

export const round2 = (x: number): number => Math.round(x * 100) / 100;

export function escapeHtml(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    };
    return map[c] || c;
  });
}

/**
 * Formats CBT math & markdown syntax identically to the original SD Negeri 5 Wonosobo app:
 * - ^{...} or ^x -> superscript
 * - _{...} -> subscript
 * - √{...} or ∛{...} -> radical bar
 * - {a/b} -> stacked fraction
 * - **bold** and *italic*
 */
export function formatCbtRichText(raw: unknown): string {
  const escaped = escapeHtml(raw);
  const math = escaped
    .replace(/\^\{([^{}]+)\}|\^(-?\d+|[A-Za-z])/g, (_, a, b) => `<sup>${a || b}</sup>`)
    .replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>')
    .replace(/([√∛])\{([^{}]+)\}/g, '<span class="cbt-sqrt">$1<span class="cbt-sqrt-rad">$2</span></span>')
    .replace(/\{\s*([^{}/]+?)\s*\/\s*([^{}/]+?)\s*\}/g, '<span class="cbt-frac"><span>$1</span><span>$2</span></span>');

  return math
    .replace(/\*\*([^\s*](?:[^*]*[^\s*])?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');
}

export function isImageUrl(v: unknown): boolean {
  const s = String(v == null ? '' : v).trim();
  return /^https?:\/\//i.test(s) || /^data:image\//i.test(s) || s.startsWith('/src/assets/');
}

export function parseOptionValue(raw: unknown): { text: string; imageUrl: string } {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { text: '', imageUrl: '' };
  if (isImageUrl(s)) return { text: '', imageUrl: s };
  const lines = s.split('\n');
  const last = (lines[lines.length - 1] || '').trim();
  if (lines.length > 1 && isImageUrl(last)) {
    return { text: lines.slice(0, -1).join('\n').trim(), imageUrl: last };
  }
  return { text: s, imageUrl: '' };
}

export function parseKategoriLabels(jenisSoal: string): [string, string] {
  const parts = String(jenisSoal || '').split(':');
  const raw = (parts[1] || 'Benar/Salah').trim();
  const pair = raw.split('/').map((x) => x.trim()).filter(Boolean);
  return [pair[0] || 'Benar', pair[1] || 'Salah'];
}

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export function getActiveOptions(q: Pick<SoalPublik, 'pilihan_a' | 'pilihan_b' | 'pilihan_c' | 'pilihan_d'>) {
  const map: Record<(typeof OPTION_KEYS)[number], string> = {
    A: q.pilihan_a,
    B: q.pilihan_b,
    C: q.pilihan_c,
    D: q.pilihan_d,
  };
  return OPTION_KEYS.filter((k) => map[k] != null && String(map[k]).trim() !== '').map((k) => ({
    key: k,
    value: map[k],
  }));
}

export function isQuestionAnswered(q: SoalPublik, ans: AnswerValue | undefined): boolean {
  if (ans == null) return false;
  const baseType = String(q.jenis_soal || 'PG').split(':')[0];
  if (baseType === 'PGK Kategori') {
    const active = getActiveOptions(q);
    const arr = Array.isArray(ans) ? ans : String(ans).split(',');
    return active.some((_, idx) => String(arr[idx] || '').trim() !== '');
  }
  if (Array.isArray(ans)) return ans.some((x) => String(x || '').trim() !== '');
  return String(ans).trim() !== '';
}

/**
 * Exact scoring parity with Code.gs `scoreQ`:
 * - PG: exact match -> full bobot, else 0
 * - PGK MCMA: each option A..D matching key presence earns bobot / n
 * - PGK Kategori: each statement matching key earns bobot / n
 */
export function scoreQuestion(
  q: SoalLengkap,
  answer: AnswerValue | undefined
): { skor: number; maks: number } {
  const baseType = String(q.jenis_soal || 'PG').split(':')[0];
  const w = Number(q.bobot) || 1;
  const activeOps = getActiveOptions(q).map((o) => o.key);
  const n = activeOps.length || 1;
  const arr = Array.isArray(answer)
    ? answer.map(String)
    : String(answer == null ? '' : answer).split(',');

  let skor = 0;
  if (baseType === 'PGK MCMA') {
    const kk = normalizeText(q.kunci_jawaban).split(',').filter(Boolean);
    const aa = arr.map(normalizeText).filter(Boolean);
    if (aa.length > 0) {
      const matched = activeOps.filter(
        (k) => kk.includes(k.toLowerCase()) === aa.includes(k.toLowerCase())
      ).length;
      skor = (w * matched) / n;
    }
  } else if (baseType === 'PGK Kategori') {
    const kk = String(q.kunci_jawaban || '').split(',').map(normalizeText);
    const matched = OPTION_KEYS.filter((k, i) => {
      const hasOp = activeOps.includes(k);
      const ansVal = normalizeText(arr[i]);
      return hasOp && ansVal !== '' && ansVal === kk[i];
    }).length;
    skor = (w * matched) / n;
  } else {
    const x = normalizeText(arr.join(','));
    skor = x !== '' && x === normalizeText(q.kunci_jawaban) ? w : 0;
  }

  return { skor: round2(skor), maks: w };
}

export function calculateExamScore(
  questions: SoalLengkap[],
  answers: Record<string, AnswerValue>
): { nilai: number; benar: number; salah: number; rev: ReviewItem[] } {
  const sorted = [...questions].sort((a, b) => (Number(a.nomor_soal) || 0) - (Number(b.nomor_soal) || 0));
  let tot = 0;
  let got = 0;
  const rev: ReviewItem[] = sorted.map((q) => {
    const a = answers[q.id_soal] ?? '';
    const s = scoreQuestion(q, a);
    tot += s.maks;
    got += s.skor;
    return {
      id_soal: q.id_soal,
      no: q.nomor_soal,
      soal: q.teks_soal,
      jawab: Array.isArray(a) ? a.join(', ') : String(a),
      kunci: q.kunci_jawaban,
      skor: s.skor,
      maks: s.maks,
      benar: s.skor === s.maks,
      pembahasan: q.pembahasan,
    };
  });

  got = round2(got);
  tot = round2(tot);
  return {
    nilai: tot > 0 ? round2((got / tot) * 100) : 0,
    benar: got,
    salah: round2(tot - got),
    rev,
  };
}

export function formatSeconds(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function generateRandomToken(len = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Compresses local image file into compact WebP/JPEG data URL (< 250KB)
 * so images embedded in Firestore load instantly without Drive rate limits.
 */
export function compressImageToDataUrl(file: File, maxDim = 960, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar yang valid'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
        let dataUrl = canvas.toDataURL(mime, quality);
        if (dataUrl.length > 300000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.62);
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
