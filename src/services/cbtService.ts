import {
  clearAdminSessionPw,
  callGas,
  callGasAdmin,
  getAdminSessionPw,
  setAdminSessionPw,
  uploadDataUrlFieldToGas,
} from './gasClient';
import type {
  ActiveStudentSession,
  AdminPassLabel,
  AnswerValue,
  ExamSubmitResult,
  HasilUjian,
  LogPelanggaran,
  PaketUjian,
  Pengaturan,
  ProgresUjian,
  Siswa,
  SoalLengkap,
  SoalPublik,
  TataTertib,
} from '../types/cbt';
import {
  generateRandomToken,
  slugifyName,
} from '../utils/mathFormat';

export const DEFAULT_PENGATURAN: Pengaturan = {
  judul: 'CBT - SD Negeri 5 Wonosobo',
  subjudul: 'Computer Based Test',
  judul_admin: 'Admin CBT',
  subjudul_admin: '',
  logo: '',
};

export const DEFAULT_TATA_TERTIB: string[] = [
  'Berdoa sebelum mengerjakan soal.',
  'Kerjakan soal dengan jujur dan mandiri.',
  'Dilarang membuka tab atau aplikasi lain selama ujian.',
  'Dilarang menyalin, menempel, dan klik kanan.',
  'Pelanggaran tercatat otomatis dan dilaporkan ke guru.',
  'Ujian terkirim otomatis saat waktu habis.',
];

const LS_PAKET_PREFS = 'cbt_paket_prefs';
const LS_TKA_OVERRIDES = 'cbt_tka_overrides';
const LS_TATA_TERTIB = 'cbt_tata_tertib';
const LS_PENGATURAN_CACHE = 'cbt_pengaturan_cache';
const LS_SOAL_CACHE_PREFIX = 'cbt_qs_cache_';

const PENGATURAN_CACHE_TTL_MS = 5 * 60 * 1000;
const SOAL_CACHE_TTL_MS = 20 * 60 * 1000;

// In-memory sheet row caches (updated on every list call)
const paketRowById = new Map<string, number>();
const paketNameById = new Map<string, string>();
const soalRowById = new Map<string, number>();
const soalRawById = new Map<string, Record<string, unknown>>();
const siswaRowById = new Map<string, number>();
const siswaNameById = new Map<string, string>();
const logMetaById = new Map<
  string,
  { row: number; nama: string; raw: Record<string, unknown> }
>();

// Short-TTL shared memory cache + in-flight request coalescing to avoid redundant server hits
interface TimedCacheEntry<T> {
  ts: number;
  data: T;
}
const memCache = new Map<string, TimedCacheEntry<unknown>>();
const inFlightCache = new Map<string, Promise<unknown>>();

async function withSharedCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = memCache.get(key) as TimedCacheEntry<T> | undefined;
  if (cached && Date.now() - cached.ts < ttlMs) {
    return cached.data;
  }
  const existingFlight = inFlightCache.get(key) as Promise<T> | undefined;
  if (existingFlight) {
    return existingFlight;
  }
  const promise = fetcher()
    .then((data) => {
      memCache.set(key, { ts: Date.now(), data });
      return data;
    })
    .finally(() => {
      inFlightCache.delete(key);
    });
  inFlightCache.set(key, promise);
  return promise;
}

export function invalidateAdminCaches(keys?: string[]): void {
  if (!keys || keys.length === 0) {
    memCache.clear();
    return;
  }
  keys.forEach((k) => memCache.delete(k));
}

interface PaketPrefs {
  tampilkan_nilai?: boolean;
  acak_soal?: boolean;
}

interface TkaOverride {
  tka_mapel: string;
  tka_elemen: string;
  tka_subelemen: string;
  tka_indikator: string;
}

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

function makePaketId(namaPaket: string): string {
  return `pkt_${slugifyName(namaPaket)}`;
}

function getPaketPrefsMap(): Record<string, PaketPrefs> {
  return readJsonStorage<Record<string, PaketPrefs>>(LS_PAKET_PREFS, {});
}

function savePaketPrefs(paketId: string, prefs: PaketPrefs): void {
  const all = getPaketPrefsMap();
  all[paketId] = prefs;
  writeJsonStorage(LS_PAKET_PREFS, all);
}

function getTkaOverridesMap(): Record<string, TkaOverride> {
  return readJsonStorage<Record<string, TkaOverride>>(LS_TKA_OVERRIDES, {});
}

// Deterministic Fisher-Yates shuffle when acak_soal is enabled
function seededShuffle<T>(items: T[], seedStr: string): T[] {
  const arr = [...items];
  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    seed ^= seedStr.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const rand = () => {
    seed += 0x6d2b79f5;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseLegacyDateOrNull(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 100000) {
    return new Date(Math.round((raw - 25569) * 86400 * 1000));
  }
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s === '-') return null;
  const isoCandidate = s.includes('T') ? s : s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
  const direct = Date.parse(isoCandidate);
  if (!Number.isNaN(direct)) return new Date(direct);
  const m = s.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,\s]+(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?)?/
  );
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const year = Number(m[3]);
    const hh = Number(m[4] || 0);
    const mm = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    const d = new Date(year, month, day, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function getRowField(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== '' && row[key] != null) {
      return row[key];
    }
  }
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = candidates.map(norm);
  for (const [k, v] of Object.entries(row)) {
    if (v !== '' && v != null && wanted.includes(norm(k))) {
      return v;
    }
  }
  return '';
}

function parseDetailJawaban(raw: unknown): Record<string, AnswerValue> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, AnswerValue>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, AnswerValue>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

// ===== Settings & Tata Tertib =====

export async function getPengaturan(forceRefresh = false): Promise<Pengaturan> {
  if (!forceRefresh) {
    const cached = readJsonStorage<{ ts: number; data: Pengaturan } | null>(
      LS_PENGATURAN_CACHE,
      null
    );
    if (cached && cached.data && Date.now() - cached.ts < PENGATURAN_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  return withSharedCache('pengaturan', forceRefresh ? 0 : PENGATURAN_CACHE_TTL_MS, async () => {
    try {
      const d = await callGas<Record<string, unknown>>('getSettings', []);
      if (!d || typeof d !== 'object') return DEFAULT_PENGATURAN;
      const cfg: Pengaturan = {
        judul: String(d.judul || DEFAULT_PENGATURAN.judul),
        subjudul: d.subjudul != null ? String(d.subjudul) : DEFAULT_PENGATURAN.subjudul,
        judul_admin: d.judul_admin != null ? String(d.judul_admin) : DEFAULT_PENGATURAN.judul_admin,
        subjudul_admin:
          d.subjudul_admin != null ? String(d.subjudul_admin) : DEFAULT_PENGATURAN.subjudul_admin,
        logo: d.logo ? String(d.logo) : DEFAULT_PENGATURAN.logo,
      };
      writeJsonStorage(LS_PENGATURAN_CACHE, { ts: Date.now(), data: cfg });
      return cfg;
    } catch (err) {
      const stale = readJsonStorage<{ ts: number; data: Pengaturan } | null>(
        LS_PENGATURAN_CACHE,
        null
      );
      if (stale?.data) return stale.data;
      console.warn('Fallback ke pengaturan default:', err);
      return DEFAULT_PENGATURAN;
    }
  });
}

export async function savePengaturan(cfg: Pengaturan): Promise<void> {
  const uploadedLogo = cfg.logo
    ? await uploadDataUrlFieldToGas(cfg.logo, 'logo_sekolah')
    : '';
  const savedCfg: Pengaturan = {
    judul: cfg.judul.trim() || DEFAULT_PENGATURAN.judul,
    subjudul: cfg.subjudul ?? '',
    judul_admin: cfg.judul_admin ?? 'Admin CBT',
    subjudul_admin: cfg.subjudul_admin ?? '',
    logo: uploadedLogo,
  };
  await callGasAdmin('setting', savedCfg as unknown as Record<string, unknown>);
  writeJsonStorage(LS_PENGATURAN_CACHE, { ts: Date.now(), data: savedCfg });
  invalidateAdminCaches(['pengaturan']);
}

export async function getTataTertib(): Promise<TataTertib[]> {
  const stored = readJsonStorage<string[]>(LS_TATA_TERTIB, []);
  const lines = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_TATA_TERTIB;
  return lines.map((teks, idx) => ({
    id: `tib_${idx + 1}`,
    no: idx + 1,
    teks: String(teks),
  }));
}

export async function saveTataTertibList(items: { no: number; teks: string }[]): Promise<void> {
  const clean = items.map((i) => i.teks.trim()).filter(Boolean);
  writeJsonStorage(LS_TATA_TERTIB, clean);
}

// ===== Student Exam Flow =====

interface GasVerifyStudentResponse {
  ok: boolean;
  msg?: string;
  nama?: string;
  kelas?: string;
  token?: string;
  paket?: {
    nama?: string;
    nama_paket_soal?: string;
    mapel?: string;
    mata_pelajaran?: string;
    durasi?: number;
    durasi_menit?: number;
    waktu_mulai?: string;
    waktu_berakhir?: string;
    tampilkan_nilai?: boolean;
    acak_soal?: boolean;
  };
  tib?: string[];
  resume?: boolean;
  progres?: {
    jawaban?: Record<string, unknown>;
    sisa?: number;
    viol?: number;
    t?: number;
  } | null;
}

export async function verifyStudentLogin(
  namaInput: string,
  tokenInput: string
): Promise<{ ok: true; session: ActiveStudentSession } | { ok: false; msg: string }> {
  const cleanNama = namaInput.trim();
  const token = tokenInput.trim().toUpperCase();

  if (!cleanNama) return { ok: false, msg: 'Masukkan nama lengkap Anda.' };
  if (!token) return { ok: false, msg: 'Masukkan token paket soal.' };

  const res = await callGas<GasVerifyStudentResponse>('verifyStudentLogin', [cleanNama, token]);
  if (!res || !res.ok || !res.paket) {
    return { ok: false, msg: res?.msg || 'Nama atau token tidak valid.' };
  }

  const namaPaket = String(res.paket.nama || res.paket.nama_paket_soal || '');
  const paketId = makePaketId(namaPaket);
  const prefs = getPaketPrefsMap()[paketId] || {};

  const paket: PaketUjian = {
    id: paketId,
    nama_paket_soal: namaPaket,
    mata_pelajaran: String(res.paket.mapel || res.paket.mata_pelajaran || ''),
    durasi_menit: Number(res.paket.durasi || res.paket.durasi_menit) || 60,
    status: 'Aktif',
    token_paket_soal: String(res.token || token),
    waktu_mulai: String(res.paket.waktu_mulai || ''),
    waktu_berakhir: String(res.paket.waktu_berakhir || ''),
    tampilkan_nilai:
      res.paket.tampilkan_nilai !== undefined
        ? Boolean(res.paket.tampilkan_nilai)
        : prefs.tampilkan_nilai !== false,
    acak_soal:
      res.paket.acak_soal !== undefined
        ? Boolean(res.paket.acak_soal)
        : prefs.acak_soal === true,
  };

  const namaSiswa = String(res.nama || cleanNama);
  const siswaKey = slugifyName(namaSiswa);
  const siswa: Siswa = {
    id: siswaKey,
    nama_siswa: namaSiswa,
    nama_key: siswaKey,
    kelas: String(res.kelas || '-'),
    status_ujian: res.resume ? `Sedang Ujian: ${namaPaket}` : 'Belum',
    status_akun: 'Aktif',
  };

  if (Array.isArray(res.tib) && res.tib.length > 0) {
    writeJsonStorage(
      LS_TATA_TERTIB,
      res.tib.map((t) => String(t).trim()).filter(Boolean)
    );
  }
  const tibLines =
    Array.isArray(res.tib) && res.tib.length > 0 ? res.tib : DEFAULT_TATA_TERTIB;
  const tib: TataTertib[] = tibLines.map((teks, idx) => ({
    id: `tib_${idx + 1}`,
    no: idx + 1,
    teks: String(teks),
  }));

  let progres: ProgresUjian | null = null;
  if (res.resume && res.progres) {
    const rawAns = { ...(res.progres.jawaban || {}) };
    const ragu =
      rawAns.__ragu && typeof rawAns.__ragu === 'object'
        ? (rawAns.__ragu as Record<string, boolean>)
        : {};
    const currentIndex = typeof rawAns.__i === 'number' ? rawAns.__i : 0;
    delete rawAns.__ragu;
    delete rawAns.__i;

    const cleanAns: Record<string, AnswerValue> = {};
    Object.entries(rawAns).forEach(([k, v]) => {
      if (typeof v === 'string' || Array.isArray(v)) {
        cleanAns[k] = v as AnswerValue;
      }
    });

    progres = {
      id: `${paketId}__${siswaKey}`,
      paket_id: paketId,
      paket_nama: namaPaket,
      siswa_id: siswaKey,
      nama_siswa: namaSiswa,
      kelas: siswa.kelas,
      jawaban: cleanAns,
      ragu,
      current_index: currentIndex,
      sisa_detik: Number(res.progres.sisa) || paket.durasi_menit * 60,
      pelanggaran: Number(res.progres.viol) || 0,
    };
  }

  return {
    ok: true,
    session: {
      siswa,
      paket,
      tib,
      resume: Boolean(res.resume),
      progres,
    },
  };
}

export async function markStudentExamStarted(_paket: PaketUjian, _siswa: Siswa): Promise<void> {
  // Handled by verifyStudentLogin & saveProgress on Apps Script
}

export async function getQuestionsForStudent(
  paket: PaketUjian,
  siswaKey: string
): Promise<SoalPublik[]> {
  const cacheKey = `${LS_SOAL_CACHE_PREFIX}${paket.token_paket_soal}`;
  const cached = readJsonStorage<{ ts: number; list: SoalPublik[] } | null>(cacheKey, null);

  let baseList: SoalPublik[] | null = null;
  if (cached && Array.isArray(cached.list) && cached.list.length > 0 && Date.now() - cached.ts < SOAL_CACHE_TTL_MS) {
    baseList = cached.list;
  }

  if (!baseList) {
    try {
      const raw = await withSharedCache(`student_qs_${paket.token_paket_soal}`, 15000, () =>
        callGas<string | Record<string, unknown>[]>('getQuestionsForStudent', [
          paket.token_paket_soal,
        ])
      );
      const arr =
        typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>[]) : raw || [];

      baseList = arr
        .map((x, idx) => {
          const idSoal = String(x.ID_Soal || `S_${idx + 1}`);
          return {
            id: idSoal,
            id_soal: idSoal,
            paket_id: paket.id,
            paket: String(x.Paket || paket.nama_paket_soal),
            nomor_soal: Number(x.Nomor_Soal) || idx + 1,
            jenis_soal: String(x.Jenis_Soal || 'PG'),
            teks_stimulus: String(x.Teks_Stimulus || ''),
            gambar_stimulus_url: String(x.Gambar_Stimulus_URL || ''),
            teks_soal: String(x.Teks_Soal || ''),
            gambar_soal_url: String(x.Gambar_Soal_URL || ''),
            pilihan_a: String(x.Pilihan_A || ''),
            pilihan_b: String(x.Pilihan_B || ''),
            pilihan_c: String(x.Pilihan_C || ''),
            pilihan_d: String(x.Pilihan_D || ''),
            bobot: Number(x.Bobot) || 1,
            aktif: true,
          };
        })
        .sort((a, b) => a.nomor_soal - b.nomor_soal);

      if (baseList.length > 0) {
        writeJsonStorage(cacheKey, { ts: Date.now(), list: baseList });
      }
    } catch (err) {
      if (cached && Array.isArray(cached.list) && cached.list.length > 0) {
        baseList = cached.list;
      } else {
        throw err;
      }
    }
  }

  if (!baseList || baseList.length === 0) {
    throw new Error(`Belum ada soal aktif untuk paket "${paket.nama_paket_soal}".`);
  }

  return paket.acak_soal ? seededShuffle(baseList, `${paket.id}_${siswaKey}`) : baseList;
}

export async function saveStudentProgress(params: {
  paket: PaketUjian;
  siswa: Siswa;
  jawaban: Record<string, AnswerValue>;
  ragu: Record<string, boolean>;
  currentIndex: number;
  sisaDetik: number;
  pelanggaran: number;
}): Promise<boolean> {
  const { paket, siswa, jawaban, ragu, currentIndex, sisaDetik, pelanggaran } = params;
  const payloadAns: Record<string, unknown> = {
    ...jawaban,
    __ragu: ragu,
    __i: Math.max(0, Math.floor(currentIndex)),
  };
  const ok = await callGas<boolean>('saveProgress', [
    siswa.nama_siswa,
    paket.token_paket_soal,
    payloadAns,
    Math.max(0, Math.floor(sisaDetik)),
    Math.max(0, Math.floor(pelanggaran)),
  ]);
  return ok !== false;
}

export async function logStudentViolation(params: {
  siswa: Siswa;
  paket: PaketUjian;
  jenis: string;
}): Promise<void> {
  try {
    await callGas('logViolation', [params.siswa.nama_siswa, params.jenis]);
  } catch (err) {
    console.warn('Gagal mencatat log pelanggaran:', err);
  }
}

interface GasSubmitResponse {
  nilai?: number;
  benar?: number;
  salah?: number;
  rev?: Array<{
    no: number;
    soal?: string;
    jawab?: string;
    kunci?: string;
    skor?: number;
    maks?: number;
    benar?: boolean;
    pembahasan?: string;
  }>;
}

export async function submitStudentExam(params: {
  paket: PaketUjian;
  siswa: Siswa;
  questions: SoalPublik[];
  jawaban: Record<string, AnswerValue>;
  pelanggaran: number;
  onRetry?: (attempt: number, maxTry: number) => void;
}): Promise<ExamSubmitResult> {
  const { paket, siswa, questions, jawaban, pelanggaran, onRetry } = params;
  const res = await callGas<GasSubmitResponse>(
    'submitStudentExam',
    [
      siswa.nama_siswa,
      paket.token_paket_soal,
      jawaban,
      Math.max(0, Math.floor(pelanggaran)),
    ],
    undefined,
    { onRetry }
  );

  const byNo = new Map(questions.map((q) => [q.nomor_soal, q]));
  const rawRev = Array.isArray(res?.rev) ? res.rev : [];

  return {
    nilai: Number(res?.nilai) || 0,
    benar: Number(res?.benar) || 0,
    salah: Number(res?.salah) || 0,
    tampilkan_nilai: paket.tampilkan_nilai,
    rev: paket.tampilkan_nilai
      ? rawRev.map((r) => {
          const matched = byNo.get(Number(r.no));
          return {
            id_soal: matched?.id_soal || `rev_${r.no}`,
            no: Number(r.no) || 0,
            soal: String(r.soal || matched?.teks_soal || ''),
            jawab: String(r.jawab || '-'),
            kunci: String(r.kunci || ''),
            skor: Number(r.skor) || 0,
            maks: Number(r.maks) || matched?.bobot || 1,
            benar: Boolean(r.benar),
            pembahasan: String(r.pembahasan || ''),
          };
        })
      : [],
  };
}

// ===== Admin Authentication (Google Apps Script Admin Sheet) =====

export async function getAdminAuthStatus(): Promise<{ initialized: boolean; error?: string }> {
  return { initialized: true };
}

export async function setupInitialAdminPassword(password: string): Promise<void> {
  await loginAdminWithPassword(password);
}

export async function loginAdminWithPassword(password: string): Promise<void> {
  const cleanPw = password.trim();
  if (!cleanPw) {
    throw new Error('Masukkan password admin.');
  }
  const ok = await callGas<boolean>('verifyAdminLogin', [cleanPw]);
  if (!ok) {
    throw new Error('Password admin salah.');
  }
  setAdminSessionPw(cleanPw);
}

export async function checkIsCurrentAdminSession(): Promise<boolean> {
  const pw = getAdminSessionPw();
  if (!pw) return false;
  try {
    const ok = await callGas<boolean>('verifyAdminLogin', [pw]);
    if (!ok) {
      clearAdminSessionPw();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function logoutAdminSession(): Promise<void> {
  clearAdminSessionPw();
}

export async function listAdminPassLabels(): Promise<AdminPassLabel[]> {
  const rows = await callGasAdmin<Array<{ _row?: number; Password?: unknown }>>('list', {
    k: 'adm',
  });
  return (rows || []).map((r, idx) => ({
    id: String(r._row || idx + 1),
    label: `Password Admin #${idx + 1}`,
    verifier: String(r.Password || ''),
    created_at: null,
  }));
}

export async function addAdminPasscode(_label: string, password: string): Promise<void> {
  const cleanPw = password.trim();
  if (cleanPw.length < 3) {
    throw new Error('Password minimal 3 karakter.');
  }
  await callGasAdmin('save', {
    k: 'adm',
    o: { Password: cleanPw },
  });
}

export async function deleteAdminPasscode(passId: string, _verifier: string): Promise<void> {
  const row = Number(passId);
  if (!Number.isFinite(row) || row < 2) {
    throw new Error('Baris password admin tidak valid.');
  }
  await callGasAdmin('del', { k: 'adm', row });
}

// ===== Paket Ujian CRUD =====

export async function listPaket(): Promise<PaketUjian[]> {
  return withSharedCache('list_paket', 30000, async () => {
    const rows = await callGasAdmin<Array<Record<string, unknown>>>('list', { k: 'paket' });
    const prefsMap = getPaketPrefsMap();
    paketRowById.clear();
    paketNameById.clear();

    const seenIds = new Set<string>();
    return (rows || []).map((x, idx) => {
      const nama = String(x.Nama_Paket_Soal || '').trim();
      let id = makePaketId(nama || `paket_${idx + 1}`);
      if (seenIds.has(id)) id = `${id}_${x._row || idx + 1}`;
      seenIds.add(id);

      if (typeof x._row === 'number') paketRowById.set(id, x._row);
      paketNameById.set(id, nama);

      const prefs = prefsMap[id] || {};
      return {
        id,
        nama_paket_soal: nama,
        mata_pelajaran: String(x.Mata_Pelajaran || ''),
        durasi_menit: Number(x['Durasi_(Menit)']) || 60,
        status: x.Status === 'Aktif' ? 'Aktif' : 'Nonaktif',
        token_paket_soal: String(x.Token_Paket_Soal || ''),
        waktu_mulai: String(x.Waktu_Mulai || ''),
        waktu_berakhir: String(x.Waktu_Berakhir || ''),
        tampilkan_nilai: prefs.tampilkan_nilai !== false,
        acak_soal: prefs.acak_soal === true,
      };
    });
  });
}

export async function savePaket(
  paket: Omit<PaketUjian, 'id'> & { id?: string },
  _oldToken?: string
): Promise<string> {
  const nama = paket.nama_paket_soal.trim();
  const token = (paket.token_paket_soal || generateRandomToken())
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');

  let row = paket.id ? paketRowById.get(paket.id) : undefined;
  if (paket.id && row === undefined) {
    await listPaket();
    row = paketRowById.get(paket.id);
  }

  const o = {
    Nama_Paket_Soal: nama,
    Mata_Pelajaran: paket.mata_pelajaran.trim(),
    'Durasi_(Menit)': Math.max(1, Math.min(600, Math.round(Number(paket.durasi_menit) || 60))),
    Status: paket.status === 'Aktif' ? 'Aktif' : 'Nonaktif',
    Token_Paket_Soal: token,
    Waktu_Mulai: paket.waktu_mulai || '',
    Waktu_Berakhir: paket.waktu_berakhir || '',
  };

  await callGasAdmin('save', row ? { k: 'paket', row, o } : { k: 'paket', o });
  invalidateAdminCaches(['list_paket']);

  const newId = makePaketId(nama);
  savePaketPrefs(newId, {
    tampilkan_nilai: paket.tampilkan_nilai !== false,
    acak_soal: paket.acak_soal === true,
  });

  return newId;
}

export async function deletePaket(paket: PaketUjian): Promise<void> {
  let row = paketRowById.get(paket.id);
  if (row === undefined) {
    await listPaket();
    row = paketRowById.get(paket.id);
  }
  if (row === undefined) {
    throw new Error(`Paket "${paket.nama_paket_soal}" tidak ditemukan di Spreadsheet.`);
  }
  // Hapus seluruh soal milik paket terlebih dahulu
  await callGasAdmin('delSoal', { v: paket.nama_paket_soal, all: 1 }).catch(() => undefined);
  await callGasAdmin('del', { k: 'paket', row });
  invalidateAdminCaches(['list_paket', 'list_soal']);
}

export async function copyPaketWithSoal(
  src: PaketUjian,
  _allPakets: PaketUjian[]
): Promise<PaketUjian> {
  const res = await callGasAdmin<{ nama?: string; soal?: number }>('copyPaket', {
    v: src.nama_paket_soal,
  });
  invalidateAdminCaches(['list_paket', 'list_soal']);
  const pakets = await listPaket();
  const copied = res?.nama
    ? pakets.find((p) => p.nama_paket_soal === res.nama)
    : undefined;
  if (copied) {
    savePaketPrefs(copied.id, {
      tampilkan_nilai: src.tampilkan_nilai,
      acak_soal: src.acak_soal,
    });
    return {
      ...copied,
      tampilkan_nilai: src.tampilkan_nilai,
      acak_soal: src.acak_soal,
    };
  }
  const fallbackName = res?.nama || `${src.nama_paket_soal} (Salinan)`;
  return {
    id: makePaketId(fallbackName),
    nama_paket_soal: fallbackName,
    mata_pelajaran: src.mata_pelajaran,
    durasi_menit: src.durasi_menit,
    status: 'Nonaktif',
    token_paket_soal: generateRandomToken(),
    waktu_mulai: src.waktu_mulai,
    waktu_berakhir: src.waktu_berakhir,
    tampilkan_nilai: src.tampilkan_nilai,
    acak_soal: src.acak_soal,
  };
}

// ===== Bank Soal CRUD & TKA =====

export async function listSoalLengkap(paketId?: string): Promise<SoalLengkap[]> {
  if (paketNameById.size === 0) {
    await listPaket();
  }
  const nameToPaketId = new Map<string, string>();
  paketNameById.forEach((nama, id) => {
    nameToPaketId.set(nama.trim().toLowerCase(), id);
  });

  const mapped = await withSharedCache('list_soal', 30000, async () => {
    const rows = await callGasAdmin<Array<Record<string, unknown>>>('list', { k: 'soal' });
    const tkaMap = getTkaOverridesMap();
    soalRowById.clear();
    soalRawById.clear();

    return (rows || []).map((x, idx) => {
      const idSoal = String(x.ID_Soal || `S_${x._row || idx + 1}`);
      const paketNama = String(x.Paket || '').trim();
      const resolvedPaketId =
        nameToPaketId.get(paketNama.toLowerCase()) || makePaketId(paketNama || 'umum');

      if (typeof x._row === 'number') soalRowById.set(idSoal, x._row);
      soalRawById.set(idSoal, x);

      const tka = tkaMap[idSoal];
      return {
        id: idSoal,
        id_soal: idSoal,
        paket_id: resolvedPaketId,
        paket: paketNama,
        nomor_soal: Number(x.Nomor_Soal) || idx + 1,
        jenis_soal: String(x.Jenis_Soal || 'PG'),
        teks_stimulus: String(x.Teks_Stimulus || ''),
        gambar_stimulus_url: String(x.Gambar_Stimulus_URL || ''),
        teks_soal: String(x.Teks_Soal || ''),
        gambar_soal_url: String(x.Gambar_Soal_URL || ''),
        pilihan_a: String(x.Pilihan_A || ''),
        pilihan_b: String(x.Pilihan_B || ''),
        pilihan_c: String(x.Pilihan_C || ''),
        pilihan_d: String(x.Pilihan_D || ''),
        bobot: Number(x.Bobot) || 1,
        aktif: true,
        tka_mapel: tka?.tka_mapel || '',
        tka_elemen: tka?.tka_elemen || '',
        tka_subelemen: tka?.tka_subelemen || '',
        tka_indikator: tka?.tka_indikator || '',
        kunci_jawaban: String(x.Kunci_Jawaban || ''),
        pembahasan: String(x.Pembahasan || ''),
        rilis_kunci: true,
      } satisfies SoalLengkap;
    });
  });

  const filtered = paketId ? mapped.filter((q) => q.paket_id === paketId) : mapped;
  return [...filtered].sort((a, b) => a.nomor_soal - b.nomor_soal);
}

async function normalizeSoalImages(soal: Partial<SoalLengkap>): Promise<{
  gambar_stimulus_url: string;
  gambar_soal_url: string;
  pilihan_a: string;
  pilihan_b: string;
  pilihan_c: string;
  pilihan_d: string;
}> {
  const [gStim, gSoal, pA, pB, pC, pD] = await Promise.all([
    uploadDataUrlFieldToGas(soal.gambar_stimulus_url || '', 'stim'),
    uploadDataUrlFieldToGas(soal.gambar_soal_url || '', 'soal'),
    uploadDataUrlFieldToGas(soal.pilihan_a || '', 'opsiA'),
    uploadDataUrlFieldToGas(soal.pilihan_b || '', 'opsiB'),
    uploadDataUrlFieldToGas(soal.pilihan_c || '', 'opsiC'),
    uploadDataUrlFieldToGas(soal.pilihan_d || '', 'opsiD'),
  ]);
  return {
    gambar_stimulus_url: gStim,
    gambar_soal_url: gSoal,
    pilihan_a: pA,
    pilihan_b: pB,
    pilihan_c: pC,
    pilihan_d: pD,
  };
}

export async function saveSoal(
  soal: Omit<SoalLengkap, 'id'> & { id?: string },
  paket: PaketUjian
): Promise<void> {
  const idSoal = (soal.id_soal || soal.id || `S${Date.now()}`).trim();
  const imgs = await normalizeSoalImages(soal);

  let row = soalRowById.get(idSoal);
  if (soal.id && row === undefined) {
    await listSoalLengkap();
    row = soalRowById.get(idSoal);
  }

  const o = {
    ID_Soal: idSoal,
    Paket: paket.nama_paket_soal,
    Nomor_Soal: Number(soal.nomor_soal) || 1,
    Jenis_Soal: soal.jenis_soal || 'PG',
    Teks_Stimulus: soal.teks_stimulus || '',
    Gambar_Stimulus_URL: imgs.gambar_stimulus_url,
    Teks_Soal: soal.teks_soal || '',
    Gambar_Soal_URL: imgs.gambar_soal_url,
    Pilihan_A: imgs.pilihan_a,
    Pilihan_B: imgs.pilihan_b,
    Pilihan_C: imgs.pilihan_c,
    Pilihan_D: imgs.pilihan_d,
    Kunci_Jawaban: soal.kunci_jawaban || '',
    Pembahasan: soal.pembahasan || '',
    Bobot: Number(soal.bobot) || 1,
  };

  await callGasAdmin('save', row ? { k: 'soal', row, o } : { k: 'soal', o });
  invalidateAdminCaches(['list_soal']);

  if (soal.tka_elemen || soal.tka_subelemen || soal.tka_indikator) {
    const tkaAll = getTkaOverridesMap();
    tkaAll[idSoal] = {
      tka_mapel: soal.tka_mapel || '',
      tka_elemen: soal.tka_elemen || '',
      tka_subelemen: soal.tka_subelemen || '',
      tka_indikator: soal.tka_indikator || '',
    };
    writeJsonStorage(LS_TKA_OVERRIDES, tkaAll);
  }
}

export async function updateSoalTkaBatch(
  updates: {
    id: string;
    tka_mapel: string;
    tka_elemen: string;
    tka_subelemen: string;
    tka_indikator: string;
  }[]
): Promise<number> {
  if (updates.length === 0) return 0;
  const all = getTkaOverridesMap();
  updates.forEach((u) => {
    all[u.id] = {
      tka_mapel: u.tka_mapel.slice(0, 80),
      tka_elemen: u.tka_elemen.slice(0, 160),
      tka_subelemen: u.tka_subelemen.slice(0, 200),
      tka_indikator: u.tka_indikator.slice(0, 300),
    };
  });
  writeJsonStorage(LS_TKA_OVERRIDES, all);
  return updates.length;
}

export async function importSoalBatch(
  items: Partial<SoalLengkap>[],
  paket: PaketUjian
): Promise<number> {
  const chunkSize = 25;
  let total = 0;
  const baseTs = Date.now();
  const tkaAll = getTkaOverridesMap();
  let tkaChanged = false;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const gasRows: Record<string, unknown>[] = [];

    for (let idx = 0; idx < chunk.length; idx++) {
      const item = chunk[idx];
      const globalIdx = i + idx;
      const idSoal = (item.id_soal || `S${baseTs}_${globalIdx}`).trim();
      const imgs = await normalizeSoalImages(item);

      if (item.tka_elemen || item.tka_subelemen || item.tka_indikator) {
        tkaAll[idSoal] = {
          tka_mapel: item.tka_mapel || '',
          tka_elemen: item.tka_elemen || '',
          tka_subelemen: item.tka_subelemen || '',
          tka_indikator: item.tka_indikator || '',
        };
        tkaChanged = true;
      }

      gasRows.push({
        ID_Soal: idSoal,
        Paket: paket.nama_paket_soal,
        Nomor_Soal: Number(item.nomor_soal) || globalIdx + 1,
        Jenis_Soal: item.jenis_soal || 'PG',
        Teks_Stimulus: item.teks_stimulus || '',
        Gambar_Stimulus_URL: imgs.gambar_stimulus_url,
        Teks_Soal: item.teks_soal || '',
        Gambar_Soal_URL: imgs.gambar_soal_url,
        Pilihan_A: imgs.pilihan_a,
        Pilihan_B: imgs.pilihan_b,
        Pilihan_C: imgs.pilihan_c,
        Pilihan_D: imgs.pilihan_d,
        Kunci_Jawaban: item.kunci_jawaban || '',
        Pembahasan: item.pembahasan || '',
        Bobot: Number(item.bobot) || 1,
      });
    }

    await callGasAdmin('importSoal', { list: gasRows });
    total += gasRows.length;
  }

  if (tkaChanged) {
    writeJsonStorage(LS_TKA_OVERRIDES, tkaAll);
  }
  invalidateAdminCaches(['list_soal']);
  return total;
}

export async function deleteSoalByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const missing = ids.some((id) => !soalRawById.has(id));
  if (missing) {
    await listSoalLengkap();
  }

  const byPaket = new Map<string, string[]>();
  ids.forEach((id) => {
    const raw = soalRawById.get(id);
    const pkt = String(raw?.Paket || '');
    if (!pkt) return;
    const arr = byPaket.get(pkt) || [];
    arr.push(id);
    byPaket.set(pkt, arr);
  });

  for (const [paketNama, groupIds] of byPaket.entries()) {
    await callGasAdmin('delSoal', { v: paketNama, ids: groupIds });
  }
  invalidateAdminCaches(['list_soal']);
}

// ===== Siswa CRUD =====

export async function listSiswa(): Promise<Siswa[]> {
  return withSharedCache('list_siswa', 25000, async () => {
    const rows = await callGasAdmin<Array<Record<string, unknown>>>('list', { k: 'siswa' });
    siswaRowById.clear();
    siswaNameById.clear();
    const seen = new Set<string>();

    return (rows || [])
      .map((x, idx) => {
        const nama = String(x.Nama_Siswa || '').trim();
        let id = slugifyName(nama || `siswa_${idx + 1}`);
        if (seen.has(id)) id = `${id}_${x._row || idx + 1}`;
        seen.add(id);

        if (typeof x._row === 'number') siswaRowById.set(id, x._row);
        siswaNameById.set(id, nama);

        return {
          id,
          nama_siswa: nama,
          nama_key: slugifyName(nama),
          kelas: String(x.Kelas || ''),
          status_ujian: String(x.Status_Ujian || 'Belum'),
          status_akun: (x.Status_Akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif') as
            | 'Aktif'
            | 'Nonaktif',
        };
      })
      .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama_siswa.localeCompare(b.nama_siswa));
  });
}

export async function saveSiswa(siswa: {
  id?: string;
  nama_siswa: string;
  kelas: string;
  status_ujian?: string;
  status_akun: 'Aktif' | 'Nonaktif';
}): Promise<void> {
  let row = siswa.id ? siswaRowById.get(siswa.id) : undefined;
  if (siswa.id && row === undefined) {
    await listSiswa();
    row = siswaRowById.get(siswa.id);
  }
  const o: Record<string, unknown> = {
    Nama_Siswa: siswa.nama_siswa.trim(),
    Kelas: siswa.kelas.trim(),
    Status_Akun: siswa.status_akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
  };
  if (siswa.status_ujian !== undefined) {
    o.Status_Ujian = siswa.status_ujian;
  } else if (!row) {
    o.Status_Ujian = 'Belum';
  }
  await callGasAdmin('save', row ? { k: 'siswa', row, o } : { k: 'siswa', o });
  invalidateAdminCaches(['list_siswa']);
}

export async function importSiswaBatch(
  rows: { nama_siswa: string; kelas: string; status_akun?: string }[],
  existingSiswa: Siswa[]
): Promise<{ added: number; skipped: number }> {
  const have = new Set(existingSiswa.map((s) => s.nama_key));
  const toAdd: Array<{ Nama_Siswa: string; Kelas: string; Status_Akun: string }> = [];

  rows.forEach((r) => {
    const nama = String(r.nama_siswa || '').trim();
    const key = slugifyName(nama);
    if (!nama || have.has(key)) return;
    have.add(key);
    toAdd.push({
      Nama_Siswa: nama,
      Kelas: String(r.kelas || '-').trim() || '-',
      Status_Akun: r.status_akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
    });
  });

  const chunkSize = 100;
  for (let i = 0; i < toAdd.length; i += chunkSize) {
    await callGasAdmin('import', { list: toAdd.slice(i, i + chunkSize) });
  }
  if (toAdd.length > 0) invalidateAdminCaches(['list_siswa']);

  return { added: toAdd.length, skipped: rows.length - toAdd.length };
}

export async function deleteSiswa(id: string): Promise<void> {
  let row = siswaRowById.get(id);
  if (row === undefined) {
    await listSiswa();
    row = siswaRowById.get(id);
  }
  if (row === undefined) {
    throw new Error('Data siswa tidak ditemukan di Spreadsheet.');
  }
  await callGasAdmin('del', { k: 'siswa', row });
  invalidateAdminCaches(['list_siswa']);
}

// ===== Hasil & Pelanggaran =====

export async function listHasil(paketId?: string): Promise<HasilUjian[]> {
  if (paketNameById.size === 0) {
    await listPaket();
  }
  const nameToPaketId = new Map<string, string>();
  paketNameById.forEach((nama, id) => {
    nameToPaketId.set(nama.trim().toLowerCase(), id);
  });

  const mapped = await withSharedCache('list_hasil', 20000, async () => {
    const rows = await callGasAdmin<Array<Record<string, unknown>>>('list', { k: 'hasil' });
    const deduped = new Map<string, HasilUjian>();
    (rows || []).forEach((x, idx) => {
      const paketNama = String(x.Paket || '').trim();
      const resolvedPaketId =
        nameToPaketId.get(paketNama.toLowerCase()) || makePaketId(paketNama || 'umum');
      const namaSiswa = String(x.Nama_Siswa || '').trim();
      const siswaId = slugifyName(namaSiswa);
      const key = `${siswaId}|${paketNama.toLowerCase()}`;
      deduped.set(key, {
        id: String(x._row || `hasil_${idx + 1}`),
        paket_id: resolvedPaketId,
        paket: paketNama,
        siswa_id: siswaId,
        nama_siswa: namaSiswa,
        kelas: String(x.Kelas || ''),
        nilai_akhir: Number(x.Nilai_Akhir) || 0,
        total_benar: Number(x.Total_Benar) || 0,
        total_salah: Number(x.Total_Salah) || 0,
        pelanggaran_tab: Number(x.Pelanggaran_Tab) || 0,
        detail_jawaban: parseDetailJawaban(x.Detail_Jawaban_JSON),
        status_penilaian: 'dinilai',
        created_at: parseLegacyDateOrNull(x.Timestamp),
      });
    });

    return Array.from(deduped.values()).reverse();
  });

  return paketId ? mapped.filter((h) => h.paket_id === paketId) : mapped;
}

export async function listPelanggaran(): Promise<LogPelanggaran[]> {
  if (paketNameById.size === 0) {
    await listPaket();
  }
  const nameToPaketId = new Map<string, string>();
  paketNameById.forEach((nama, id) => {
    nameToPaketId.set(nama.trim().toLowerCase(), id);
  });

  const rows = await callGasAdmin<Array<Record<string, unknown>>>('list', { k: 'log' });
  logMetaById.clear();

  return (rows || [])
    .map((x, idx) => {
      const rowNum = Number(x._row) || idx + 2;
      const id = `log_${rowNum}`;
      const nama = String(x.Nama_Siswa || '').trim();
      const statusUjian = String(x.Status_Ujian || '').trim();
      const paketNama = statusUjian.toLowerCase().startsWith('sedang ujian:')
        ? statusUjian.slice('sedang ujian:'.length).trim()
        : statusUjian || '-';
      const resolvedPaketId =
        paketNama && paketNama !== '-'
          ? nameToPaketId.get(paketNama.toLowerCase()) || makePaketId(paketNama)
          : '';

      logMetaById.set(id, { row: rowNum, nama, raw: x });

      return {
        id,
        siswa_id: slugifyName(nama),
        nama_siswa: nama,
        kelas: String(x.Kelas || '-'),
        paket_id: resolvedPaketId,
        paket_nama: paketNama,
        jenis_pelanggaran: String(x.Jenis_Pelanggaran || 'Pelanggaran Ujian'),
        status_ujian: statusUjian,
        created_at: parseLegacyDateOrNull(x.Timestamp || x.Waktu_Kejadian),
      };
    })
    .sort((a, b) => (b.created_at?.getTime() || 0) - (a.created_at?.getTime() || 0));
}

export async function deletePelanggaranByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const missing = ids.some((id) => !logMetaById.has(id));
  if (missing) {
    await listPelanggaran();
  }
  const rows = ids
    .map((id) => logMetaById.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({ row: m.row, nama: m.nama }));

  if (rows.length > 0) {
    await callGasAdmin('delLog', { rows });
  }
}

export async function updatePelanggaran(
  logId: string,
  payload: {
    nama_siswa: string;
    kelas: string;
    paket_id: string;
    paket_nama: string;
    jenis_pelanggaran: string;
    status_ujian: string;
  }
): Promise<void> {
  const nama = payload.nama_siswa.trim();
  if (!nama) throw new Error('Nama siswa wajib diisi.');
  let meta = logMetaById.get(logId);
  if (!meta) {
    await listPelanggaran();
    meta = logMetaById.get(logId);
  }
  if (!meta) throw new Error('Data log pelanggaran tidak ditemukan.');

  const statusText =
    payload.status_ujian.trim() ||
    (payload.paket_nama && payload.paket_nama !== '-'
      ? `Sedang Ujian: ${payload.paket_nama}`
      : '');

  const fallbackNow = new Date().toLocaleString('id-ID');
  const preservedTimestamp = String(meta.raw.Timestamp || fallbackNow);
  const preservedWaktu = String(meta.raw.Waktu_Kejadian || meta.raw.Timestamp || fallbackNow);

  await callGasAdmin('save', {
    k: 'log',
    row: meta.row,
    o: {
      Timestamp: preservedTimestamp,
      Nama_Siswa: nama.slice(0, 120),
      Kelas: (payload.kelas.trim() || '-').slice(0, 40),
      Jenis_Pelanggaran: (payload.jenis_pelanggaran.trim() || 'Pelanggaran Ujian').slice(0, 160),
      Waktu_Kejadian: preservedWaktu,
      Status_Ujian: statusText.slice(0, 200),
    },
  });
}

export async function resetPelanggaran(params: {
  siswaId?: string;
  namaSiswa?: string;
  paketId?: string;
  paketNama?: string;
}): Promise<{ deletedLogs: number; resetHasil: number }> {
  const { siswaId, namaSiswa, paketId, paketNama } = params;
  const normNama = namaSiswa ? namaSiswa.trim().toLowerCase() : '';
  const targetSlug = siswaId || (namaSiswa ? slugifyName(namaSiswa) : '');
  const hasPaketFilter = Boolean(paketId && paketId !== '__ALL__');
  const normPaketNama = paketNama ? paketNama.trim().toLowerCase() : '';

  const allLogs = await listPelanggaran();
  const toDelete = allLogs.filter((l) => {
    const matchStudent =
      (!targetSlug && !normNama) ||
      (targetSlug !== '' && l.siswa_id === targetSlug) ||
      (normNama !== '' && l.nama_siswa.trim().toLowerCase() === normNama);

    const matchPaket =
      !hasPaketFilter ||
      l.paket_id === paketId ||
      (normPaketNama !== '' &&
        (l.paket_nama.trim().toLowerCase() === normPaketNama ||
          l.status_ujian.toLowerCase().includes(normPaketNama)));

    return matchStudent && matchPaket;
  });

  if (toDelete.length > 0) {
    await deletePelanggaranByIds(toDelete.map((l) => l.id));
  }

  return { deletedLogs: toDelete.length, resetHasil: 0 };
}

export async function importPelanggaranBatch(
  rawRows: Record<string, unknown>[],
  _paketsInput?: PaketUjian[]
): Promise<{ added: number; skipped: number }> {
  const existing = await listPelanggaran();
  const existingSig = new Set(
    existing.map(
      (l) =>
        `${l.siswa_id}|${l.jenis_pelanggaran.toLowerCase()}|${l.status_ujian.toLowerCase()}|${
          l.created_at ? Math.floor(l.created_at.getTime() / 1000) : 0
        }`
    )
  );

  let added = 0;
  let skipped = 0;

  for (const row of rawRows || []) {
    const nama = String(
      getRowField(row, ['Nama_Siswa', 'Nama Siswa', 'nama_siswa', 'Nama'])
    ).trim();
    if (!nama) {
      skipped++;
      continue;
    }
    const kelas = String(getRowField(row, ['Kelas', 'kelas'])).trim() || '-';
    const jenis =
      String(
        getRowField(row, ['Jenis_Pelanggaran', 'Jenis Pelanggaran', 'jenis_pelanggaran', 'Jenis'])
      ).trim() || 'Pelanggaran Ujian';
    const rawPaket = String(
      getRowField(row, ['Paket', 'Paket_Nama', 'paket_nama', 'paket'])
    ).trim();
    const statusUjian =
      String(getRowField(row, ['Status_Ujian', 'Status Ujian', 'status_ujian'])).trim() ||
      (rawPaket ? `Sedang Ujian: ${rawPaket}` : '');
    const rawTime = getRowField(row, ['Waktu', 'Timestamp', 'Waktu_Kejadian', 'created_at']);
    const dt = parseLegacyDateOrNull(rawTime) || new Date();

    const sig = `${slugifyName(nama)}|${jenis.toLowerCase()}|${statusUjian.toLowerCase()}|${Math.floor(
      dt.getTime() / 1000
    )}`;
    if (existingSig.has(sig)) {
      skipped++;
      continue;
    }
    existingSig.add(sig);

    const formattedTs = dt.toLocaleString('id-ID');
    await callGasAdmin('save', {
      k: 'log',
      o: {
        Timestamp: formattedTs,
        Nama_Siswa: nama,
        Kelas: kelas,
        Jenis_Pelanggaran: jenis,
        Waktu_Kejadian: formattedTs,
        Status_Ujian: statusUjian,
      },
    });
    added++;
  }

  return { added, skipped };
}

// ===== Reset, Force Finish, Rescore & Monitor Polling =====

export async function resetPesertaUjian(
  paket: PaketUjian,
  targetSiswaIds?: string[]
): Promise<number> {
  if (!targetSiswaIds || targetSiswaIds.length === 0) {
    const allSiswa = await listSiswa();
    await callGasAdmin('reset', { type: 'paket', v: paket.nama_paket_soal });
    invalidateAdminCaches(['list_siswa', 'list_hasil', `pantau_${paket.id}`]);
    return allSiswa.length;
  }

  const missing = targetSiswaIds.some((id) => !siswaNameById.has(id));
  if (missing) {
    await listSiswa();
  }
  const names = targetSiswaIds
    .map((id) => siswaNameById.get(id))
    .filter((n): n is string => Boolean(n));

  if (names.length === 0) return 0;
  await callGasAdmin('reset', {
    type: 'pilih',
    v: paket.nama_paket_soal,
    names,
  });
  invalidateAdminCaches(['list_siswa', 'list_hasil', `pantau_${paket.id}`]);
  return names.length;
}

export async function forceFinishSiswa(
  paket: PaketUjian,
  siswa: Siswa,
  _progres?: ProgresUjian,
  _questions?: SoalLengkap[]
): Promise<void> {
  await callGasAdmin('finish', {
    nama: siswa.nama_siswa,
    v: paket.nama_paket_soal,
  });
  invalidateAdminCaches(['list_siswa', 'list_hasil', `pantau_${paket.id}`]);
}

export async function rescoreHasil(
  paket: PaketUjian,
  _questions: SoalLengkap[],
  hasilList: HasilUjian[]
): Promise<number> {
  if (hasilList.length === 1) {
    await callGasAdmin('rescore', {
      v: paket.nama_paket_soal,
      nama: hasilList[0].nama_siswa,
    });
    invalidateAdminCaches(['list_hasil']);
    return 1;
  }
  await callGasAdmin('rescore', { v: paket.nama_paket_soal });
  invalidateAdminCaches(['list_hasil']);
  return hasilList.length;
}

interface GasPantauRow {
  Nama_Siswa?: string;
  Kelas?: string;
  Status?: string;
  Dijawab?: number;
  Terakhir_Aktif?: string;
  Skor_Benar?: number;
  Skor_Salah?: number;
  Nilai?: number;
  Waktu_Selesai?: string;
  Sisa_Detik?: number;
  Online?: boolean;
}

interface GasPantauResponse {
  paket?: string;
  total_soal?: number;
  rows?: GasPantauRow[];
}

export function subscribeMonitorPaket(
  paketId: string,
  callbacks: {
    onProgres: (list: ProgresUjian[]) => void;
    onHasil: (list: HasilUjian[]) => void;
    onSiswa: (list: Siswa[]) => void;
  }
): () => void {
  let stopped = false;
  let polling = false;
  let pollCount = 0;
  let cachedHasil: HasilUjian[] = [];
  let cachedSiswa: Siswa[] = [];
  let timerId: number | null = null;

  const buildProgresFromPantau = (
    paketNama: string,
    rows: GasPantauRow[]
  ): ProgresUjian[] =>
    rows
      .filter((r) => r.Status === 'Sedang Mengerjakan' && r.Nama_Siswa)
      .map((r) => {
        const nama = String(r.Nama_Siswa || '');
        const siswaId = slugifyName(nama);
        return {
          id: `${paketId}__${siswaId}`,
          paket_id: paketId,
          paket_nama: paketNama,
          siswa_id: siswaId,
          nama_siswa: nama,
          kelas: String(r.Kelas || '-'),
          jawaban: {},
          ragu: {},
          current_index: 0,
          sisa_detik: Number(r.Sisa_Detik) || 0,
          pelanggaran: 0,
          updated_at: parseLegacyDateOrNull(r.Terakhir_Aktif),
          precomputed: {
            dijawab: Number(r.Dijawab) || 0,
            benar: Number(r.Skor_Benar) || 0,
            salah: Number(r.Skor_Salah) || 0,
            nilai: Number(r.Nilai) || 0,
            online: Boolean(r.Online),
            lastActiveLabel: r.Terakhir_Aktif ? String(r.Terakhir_Aktif) : '-',
          },
        };
      });

  const poll = async (forceInitial = false) => {
    if (stopped || polling) return;
    if (!forceInitial && document.hidden) return;
    polling = true;

    try {
      if (paketNameById.size === 0) {
        await listPaket();
      }
      const paketNama = paketNameById.get(paketId);

      // Initial mount or every 3rd poll (~60s): use shared-cached listHasil & listSiswa;
      // intermediate polls ONLY fetch lightweight `pantau` to avoid 3x full-sheet reads per admin.
      if (forceInitial || pollCount === 0) {
        const [hasilAll, siswaAll, pantauRes] = await Promise.all([
          listHasil(),
          listSiswa(),
          paketNama
            ? withSharedCache(`pantau_${paketId}`, 12000, () =>
                callGasAdmin<GasPantauResponse>('pantau', { v: paketNama })
              )
            : Promise.resolve({ rows: [] } as GasPantauResponse),
        ]);
        if (stopped) return;
        cachedHasil = hasilAll;
        cachedSiswa = siswaAll;
        callbacks.onHasil(cachedHasil.filter((h) => h.paket_id === paketId));
        callbacks.onSiswa(cachedSiswa);
        callbacks.onProgres(buildProgresFromPantau(paketNama || '', pantauRes?.rows || []));
      } else {
        const pantauRes = paketNama
          ? await withSharedCache(`pantau_${paketId}`, 12000, () =>
              callGasAdmin<GasPantauResponse>('pantau', { v: paketNama })
            )
          : ({ rows: [] } as GasPantauResponse);
        if (stopped) return;

        const rows = pantauRes?.rows || [];
        const knownHasilIds = new Set(
          cachedHasil.filter((h) => h.paket_id === paketId).map((h) => h.siswa_id)
        );
        const hasNewFinished = rows.some(
          (r) => r.Status === 'Selesai' && r.Nama_Siswa && !knownHasilIds.has(slugifyName(r.Nama_Siswa))
        );
        const knownSiswaIds = new Set(cachedSiswa.map((s) => s.id));
        const hasNewSiswa = rows.some(
          (r) => r.Nama_Siswa && !knownSiswaIds.has(slugifyName(r.Nama_Siswa))
        );

        if (hasNewFinished) {
          invalidateAdminCaches(['list_hasil']);
          cachedHasil = await listHasil();
          if (stopped) return;
        } else if (pollCount % 3 === 0 || hasNewSiswa) {
          invalidateAdminCaches(['list_siswa']);
          cachedSiswa = await listSiswa();
          if (stopped) return;
        }

        // Reflect active status from `pantau` on cachedSiswa without re-reading full Siswa sheet
        const pantauStatusById = new Map<string, string>();
        rows.forEach((r) => {
          if (r.Nama_Siswa && r.Status === 'Sedang Mengerjakan' && paketNama) {
            pantauStatusById.set(slugifyName(r.Nama_Siswa), `Sedang Ujian: ${paketNama}`);
          }
        });
        const mergedSiswa = cachedSiswa.map((s) => {
          const liveSt = pantauStatusById.get(s.id);
          return liveSt && s.status_ujian !== liveSt ? { ...s, status_ujian: liveSt } : s;
        });

        callbacks.onHasil(cachedHasil.filter((h) => h.paket_id === paketId));
        callbacks.onSiswa(mergedSiswa);
        callbacks.onProgres(buildProgresFromPantau(paketNama || '', rows));
      }

      pollCount++;
    } catch (err) {
      console.warn('Gagal polling monitor ujian:', err);
    } finally {
      polling = false;
    }
  };

  const scheduleNext = () => {
    if (stopped) return;
    // 20s + 0-3s random jitter so 3 concurrent admins don't poll at the exact same instant
    const delayMs = 20000 + Math.floor(Math.random() * 3000);
    timerId = window.setTimeout(() => {
      void poll(false).finally(scheduleNext);
    }, delayMs);
  };

  const onVisChange = () => {
    if (!document.hidden && !stopped) {
      void poll(false);
    }
  };
  document.addEventListener('visibilitychange', onVisChange);

  void poll(true).finally(scheduleNext);

  return () => {
    stopped = true;
    if (timerId !== null) window.clearTimeout(timerId);
    document.removeEventListener('visibilitychange', onVisChange);
  };
}

export function subscribeMonitorAll(callbacks: {
  onProgres: (list: ProgresUjian[]) => void;
  onHasil: (list: HasilUjian[]) => void;
  onSiswa: (list: Siswa[]) => void;
}): () => void {
  let stopped = false;

  const poll = async () => {
    try {
      const [hasilAll, siswaAll] = await Promise.all([listHasil(), listSiswa()]);
      if (stopped) return;
      callbacks.onHasil(hasilAll);
      callbacks.onSiswa(siswaAll);
      callbacks.onProgres([]);
    } catch (err) {
      console.warn('Gagal polling monitor:', err);
    }
  };

  void poll();
  const intervalId = window.setInterval(() => {
    void poll();
  }, 15000);

  return () => {
    stopped = true;
    window.clearInterval(intervalId);
  };
}

// ===== Seed Sample Data =====

export async function seedSampleDatabase(): Promise<void> {
  await savePengaturan(DEFAULT_PENGATURAN);
  await saveTataTertibList(
    DEFAULT_TATA_TERTIB.map((teks, idx) => ({ no: idx + 1, teks }))
  );

  const samplePakets: Array<Omit<PaketUjian, 'id'>> = [
    {
      nama_paket_soal: 'Matematika Kelas 6',
      mata_pelajaran: 'Matematika',
      durasi_menit: 60,
      status: 'Aktif',
      token_paket_soal: 'MTK123',
      waktu_mulai: '2026-01-01 00:00:00',
      waktu_berakhir: '2030-12-31 23:59:00',
      tampilkan_nilai: true,
      acak_soal: false,
    },
    {
      nama_paket_soal: 'IPA Kelas 6',
      mata_pelajaran: 'IPA',
      durasi_menit: 45,
      status: 'Aktif',
      token_paket_soal: 'IPA123',
      waktu_mulai: '2026-01-01 00:00:00',
      waktu_berakhir: '2030-12-31 23:59:00',
      tampilkan_nilai: true,
      acak_soal: false,
    },
    {
      nama_paket_soal: 'Bahasa Indonesia Kelas 6',
      mata_pelajaran: 'Bahasa Indonesia',
      durasi_menit: 60,
      status: 'Nonaktif',
      token_paket_soal: 'BIN123',
      waktu_mulai: '2026-01-01 00:00:00',
      waktu_berakhir: '2030-12-31 23:59:00',
      tampilkan_nilai: true,
      acak_soal: false,
    },
  ];

  const mtkId = await savePaket(samplePakets[0]);
  await savePaket(samplePakets[1]);
  await savePaket(samplePakets[2]);

  const mtkPaket: PaketUjian = { id: mtkId, ...samplePakets[0] };
  await importSoalBatch(
    [
      {
        id_soal: `S${Date.now()}_1`,
        nomor_soal: 1,
        jenis_soal: 'PG',
        teks_stimulus:
          'Bu Ani membeli 3 kg apel seharga Rp25.000 per kg dan 2 kg jeruk seharga Rp20.000 per kg di pasar.',
        gambar_stimulus_url: '',
        teks_soal: 'Berapa total uang yang harus dibayar Bu Ani?',
        gambar_soal_url: '',
        pilihan_a: 'Rp95.000',
        pilihan_b: 'Rp105.000',
        pilihan_c: 'Rp115.000',
        pilihan_d: 'Rp125.000',
        kunci_jawaban: 'C',
        pembahasan: 'Apel: 3 x 25.000 = 75.000. Jeruk: 2 x 20.000 = 40.000. Total = 115.000.',
        bobot: 10,
      },
      {
        id_soal: `S${Date.now()}_2`,
        nomor_soal: 2,
        jenis_soal: 'PGK MCMA',
        teks_stimulus: 'Perhatikan deretan bilangan berikut: **12, 15, 18, 21, 25**.',
        gambar_stimulus_url: '',
        teks_soal: 'Pilih SEMUA bilangan yang merupakan kelipatan 3.',
        gambar_soal_url: '',
        pilihan_a: '12',
        pilihan_b: '15',
        pilihan_c: '21',
        pilihan_d: '25',
        kunci_jawaban: 'A,B,C',
        pembahasan: '12, 15, dan 21 habis dibagi 3, sedangkan 25 tidak.',
        bobot: 10,
      },
      {
        id_soal: `S${Date.now()}_3`,
        nomor_soal: 3,
        jenis_soal: 'PGK Kategori:Benar/Salah',
        teks_stimulus:
          'Kebun Pak Budi berbentuk persegi panjang dengan panjang 20 m dan lebar 15 m.',
        gambar_stimulus_url: '',
        teks_soal: 'Tentukan pernyataan berikut Benar atau Salah.',
        gambar_soal_url: '',
        pilihan_a: 'Luas kebun adalah 300 m^{2}',
        pilihan_b: 'Keliling kebun adalah 70 m',
        pilihan_c: 'Luas kebun adalah 350 m^{2}',
        pilihan_d: 'Lebar kebun lebih panjang daripada panjangnya',
        kunci_jawaban: 'Benar,Benar,Salah,Salah',
        pembahasan:
          'Luas = 20 x 15 = 300 m^{2}. Keliling = 2 x (20+15) = 70 m. Lebar (15) lebih pendek dari panjang (20).',
        bobot: 10,
      },
    ],
    mtkPaket
  );

  const existingSiswa = await listSiswa();
  await importSiswaBatch(
    [
      { nama_siswa: 'Andi Saputra', kelas: '6A', status_akun: 'Aktif' },
      { nama_siswa: 'Siti Rahma', kelas: '6A', status_akun: 'Aktif' },
      { nama_siswa: 'Budi Santoso', kelas: '6B', status_akun: 'Aktif' },
    ],
    existingSiswa
  );
}
