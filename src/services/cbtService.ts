import { signInAnonymously, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ActiveStudentSession,
  AdminPassLabel,
  AdminUser,
  AnswerValue,
  ExamSubmitResult,
  HasilUjian,
  LogPelanggaran,
  PaketUjian,
  Pengaturan,
  ProgresUjian,
  Siswa,
  SoalKunci,
  SoalLengkap,
  SoalPublik,
  TataTertib,
} from '../types/cbt';
import {
  calculateExamScore,
  generateRandomToken,
  safeDocId,
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

function isWithinWindow(p: Pick<PaketUjian, 'waktu_mulai' | 'waktu_berakhir'>): boolean {
  const now = Date.now();
  const parseDt = (s: string) => {
    if (!s || !s.trim()) return null;
    const norm = s.trim().replace(' ', 'T');
    const ms = Date.parse(norm);
    return Number.isNaN(ms) ? null : ms;
  };
  const start = parseDt(p.waktu_mulai);
  const end = parseDt(p.waktu_berakhir);
  if (start !== null && now < start) return false;
  if (end !== null && now > end) return false;
  return true;
}

export async function getPengaturan(): Promise<Pengaturan> {
  const path = 'pengaturan/global';
  try {
    const snap = await getDoc(doc(db, 'pengaturan', 'global'));
    if (!snap.exists()) return DEFAULT_PENGATURAN;
    const d = snap.data();
    return {
      judul: String(d.judul || DEFAULT_PENGATURAN.judul),
      subjudul: d.subjudul != null ? String(d.subjudul) : DEFAULT_PENGATURAN.subjudul,
      judul_admin: d.judul_admin != null ? String(d.judul_admin) : DEFAULT_PENGATURAN.judul_admin,
      subjudul_admin: d.subjudul_admin != null ? String(d.subjudul_admin) : DEFAULT_PENGATURAN.subjudul_admin,
      logo: d.logo ? String(d.logo) : DEFAULT_PENGATURAN.logo,
    };
  } catch (err) {
    console.warn('Fallback ke pengaturan default:', err);
    return DEFAULT_PENGATURAN;
  }
}

export async function savePengaturan(cfg: Pengaturan): Promise<void> {
  const path = 'pengaturan/global';
  try {
    await setDoc(doc(db, 'pengaturan', 'global'), {
      judul: cfg.judul.trim() || DEFAULT_PENGATURAN.judul,
      subjudul: cfg.subjudul ?? '',
      judul_admin: cfg.judul_admin ?? 'Admin CBT',
      subjudul_admin: cfg.subjudul_admin ?? '',
      logo: cfg.logo ?? '',
      updated_at: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getTataTertib(): Promise<TataTertib[]> {
  const path = 'tata_tertib';
  try {
    const q = query(collection(db, 'tata_tertib'), where('no', '>=', 1), orderBy('no', 'asc'));
    const snap = await getDocs(q);
    if (snap.empty) {
      return DEFAULT_TATA_TERTIB.map((teks, idx) => ({
        id: `tib_${idx + 1}`,
        no: idx + 1,
        teks,
      }));
    }
    return snap.docs.map((d) => ({
      id: d.id,
      no: Number(d.data().no) || 1,
      teks: String(d.data().teks || ''),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveTataTertibList(items: { no: number; teks: string }[]): Promise<void> {
  try {
    const existing = await getDocs(collection(db, 'tata_tertib'));
    const batch = writeBatch(db);
    existing.docs.forEach((d) => batch.delete(d.ref));
    items.forEach((item, idx) => {
      const no = idx + 1;
      const ref = doc(db, 'tata_tertib', `tib_${no}`);
      batch.set(ref, {
        no,
        teks: item.teks.trim().slice(0, 500),
        updated_at: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'tata_tertib');
  }
}

// ===== Student Exam Flow =====

export async function verifyStudentLogin(
  namaInput: string,
  tokenInput: string
): Promise<{ ok: true; session: ActiveStudentSession } | { ok: false; msg: string }> {
  const siswaId = slugifyName(namaInput);
  const token = tokenInput.trim().toUpperCase();

  if (!namaInput.trim()) return { ok: false, msg: 'Masukkan nama lengkap Anda.' };
  if (!token) return { ok: false, msg: 'Masukkan token paket soal.' };

  let siswaSnap;
  try {
    siswaSnap = await getDoc(doc(db, 'siswa', siswaId));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `siswa/${siswaId}`);
  }
  if (!siswaSnap.exists()) {
    return { ok: false, msg: 'Nama siswa tidak terdaftar. Pastikan ejaan sesuai daftar kelas.' };
  }
  const sd = siswaSnap.data();
  const siswa: Siswa = {
    id: siswaSnap.id,
    nama_siswa: String(sd.nama_siswa),
    nama_key: String(sd.nama_key),
    kelas: String(sd.kelas),
    status_ujian: String(sd.status_ujian || 'Belum'),
    status_akun: sd.status_akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
  };
  if (siswa.status_akun !== 'Aktif') {
    return { ok: false, msg: 'Akun Anda nonaktif. Hubungi guru/pengawas.' };
  }

  let tokSnap;
  try {
    tokSnap = await getDoc(doc(db, 'paket_tokens', token));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `paket_tokens/${token}`);
  }
  if (!tokSnap.exists()) {
    return { ok: false, msg: 'Token paket soal salah.' };
  }
  const td = tokSnap.data();
  const paket: PaketUjian = {
    id: String(td.paket_id),
    nama_paket_soal: String(td.nama_paket_soal),
    mata_pelajaran: String(td.mata_pelajaran),
    durasi_menit: Number(td.durasi_menit) || 60,
    status: td.status === 'Aktif' ? 'Aktif' : 'Nonaktif',
    token_paket_soal: String(td.token_paket_soal),
    waktu_mulai: String(td.waktu_mulai || ''),
    waktu_berakhir: String(td.waktu_berakhir || ''),
    tampilkan_nilai: td.tampilkan_nilai !== false,
    acak_soal: td.acak_soal === true,
  };

  if (paket.status !== 'Aktif') {
    return { ok: false, msg: 'Paket soal belum aktif.' };
  }
  if (!isWithinWindow(paket)) {
    return { ok: false, msg: 'Ujian di luar jadwal yang ditentukan.' };
  }

  const compositeId = `${paket.id}__${siswa.id}`;
  try {
    const hasilSnap = await getDoc(doc(db, 'hasil', compositeId));
    if (hasilSnap.exists()) {
      return { ok: false, msg: 'Anda sudah menyelesaikan ujian ini.' };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `hasil/${compositeId}`);
  }

  const resume = siswa.status_ujian === `Sedang Ujian: ${paket.nama_paket_soal}`;
  let progres: ProgresUjian | null = null;
  try {
    const progSnap = await getDoc(doc(db, 'progres', compositeId));
    if (progSnap.exists() && resume) {
      const pd = progSnap.data();
      progres = {
        id: progSnap.id,
        paket_id: String(pd.paket_id),
        paket_nama: String(pd.paket_nama),
        siswa_id: String(pd.siswa_id),
        nama_siswa: String(pd.nama_siswa),
        kelas: String(pd.kelas),
        jawaban: (pd.jawaban || {}) as Record<string, AnswerValue>,
        ragu: (pd.ragu || {}) as Record<string, boolean>,
        current_index: Number(pd.current_index) || 0,
        sisa_detik: Number(pd.sisa_detik) || paket.durasi_menit * 60,
        pelanggaran: Number(pd.pelanggaran) || 0,
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `progres/${compositeId}`);
  }

  const tib = await getTataTertib();
  return {
    ok: true,
    session: {
      siswa,
      paket,
      tib,
      resume,
      progres,
    },
  };
}

export async function markStudentExamStarted(paket: PaketUjian, siswa: Siswa): Promise<void> {
  const statusStr = `Sedang Ujian: ${paket.nama_paket_soal}`;
  if (siswa.status_ujian === statusStr) return;
  try {
    await updateDoc(doc(db, 'siswa', siswa.id), {
      status_ujian: statusStr,
      updated_at: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `siswa/${siswa.id}`);
  }
}

export async function getQuestionsForStudent(
  paket: PaketUjian,
  siswaKey: string
): Promise<SoalPublik[]> {
  const path = `soal?paket_id=${paket.id}`;
  try {
    const q = query(
      collection(db, 'soal'),
      where('paket_id', '==', paket.id),
      where('aktif', '==', true)
    );
    const snap = await getDocs(q);
    const list: SoalPublik[] = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          id_soal: String(x.id_soal || d.id),
          paket_id: String(x.paket_id),
          paket: String(x.paket),
          nomor_soal: Number(x.nomor_soal) || 1,
          jenis_soal: String(x.jenis_soal || 'PG'),
          teks_stimulus: String(x.teks_stimulus || ''),
          gambar_stimulus_url: String(x.gambar_stimulus_url || ''),
          teks_soal: String(x.teks_soal || ''),
          gambar_soal_url: String(x.gambar_soal_url || ''),
          pilihan_a: String(x.pilihan_a || ''),
          pilihan_b: String(x.pilihan_b || ''),
          pilihan_c: String(x.pilihan_c || ''),
          pilihan_d: String(x.pilihan_d || ''),
          bobot: Number(x.bobot) || 1,
          aktif: x.aktif === true,
        };
      })
      .sort((a, b) => a.nomor_soal - b.nomor_soal);

    if (list.length === 0) {
      throw new Error(`Belum ada soal aktif untuk paket "${paket.nama_paket_soal}".`);
    }
    return paket.acak_soal ? seededShuffle(list, `${paket.id}_${siswaKey}`) : list;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Belum ada soal')) throw err;
    handleFirestoreError(err, OperationType.LIST, path);
  }
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
  const docId = `${paket.id}__${siswa.id}`;

  // Check if admin force-finished or reset this student
  try {
    const swSnap = await getDoc(doc(db, 'siswa', siswa.id));
    if (!swSnap.exists()) return false;
    const statusUjian = String(swSnap.data().status_ujian || '');
    if (statusUjian !== `Sedang Ujian: ${paket.nama_paket_soal}`) {
      return false;
    }
  } catch {
    return true;
  }

  try {
    await setDoc(doc(db, 'progres', docId), {
      paket_id: paket.id,
      paket_nama: paket.nama_paket_soal,
      siswa_id: siswa.id,
      nama_siswa: siswa.nama_siswa,
      kelas: siswa.kelas,
      jawaban,
      ragu,
      current_index: Math.max(0, Math.floor(currentIndex)),
      sisa_detik: Math.max(0, Math.floor(sisaDetik)),
      pelanggaran: Math.max(0, Math.floor(pelanggaran)),
      updated_at: serverTimestamp(),
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `progres/${docId}`);
  }
}

export async function logStudentViolation(params: {
  siswa: Siswa;
  paket: PaketUjian;
  jenis: string;
}): Promise<void> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await setDoc(doc(db, 'pelanggaran', logId), {
      siswa_id: params.siswa.id,
      nama_siswa: params.siswa.nama_siswa,
      kelas: params.siswa.kelas,
      paket_id: params.paket.id,
      paket_nama: params.paket.nama_paket_soal,
      jenis_pelanggaran: params.jenis,
      status_ujian: `Sedang Ujian: ${params.paket.nama_paket_soal}`,
      created_at: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Gagal mencatat log pelanggaran:', err);
  }
}

export async function submitStudentExam(params: {
  paket: PaketUjian;
  siswa: Siswa;
  questions: SoalPublik[];
  jawaban: Record<string, AnswerValue>;
  pelanggaran: number;
}): Promise<ExamSubmitResult> {
  const { paket, siswa, questions, jawaban, pelanggaran } = params;
  const docId = `${paket.id}__${siswa.id}`;

  // Check if already submitted
  try {
    const existingHasil = await getDoc(doc(db, 'hasil', docId));
    if (existingHasil.exists()) {
      const d = existingHasil.data();
      return {
        nilai: Number(d.nilai_akhir) || 0,
        benar: Number(d.total_benar) || 0,
        salah: Number(d.total_salah) || 0,
        tampilkan_nilai: paket.tampilkan_nilai,
        rev: [],
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `hasil/${docId}`);
  }

  let nilai = 0;
  let benar = 0;
  let salah = 0;
  let statusPenilaian: 'dinilai' | 'menunggu' = 'menunggu';
  let rev: ExamSubmitResult['rev'] = [];

  if (paket.tampilkan_nilai) {
    try {
      const kq = query(
        collection(db, 'soal_kunci'),
        where('paket_id', '==', paket.id),
        where('rilis_kunci', '==', true)
      );
      const kSnap = await getDocs(kq);
      const kMap = new Map<string, SoalKunci>();
      kSnap.docs.forEach((d) => {
        const kd = d.data();
        kMap.set(String(kd.id_soal || d.id), {
          id: d.id,
          id_soal: String(kd.id_soal || d.id),
          paket_id: String(kd.paket_id),
          kunci_jawaban: String(kd.kunci_jawaban || ''),
          pembahasan: String(kd.pembahasan || ''),
          bobot: Number(kd.bobot) || 1,
          rilis_kunci: kd.rilis_kunci === true,
        });
      });

      const fullQuestions: SoalLengkap[] = questions.map((q) => {
        const k = kMap.get(q.id_soal);
        return {
          ...q,
          kunci_jawaban: k?.kunci_jawaban || '',
          pembahasan: k?.pembahasan || '',
          rilis_kunci: k?.rilis_kunci ?? false,
        };
      });

      const scored = calculateExamScore(fullQuestions, jawaban);
      nilai = scored.nilai;
      benar = scored.benar;
      salah = scored.salah;
      rev = scored.rev;
      statusPenilaian = 'dinilai';
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `soal_kunci?paket_id=${paket.id}`);
    }
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'hasil', docId), {
      paket_id: paket.id,
      paket: paket.nama_paket_soal,
      siswa_id: siswa.id,
      nama_siswa: siswa.nama_siswa,
      kelas: siswa.kelas,
      nilai_akhir: nilai,
      total_benar: benar,
      total_salah: salah,
      pelanggaran_tab: Math.max(0, Math.floor(pelanggaran)),
      detail_jawaban: jawaban,
      status_penilaian: statusPenilaian,
      created_at: serverTimestamp(),
    });
    batch.delete(doc(db, 'progres', docId));
    batch.update(doc(db, 'siswa', siswa.id), {
      status_ujian: 'Selesai',
      updated_at: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `hasil/${docId}`);
  }

  return {
    nilai,
    benar,
    salah,
    tampilkan_nilai: paket.tampilkan_nilai,
    rev,
  };
}

// ===== Admin Operations (Password-Based Auth) =====

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

async function computeAdminProofHex(password: string): Promise<string> {
  const bytes = await sha256Bytes(`cbt_admin_v1:${password}`);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeVerifierBase64(proofHex: string): Promise<string> {
  const bytes = await sha256Bytes(proofHex);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

function mapAnonymousAuthError(err: unknown): Error {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);
  if (
    code === 'auth/operation-not-allowed' ||
    code === 'auth/admin-restricted-operation' ||
    msg.includes('operation-not-allowed') ||
    msg.includes('admin-restricted-operation')
  ) {
    return new Error(
      'Login Anonymous belum diaktifkan di Firebase Console. Buka Authentication → Sign-in method → Anonymous → Aktifkan (Enable) → Save.'
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

export async function getAdminAuthStatus(): Promise<{ initialized: boolean }> {
  try {
    const snap = await getDoc(doc(db, 'admin_config', 'status'));
    return { initialized: snap.exists() && snap.data()?.initialized === true };
  } catch {
    return { initialized: false };
  }
}

export async function setupInitialAdminPassword(password: string): Promise<void> {
  const cleanPw = password.trim();
  if (cleanPw.length < 3) {
    throw new Error('Password admin minimal 3 karakter.');
  }

  let uid = '';
  try {
    const cred = await signInAnonymously(auth);
    uid = cred.user.uid;
  } catch (err) {
    throw mapAnonymousAuthError(err);
  }

  const proof = await computeAdminProofHex(cleanPw);
  const verifier = await computeVerifierBase64(proof);

  try {
    const sessRef = doc(db, 'admin_sessions', uid);
    const existingSess = await getDoc(sessRef);
    if (existingSess.exists()) {
      await deleteDoc(sessRef);
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'admin_config', 'auth'), {
      verifiers: [verifier],
      updated_at: serverTimestamp(),
    });
    batch.set(doc(db, 'admin_config', 'status'), {
      initialized: true,
      updated_at: serverTimestamp(),
    });
    batch.set(doc(db, 'admin_pass_labels', 'utama'), {
      label: 'Password Utama',
      verifier,
      created_at: serverTimestamp(),
    });
    batch.set(sessRef, {
      uid,
      proof,
      created_at: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    await signOut(auth).catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('already exists')) {
      throw new Error('Password admin sudah diatur sebelumnya. Silakan masukkan password Anda.');
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

export async function loginAdminWithPassword(password: string): Promise<void> {
  if (!password) {
    throw new Error('Masukkan password admin.');
  }

  let uid = '';
  try {
    const cred = await signInAnonymously(auth);
    uid = cred.user.uid;
  } catch (err) {
    throw mapAnonymousAuthError(err);
  }

  const proof = await computeAdminProofHex(password.trim());
  const sessRef = doc(db, 'admin_sessions', uid);

  try {
    const existingSess = await getDoc(sessRef);
    if (existingSess.exists()) {
      await deleteDoc(sessRef);
    }
    await setDoc(sessRef, {
      uid,
      proof,
      created_at: serverTimestamp(),
    });
  } catch (err) {
    await signOut(auth).catch(() => undefined);
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : String(err);
    if (code === 'permission-denied' || msg.toLowerCase().includes('permission')) {
      throw new Error('Password admin salah.');
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

export async function checkIsCurrentAdminSession(user: User | null): Promise<boolean> {
  if (!user) return false;
  try {
    const sessSnap = await getDoc(doc(db, 'admin_sessions', user.uid));
    if (sessSnap.exists()) return true;
  } catch {
    // fallback check below
  }
  if (user.email) {
    return checkIsAdminEmail(user.email);
  }
  return false;
}

export async function logoutAdminSession(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      await deleteDoc(doc(db, 'admin_sessions', uid));
    } catch {
      // ignore if session already removed
    }
  }
  await signOut(auth);
}

export async function listAdminPassLabels(): Promise<AdminPassLabel[]> {
  try {
    const snap = await getDocs(collection(db, 'admin_pass_labels'));
    return snap.docs
      .map((d) => ({
        id: d.id,
        label: String(d.data().label || 'Password Admin'),
        verifier: String(d.data().verifier || ''),
        created_at: d.data().created_at?.toDate ? d.data().created_at.toDate() : null,
      }))
      .sort((a, b) => (a.created_at?.getTime() || 0) - (b.created_at?.getTime() || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'admin_pass_labels');
  }
}

export async function addAdminPasscode(label: string, password: string): Promise<void> {
  const cleanLabel = label.trim() || 'Password Tambahan';
  const cleanPw = password.trim();
  if (cleanPw.length < 3) {
    throw new Error('Password minimal 3 karakter.');
  }
  const proof = await computeAdminProofHex(cleanPw);
  const verifier = await computeVerifierBase64(proof);

  try {
    const authRef = doc(db, 'admin_config', 'auth');
    const authSnap = await getDoc(authRef);
    const current: string[] = Array.isArray(authSnap.data()?.verifiers)
      ? authSnap.data()!.verifiers.map(String)
      : [];
    if (current.includes(verifier)) {
      throw new Error('Password tersebut sudah terdaftar.');
    }
    if (current.length >= 20) {
      throw new Error('Maksimal 20 password admin.');
    }
    const passId = `pass_${Date.now()}`;
    const batch = writeBatch(db);
    batch.update(authRef, {
      verifiers: [...current, verifier],
      updated_at: serverTimestamp(),
    });
    batch.set(doc(db, 'admin_pass_labels', passId), {
      label: cleanLabel.slice(0, 80),
      verifier,
      created_at: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('sudah terdaftar') || err.message.includes('Maksimal'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, 'admin_pass_labels');
  }
}

export async function deleteAdminPasscode(passId: string, verifier: string): Promise<void> {
  try {
    const authRef = doc(db, 'admin_config', 'auth');
    const authSnap = await getDoc(authRef);
    const current: string[] = Array.isArray(authSnap.data()?.verifiers)
      ? authSnap.data()!.verifiers.map(String)
      : [];
    const next = current.filter((v) => v !== verifier);
    if (next.length === 0) {
      throw new Error('Minimal harus tersisa 1 password admin aktif.');
    }
    const batch = writeBatch(db);
    batch.update(authRef, {
      verifiers: next,
      updated_at: serverTimestamp(),
    });
    batch.delete(doc(db, 'admin_pass_labels', passId));
    await batch.commit();
  } catch (err) {
    if (err instanceof Error && err.message.includes('Minimal harus')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.DELETE, `admin_pass_labels/${passId}`);
  }
}

export async function checkIsAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if (email.toLowerCase() === 'cahyoooow@gmail.com') return true;
  try {
    const snap = await getDoc(doc(db, 'admins', email.toLowerCase()));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function ensurePrimaryAdminRecord(email: string, nama: string): Promise<void> {
  if (email.toLowerCase() !== 'cahyoooow@gmail.com') return;
  try {
    const ref = doc(db, 'admins', 'cahyoooow@gmail.com');
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        email: 'cahyoooow@gmail.com',
        nama: nama || 'Administrator Utama',
        role: 'superadmin',
        created_at: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Skip ensurePrimaryAdminRecord:', err);
  }
}

export async function listAdmins(): Promise<AdminUser[]> {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    return snap.docs.map((d) => ({
      id: d.id,
      email: String(d.data().email || d.id),
      nama: String(d.data().nama || ''),
      role: d.data().role === 'superadmin' ? 'superadmin' : 'admin',
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'admins');
  }
}

export async function saveAdminUser(email: string, nama: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    await setDoc(doc(db, 'admins', cleanEmail), {
      email: cleanEmail,
      nama: nama.trim() || cleanEmail.split('@')[0],
      role: cleanEmail === 'cahyoooow@gmail.com' ? 'superadmin' : 'admin',
      created_at: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `admins/${cleanEmail}`);
  }
}

export async function deleteAdminUser(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === 'cahyoooow@gmail.com') {
    throw new Error('Admin utama tidak dapat dihapus.');
  }
  try {
    await deleteDoc(doc(db, 'admins', cleanEmail));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `admins/${cleanEmail}`);
  }
}

export async function listPaket(): Promise<PaketUjian[]> {
  try {
    const snap = await getDocs(collection(db, 'paket'));
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        nama_paket_soal: String(x.nama_paket_soal || ''),
        mata_pelajaran: String(x.mata_pelajaran || ''),
        durasi_menit: Number(x.durasi_menit) || 60,
        status: x.status === 'Aktif' ? 'Aktif' : 'Nonaktif',
        token_paket_soal: String(x.token_paket_soal || ''),
        waktu_mulai: String(x.waktu_mulai || ''),
        waktu_berakhir: String(x.waktu_berakhir || ''),
        tampilkan_nilai: x.tampilkan_nilai !== false,
        acak_soal: x.acak_soal === true,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'paket');
  }
}

export async function savePaket(
  paket: Omit<PaketUjian, 'id'> & { id?: string },
  oldToken?: string
): Promise<string> {
  const id = paket.id ? safeDocId(paket.id) : `pkt_${Date.now()}`;
  const token = (paket.token_paket_soal || generateRandomToken()).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const payload = {
    nama_paket_soal: paket.nama_paket_soal.trim(),
    mata_pelajaran: paket.mata_pelajaran.trim(),
    durasi_menit: Math.max(1, Math.min(600, Math.round(Number(paket.durasi_menit) || 60))),
    status: paket.status === 'Aktif' ? 'Aktif' : 'Nonaktif',
    token_paket_soal: token,
    waktu_mulai: paket.waktu_mulai || '',
    waktu_berakhir: paket.waktu_berakhir || '',
    tampilkan_nilai: paket.tampilkan_nilai !== false,
    acak_soal: paket.acak_soal === true,
    updated_at: serverTimestamp(),
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'paket', id), payload);
    batch.set(doc(db, 'paket_tokens', token), {
      paket_id: id,
      ...payload,
    });
    if (oldToken && oldToken.toUpperCase() !== token) {
      batch.delete(doc(db, 'paket_tokens', oldToken.toUpperCase()));
    }

    // Sync aktif & rilis_kunci flags on all questions belonging to this paket
    const [soalSnap, kunciSnap] = await Promise.all([
      getDocs(query(collection(db, 'soal'), where('paket_id', '==', id))),
      getDocs(query(collection(db, 'soal_kunci'), where('paket_id', '==', id))),
    ]);
    const isAktif = payload.status === 'Aktif';
    soalSnap.docs.forEach((d) => {
      batch.update(d.ref, {
        aktif: isAktif,
        paket: payload.nama_paket_soal,
        updated_at: serverTimestamp(),
      });
    });
    kunciSnap.docs.forEach((d) => {
      batch.update(d.ref, {
        rilis_kunci: payload.tampilkan_nilai,
        updated_at: serverTimestamp(),
      });
    });

    await batch.commit();
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `paket/${id}`);
  }
}

export async function deletePaket(paket: PaketUjian): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'paket', paket.id));
    if (paket.token_paket_soal) {
      batch.delete(doc(db, 'paket_tokens', paket.token_paket_soal.toUpperCase()));
    }
    const [soalSnap, kunciSnap] = await Promise.all([
      getDocs(query(collection(db, 'soal'), where('paket_id', '==', paket.id))),
      getDocs(query(collection(db, 'soal_kunci'), where('paket_id', '==', paket.id))),
    ]);
    soalSnap.docs.forEach((d) => batch.delete(d.ref));
    kunciSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `paket/${paket.id}`);
  }
}

export async function copyPaketWithSoal(src: PaketUjian, allPakets: PaketUjian[]): Promise<PaketUjian> {
  const existingNames = new Set(allPakets.map((p) => p.nama_paket_soal.toLowerCase()));
  const existingTokens = new Set(allPakets.map((p) => p.token_paket_soal.toUpperCase()));

  let newName = `${src.nama_paket_soal} (Salinan)`;
  let idx = 2;
  while (existingNames.has(newName.toLowerCase())) {
    newName = `${src.nama_paket_soal} (Salinan ${idx++})`;
  }

  let newToken = generateRandomToken();
  while (existingTokens.has(newToken)) {
    newToken = generateRandomToken();
  }

  const newId = await savePaket({
    nama_paket_soal: newName,
    mata_pelajaran: src.mata_pelajaran,
    durasi_menit: src.durasi_menit,
    status: 'Nonaktif',
    token_paket_soal: newToken,
    waktu_mulai: src.waktu_mulai,
    waktu_berakhir: src.waktu_berakhir,
    tampilkan_nilai: src.tampilkan_nilai,
    acak_soal: src.acak_soal,
  });

  const srcQuestions = await listSoalLengkap(src.id);
  if (srcQuestions.length > 0) {
    const batch = writeBatch(db);
    const base = Date.now();
    srcQuestions.forEach((q, i) => {
      const qId = `S${base}_${i}`;
      batch.set(doc(db, 'soal', qId), {
        id_soal: qId,
        paket_id: newId,
        paket: newName,
        nomor_soal: q.nomor_soal,
        jenis_soal: q.jenis_soal,
        teks_stimulus: q.teks_stimulus,
        gambar_stimulus_url: q.gambar_stimulus_url,
        teks_soal: q.teks_soal,
        gambar_soal_url: q.gambar_soal_url,
        pilihan_a: q.pilihan_a,
        pilihan_b: q.pilihan_b,
        pilihan_c: q.pilihan_c,
        pilihan_d: q.pilihan_d,
        bobot: q.bobot,
        aktif: false,
        tka_mapel: q.tka_mapel || '',
        tka_elemen: q.tka_elemen || '',
        tka_subelemen: q.tka_subelemen || '',
        tka_indikator: q.tka_indikator || '',
        updated_at: serverTimestamp(),
      });
      batch.set(doc(db, 'soal_kunci', qId), {
        id_soal: qId,
        paket_id: newId,
        kunci_jawaban: q.kunci_jawaban,
        pembahasan: q.pembahasan,
        bobot: q.bobot,
        rilis_kunci: src.tampilkan_nilai,
        updated_at: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return {
    id: newId,
    nama_paket_soal: newName,
    mata_pelajaran: src.mata_pelajaran,
    durasi_menit: src.durasi_menit,
    status: 'Nonaktif',
    token_paket_soal: newToken,
    waktu_mulai: src.waktu_mulai,
    waktu_berakhir: src.waktu_berakhir,
    tampilkan_nilai: src.tampilkan_nilai,
    acak_soal: src.acak_soal,
  };
}

export async function listSoalLengkap(paketId?: string): Promise<SoalLengkap[]> {
  try {
    const qPub = paketId
      ? query(collection(db, 'soal'), where('paket_id', '==', paketId))
      : collection(db, 'soal');
    const qKun = paketId
      ? query(collection(db, 'soal_kunci'), where('paket_id', '==', paketId))
      : collection(db, 'soal_kunci');

    const [pubSnap, kunSnap] = await Promise.all([getDocs(qPub), getDocs(qKun)]);
    const kunMap = new Map<string, Record<string, unknown>>();
    kunSnap.docs.forEach((d) => kunMap.set(d.id, d.data()));

    return pubSnap.docs
      .map((d) => {
        const x = d.data();
        const k = kunMap.get(d.id) || {};
        return {
          id: d.id,
          id_soal: String(x.id_soal || d.id),
          paket_id: String(x.paket_id || ''),
          paket: String(x.paket || ''),
          nomor_soal: Number(x.nomor_soal) || 1,
          jenis_soal: String(x.jenis_soal || 'PG'),
          teks_stimulus: String(x.teks_stimulus || ''),
          gambar_stimulus_url: String(x.gambar_stimulus_url || ''),
          teks_soal: String(x.teks_soal || ''),
          gambar_soal_url: String(x.gambar_soal_url || ''),
          pilihan_a: String(x.pilihan_a || ''),
          pilihan_b: String(x.pilihan_b || ''),
          pilihan_c: String(x.pilihan_c || ''),
          pilihan_d: String(x.pilihan_d || ''),
          bobot: Number(x.bobot) || 1,
          aktif: x.aktif === true,
          tka_mapel: x.tka_mapel ? String(x.tka_mapel) : '',
          tka_elemen: x.tka_elemen ? String(x.tka_elemen) : '',
          tka_subelemen: x.tka_subelemen ? String(x.tka_subelemen) : '',
          tka_indikator: x.tka_indikator ? String(x.tka_indikator) : '',
          kunci_jawaban: String(k.kunci_jawaban || ''),
          pembahasan: String(k.pembahasan || ''),
          rilis_kunci: k.rilis_kunci !== false,
        };
      })
      .sort((a, b) => a.nomor_soal - b.nomor_soal);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'soal');
  }
}

export async function saveSoal(soal: Omit<SoalLengkap, 'id'> & { id?: string }, paket: PaketUjian): Promise<void> {
  const id = soal.id_soal ? safeDocId(soal.id_soal) : `S${Date.now()}`;
  const bobot = Number(soal.bobot) || 1;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'soal', id), {
      id_soal: id,
      paket_id: paket.id,
      paket: paket.nama_paket_soal,
      nomor_soal: Math.max(1, Math.round(Number(soal.nomor_soal) || 1)),
      jenis_soal: soal.jenis_soal || 'PG',
      teks_stimulus: soal.teks_stimulus || '',
      gambar_stimulus_url: soal.gambar_stimulus_url || '',
      teks_soal: soal.teks_soal || '',
      gambar_soal_url: soal.gambar_soal_url || '',
      pilihan_a: soal.pilihan_a || '',
      pilihan_b: soal.pilihan_b || '',
      pilihan_c: soal.pilihan_c || '',
      pilihan_d: soal.pilihan_d || '',
      bobot,
      aktif: paket.status === 'Aktif',
      tka_mapel: (soal.tka_mapel || '').slice(0, 80),
      tka_elemen: (soal.tka_elemen || '').slice(0, 160),
      tka_subelemen: (soal.tka_subelemen || '').slice(0, 200),
      tka_indikator: (soal.tka_indikator || '').slice(0, 300),
      updated_at: serverTimestamp(),
    });
    batch.set(doc(db, 'soal_kunci', id), {
      id_soal: id,
      paket_id: paket.id,
      kunci_jawaban: soal.kunci_jawaban || '',
      pembahasan: soal.pembahasan || '',
      bobot,
      rilis_kunci: paket.tampilkan_nilai !== false,
      updated_at: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `soal/${id}`);
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
  const chunkSize = 400;
  let total = 0;
  try {
    for (let i = 0; i < updates.length; i += chunkSize) {
      const batch = writeBatch(db);
      updates.slice(i, i + chunkSize).forEach((u) => {
        batch.update(doc(db, 'soal', u.id), {
          tka_mapel: u.tka_mapel.slice(0, 80),
          tka_elemen: u.tka_elemen.slice(0, 160),
          tka_subelemen: u.tka_subelemen.slice(0, 200),
          tka_indikator: u.tka_indikator.slice(0, 300),
          updated_at: serverTimestamp(),
        });
        total++;
      });
      await batch.commit();
    }
    return total;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'soal');
  }
}

export async function importSoalBatch(items: Partial<SoalLengkap>[], paket: PaketUjian): Promise<number> {
  const chunkSize = 200; // 2 writes per question = 400 writes < 500 batch limit
  let total = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    const base = Date.now();
    chunk.forEach((item, idx) => {
      const id = item.id_soal ? safeDocId(item.id_soal) : `S${base}_${i + idx}`;
      const bobot = Number(item.bobot) || 1;
      batch.set(doc(db, 'soal', id), {
        id_soal: id,
        paket_id: paket.id,
        paket: paket.nama_paket_soal,
        nomor_soal: Math.max(1, Math.round(Number(item.nomor_soal) || i + idx + 1)),
        jenis_soal: String(item.jenis_soal || 'PG'),
        teks_stimulus: String(item.teks_stimulus || ''),
        gambar_stimulus_url: String(item.gambar_stimulus_url || ''),
        teks_soal: String(item.teks_soal || ''),
        gambar_soal_url: String(item.gambar_soal_url || ''),
        pilihan_a: String(item.pilihan_a || ''),
        pilihan_b: String(item.pilihan_b || ''),
        pilihan_c: String(item.pilihan_c || ''),
        pilihan_d: String(item.pilihan_d || ''),
        bobot,
        aktif: paket.status === 'Aktif',
        tka_mapel: String(item.tka_mapel || '').slice(0, 80),
        tka_elemen: String(item.tka_elemen || '').slice(0, 160),
        tka_subelemen: String(item.tka_subelemen || '').slice(0, 200),
        tka_indikator: String(item.tka_indikator || '').slice(0, 300),
        updated_at: serverTimestamp(),
      });
      batch.set(doc(db, 'soal_kunci', id), {
        id_soal: id,
        paket_id: paket.id,
        kunci_jawaban: String(item.kunci_jawaban || ''),
        pembahasan: String(item.pembahasan || ''),
        bobot,
        rilis_kunci: paket.tampilkan_nilai !== false,
        updated_at: serverTimestamp(),
      });
      total++;
    });
    await batch.commit();
  }
  return total;
}

export async function deleteSoalByIds(ids: string[]): Promise<void> {
  try {
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const batch = writeBatch(db);
      ids.slice(i, i + chunkSize).forEach((id) => {
        batch.delete(doc(db, 'soal', id));
        batch.delete(doc(db, 'soal_kunci', id));
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'soal');
  }
}

export async function listSiswa(): Promise<Siswa[]> {
  try {
    const snap = await getDocs(collection(db, 'siswa'));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          nama_siswa: String(x.nama_siswa || ''),
          nama_key: String(x.nama_key || d.id),
          kelas: String(x.kelas || ''),
          status_ujian: String(x.status_ujian || 'Belum'),
          status_akun: (x.status_akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif') as 'Aktif' | 'Nonaktif',
        };
      })
      .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama_siswa.localeCompare(b.nama_siswa));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'siswa');
  }
}

export async function saveSiswa(siswa: {
  id?: string;
  nama_siswa: string;
  kelas: string;
  status_ujian?: string;
  status_akun: 'Aktif' | 'Nonaktif';
}): Promise<void> {
  const key = slugifyName(siswa.nama_siswa);
  const id = siswa.id ? safeDocId(siswa.id) : key;
  try {
    const batch = writeBatch(db);
    if (siswa.id && siswa.id !== key) {
      batch.delete(doc(db, 'siswa', siswa.id));
    }
    batch.set(doc(db, 'siswa', key), {
      nama_siswa: siswa.nama_siswa.trim(),
      nama_key: key,
      kelas: siswa.kelas.trim(),
      status_ujian: siswa.status_ujian || 'Belum',
      status_akun: siswa.status_akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
      updated_at: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `siswa/${id}`);
  }
}

export async function importSiswaBatch(
  rows: { nama_siswa: string; kelas: string; status_akun?: string }[],
  existingSiswa: Siswa[]
): Promise<{ added: number; skipped: number }> {
  const have = new Set(existingSiswa.map((s) => s.nama_key));
  const toAdd: { key: string; nama: string; kelas: string; status: 'Aktif' | 'Nonaktif' }[] = [];

  rows.forEach((r) => {
    const nama = String(r.nama_siswa || '').trim();
    const key = slugifyName(nama);
    if (!nama || have.has(key)) return;
    have.add(key);
    toAdd.push({
      key,
      nama,
      kelas: String(r.kelas || '-').trim() || '-',
      status: r.status_akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
    });
  });

  const chunkSize = 400;
  for (let i = 0; i < toAdd.length; i += chunkSize) {
    const batch = writeBatch(db);
    toAdd.slice(i, i + chunkSize).forEach((s) => {
      batch.set(doc(db, 'siswa', s.key), {
        nama_siswa: s.nama,
        nama_key: s.key,
        kelas: s.kelas,
        status_ujian: 'Belum',
        status_akun: s.status,
        updated_at: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return { added: toAdd.length, skipped: rows.length - toAdd.length };
}

export async function deleteSiswa(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'siswa', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `siswa/${id}`);
  }
}

export async function listHasil(paketId?: string): Promise<HasilUjian[]> {
  try {
    const q = paketId
      ? query(collection(db, 'hasil'), where('paket_id', '==', paketId))
      : collection(db, 'hasil');
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        paket_id: String(x.paket_id || ''),
        paket: String(x.paket || ''),
        siswa_id: String(x.siswa_id || ''),
        nama_siswa: String(x.nama_siswa || ''),
        kelas: String(x.kelas || ''),
        nilai_akhir: Number(x.nilai_akhir) || 0,
        total_benar: Number(x.total_benar) || 0,
        total_salah: Number(x.total_salah) || 0,
        pelanggaran_tab: Number(x.pelanggaran_tab) || 0,
        detail_jawaban: (x.detail_jawaban || {}) as Record<string, AnswerValue>,
        status_penilaian: x.status_penilaian === 'menunggu' ? 'menunggu' : 'dinilai',
        created_at: x.created_at?.toDate ? x.created_at.toDate() : null,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'hasil');
  }
}

export async function listPelanggaran(): Promise<LogPelanggaran[]> {
  try {
    const snap = await getDocs(collection(db, 'pelanggaran'));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          siswa_id: String(x.siswa_id || ''),
          nama_siswa: String(x.nama_siswa || ''),
          kelas: String(x.kelas || ''),
          paket_id: String(x.paket_id || ''),
          paket_nama: String(x.paket_nama || ''),
          jenis_pelanggaran: String(x.jenis_pelanggaran || ''),
          status_ujian: String(x.status_ujian || ''),
          created_at: x.created_at?.toDate ? x.created_at.toDate() : null,
        };
      })
      .sort((a, b) => (b.created_at?.getTime() || 0) - (a.created_at?.getTime() || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'pelanggaran');
  }
}

export async function deletePelanggaranByIds(ids: string[]): Promise<void> {
  try {
    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const batch = writeBatch(db);
      ids.slice(i, i + chunkSize).forEach((id) => batch.delete(doc(db, 'pelanggaran', id)));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'pelanggaran');
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
  try {
    const nama = payload.nama_siswa.trim();
    if (!nama) throw new Error('Nama siswa wajib diisi.');
    await updateDoc(doc(db, 'pelanggaran', logId), {
      siswa_id: slugifyName(nama).slice(0, 120),
      nama_siswa: nama.slice(0, 120),
      kelas: (payload.kelas.trim() || '-').slice(0, 40),
      paket_id: payload.paket_id.trim().slice(0, 128),
      paket_nama: (payload.paket_nama.trim() || '-').slice(0, 160),
      jenis_pelanggaran: (payload.jenis_pelanggaran.trim() || 'Pelanggaran Ujian').slice(0, 160),
      status_ujian: payload.status_ujian.trim().slice(0, 200),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `pelanggaran/${logId}`);
  }
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

  const matchStudent = (docSiswaId: unknown, docNama: unknown) => {
    if (!targetSlug && !normNama) return true;
    const sId = String(docSiswaId || '');
    const sNama = String(docNama || '').trim().toLowerCase();
    return (
      (targetSlug !== '' && (sId === targetSlug || slugifyName(sNama) === targetSlug)) ||
      (normNama !== '' && sNama === normNama)
    );
  };

  const matchPaket = (docPaketId: unknown, docPaketNama: unknown, docStatus = '') => {
    if (!hasPaketFilter) return true;
    const pId = String(docPaketId || '');
    const pNama = String(docPaketNama || '').trim().toLowerCase();
    const sStat = String(docStatus || '').trim().toLowerCase();
    return (
      pId === paketId ||
      (normPaketNama !== '' && (pNama === normPaketNama || sStat.includes(normPaketNama)))
    );
  };

  let deletedLogs = 0;
  let resetHasil = 0;

  try {
    const pelSnap = await getDocs(collection(db, 'pelanggaran'));
    const logsToDelete = pelSnap.docs.filter((d) => {
      const x = d.data();
      return (
        matchStudent(x.siswa_id, x.nama_siswa) &&
        matchPaket(x.paket_id, x.paket_nama, String(x.status_ujian || ''))
      );
    });
    const chunkSize = 400;
    for (let i = 0; i < logsToDelete.length; i += chunkSize) {
      const batch = writeBatch(db);
      logsToDelete.slice(i, i + chunkSize).forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deletedLogs += logsToDelete.slice(i, i + chunkSize).length;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'pelanggaran');
  }

  try {
    const hasilSnap = await getDocs(collection(db, 'hasil'));
    const hasilsToReset = hasilSnap.docs.filter((d) => {
      const x = d.data();
      return (
        Number(x.pelanggaran_tab || 0) > 0 &&
        matchStudent(x.siswa_id, x.nama_siswa) &&
        matchPaket(x.paket_id, x.paket)
      );
    });
    const chunkSize = 400;
    for (let i = 0; i < hasilsToReset.length; i += chunkSize) {
      const batch = writeBatch(db);
      hasilsToReset.slice(i, i + chunkSize).forEach((d) => {
        batch.update(d.ref, { pelanggaran_tab: 0 });
      });
      await batch.commit();
      resetHasil += hasilsToReset.slice(i, i + chunkSize).length;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'hasil');
  }

  try {
    const progSnap = await getDocs(collection(db, 'progres'));
    const progsToReset = progSnap.docs.filter((d) => {
      const x = d.data();
      return (
        Number(x.pelanggaran || 0) > 0 &&
        matchStudent(x.siswa_id, x.nama_siswa) &&
        matchPaket(x.paket_id, x.paket_nama)
      );
    });
    const chunkSize = 400;
    for (let i = 0; i < progsToReset.length; i += chunkSize) {
      const batch = writeBatch(db);
      progsToReset.slice(i, i + chunkSize).forEach((d) => {
        batch.update(d.ref, { pelanggaran: 0, updated_at: serverTimestamp() });
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'progres');
  }

  return { deletedLogs, resetHasil };
}

export async function resetPesertaUjian(
  paket: PaketUjian,
  targetSiswaIds?: string[] // undefined = reset ALL students for this paket
): Promise<number> {
  try {
    const allSiswa = await listSiswa();
    const targets = targetSiswaIds
      ? allSiswa.filter((s) => targetSiswaIds.includes(s.id))
      : allSiswa;

    const chunkSize = 120; // 3 ops per student = 360 < 500
    for (let i = 0; i < targets.length; i += chunkSize) {
      const batch = writeBatch(db);
      targets.slice(i, i + chunkSize).forEach((s) => {
        const compositeId = `${paket.id}__${s.id}`;
        batch.update(doc(db, 'siswa', s.id), {
          status_ujian: 'Belum',
          updated_at: serverTimestamp(),
        });
        batch.delete(doc(db, 'hasil', compositeId));
        batch.delete(doc(db, 'progres', compositeId));
      });
      await batch.commit();
    }
    return targets.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'reset_peserta');
  }
}

export async function forceFinishSiswa(
  paket: PaketUjian,
  siswa: Siswa,
  progres: ProgresUjian | undefined,
  questions: SoalLengkap[]
): Promise<void> {
  const compositeId = `${paket.id}__${siswa.id}`;
  const ans = progres?.jawaban || {};
  const scored = calculateExamScore(questions, ans);

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'hasil', compositeId), {
      paket_id: paket.id,
      paket: paket.nama_paket_soal,
      siswa_id: siswa.id,
      nama_siswa: siswa.nama_siswa,
      kelas: siswa.kelas,
      nilai_akhir: scored.nilai,
      total_benar: scored.benar,
      total_salah: scored.salah,
      pelanggaran_tab: progres?.pelanggaran || 0,
      detail_jawaban: ans,
      status_penilaian: 'dinilai',
      created_at: serverTimestamp(),
    });
    batch.delete(doc(db, 'progres', compositeId));
    batch.update(doc(db, 'siswa', siswa.id), {
      status_ujian: 'Selesai',
      updated_at: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `hasil/${compositeId}`);
  }
}

export async function rescoreHasil(
  paket: PaketUjian,
  questions: SoalLengkap[],
  hasilList: HasilUjian[]
): Promise<number> {
  let count = 0;
  const chunkSize = 400;
  try {
    for (let i = 0; i < hasilList.length; i += chunkSize) {
      const batch = writeBatch(db);
      hasilList.slice(i, i + chunkSize).forEach((h) => {
        const scored = calculateExamScore(questions, h.detail_jawaban || {});
        batch.update(doc(db, 'hasil', h.id), {
          nilai_akhir: scored.nilai,
          total_benar: scored.benar,
          total_salah: scored.salah,
          status_penilaian: 'dinilai',
        });
        count++;
      });
      await batch.commit();
    }
    return count;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'hasil');
  }
}

// Real-time listeners for Pantau & Live Score
export function subscribeMonitorPaket(
  paketId: string,
  callbacks: {
    onProgres: (list: ProgresUjian[]) => void;
    onHasil: (list: HasilUjian[]) => void;
    onSiswa: (list: Siswa[]) => void;
  }
): Unsubscribe {
  const qProg = query(collection(db, 'progres'), where('paket_id', '==', paketId));
  const qHasil = query(collection(db, 'hasil'), where('paket_id', '==', paketId));

  const u1 = onSnapshot(
    qProg,
    (snap) => {
      callbacks.onProgres(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            paket_id: String(x.paket_id || ''),
            paket_nama: String(x.paket_nama || ''),
            siswa_id: String(x.siswa_id || ''),
            nama_siswa: String(x.nama_siswa || ''),
            kelas: String(x.kelas || ''),
            jawaban: (x.jawaban || {}) as Record<string, AnswerValue>,
            ragu: (x.ragu || {}) as Record<string, boolean>,
            current_index: Number(x.current_index) || 0,
            sisa_detik: Number(x.sisa_detik) || 0,
            pelanggaran: Number(x.pelanggaran) || 0,
            updated_at: x.updated_at?.toDate ? x.updated_at.toDate() : null,
          };
        })
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'progres')
  );

  const u2 = onSnapshot(
    qHasil,
    (snap) => {
      callbacks.onHasil(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            paket_id: String(x.paket_id || ''),
            paket: String(x.paket || ''),
            siswa_id: String(x.siswa_id || ''),
            nama_siswa: String(x.nama_siswa || ''),
            kelas: String(x.kelas || ''),
            nilai_akhir: Number(x.nilai_akhir) || 0,
            total_benar: Number(x.total_benar) || 0,
            total_salah: Number(x.total_salah) || 0,
            pelanggaran_tab: Number(x.pelanggaran_tab) || 0,
            detail_jawaban: (x.detail_jawaban || {}) as Record<string, AnswerValue>,
            status_penilaian: x.status_penilaian === 'menunggu' ? 'menunggu' : 'dinilai',
            created_at: x.created_at?.toDate ? x.created_at.toDate() : null,
          };
        })
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'hasil')
  );

  const u3 = onSnapshot(
    collection(db, 'siswa'),
    (snap) => {
      callbacks.onSiswa(
        snap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id,
              nama_siswa: String(x.nama_siswa || ''),
              nama_key: String(x.nama_key || d.id),
              kelas: String(x.kelas || ''),
              status_ujian: String(x.status_ujian || 'Belum'),
              status_akun: (x.status_akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif') as 'Aktif' | 'Nonaktif',
            };
          })
          .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama_siswa.localeCompare(b.nama_siswa))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'siswa')
  );

  return () => {
    u1();
    u2();
    u3();
  };
}

export function subscribeMonitorAll(callbacks: {
  onProgres: (list: ProgresUjian[]) => void;
  onHasil: (list: HasilUjian[]) => void;
  onSiswa: (list: Siswa[]) => void;
}): Unsubscribe {
  const u1 = onSnapshot(
    collection(db, 'progres'),
    (snap) => {
      callbacks.onProgres(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            paket_id: String(x.paket_id || ''),
            paket_nama: String(x.paket_nama || ''),
            siswa_id: String(x.siswa_id || ''),
            nama_siswa: String(x.nama_siswa || ''),
            kelas: String(x.kelas || ''),
            jawaban: (x.jawaban || {}) as Record<string, AnswerValue>,
            ragu: (x.ragu || {}) as Record<string, boolean>,
            current_index: Number(x.current_index) || 0,
            sisa_detik: Number(x.sisa_detik) || 0,
            pelanggaran: Number(x.pelanggaran) || 0,
            updated_at: x.updated_at?.toDate ? x.updated_at.toDate() : null,
          };
        })
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'progres')
  );

  const u2 = onSnapshot(
    collection(db, 'hasil'),
    (snap) => {
      callbacks.onHasil(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            paket_id: String(x.paket_id || ''),
            paket: String(x.paket || ''),
            siswa_id: String(x.siswa_id || ''),
            nama_siswa: String(x.nama_siswa || ''),
            kelas: String(x.kelas || ''),
            nilai_akhir: Number(x.nilai_akhir) || 0,
            total_benar: Number(x.total_benar) || 0,
            total_salah: Number(x.total_salah) || 0,
            pelanggaran_tab: Number(x.pelanggaran_tab) || 0,
            detail_jawaban: (x.detail_jawaban || {}) as Record<string, AnswerValue>,
            status_penilaian: x.status_penilaian === 'menunggu' ? 'menunggu' : 'dinilai',
            created_at: x.created_at?.toDate ? x.created_at.toDate() : null,
          };
        })
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'hasil')
  );

  const u3 = onSnapshot(
    collection(db, 'siswa'),
    (snap) => {
      callbacks.onSiswa(
        snap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id,
              nama_siswa: String(x.nama_siswa || ''),
              nama_key: String(x.nama_key || d.id),
              kelas: String(x.kelas || ''),
              status_ujian: String(x.status_ujian || 'Belum'),
              status_akun: (x.status_akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif') as
                | 'Aktif'
                | 'Nonaktif',
            };
          })
          .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama_siswa.localeCompare(b.nama_siswa))
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'siswa')
  );

  return () => {
    u1();
    u2();
    u3();
  };
}

// ===== Seed Sample Data (matching Code.gs setupDatabase) =====
export async function seedSampleDatabase(): Promise<void> {
  const batch = writeBatch(db);

  batch.set(doc(db, 'pengaturan', 'global'), {
    ...DEFAULT_PENGATURAN,
    updated_at: serverTimestamp(),
  });

  DEFAULT_TATA_TERTIB.forEach((teks, idx) => {
    const no = idx + 1;
    batch.set(doc(db, 'tata_tertib', `tib_${no}`), {
      no,
      teks,
      updated_at: serverTimestamp(),
    });
  });

  const samplePakets = [
    {
      id: 'pkt_mtk_6',
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
      id: 'pkt_ipa_6',
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
      id: 'pkt_bin_6',
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

  samplePakets.forEach((p) => {
    const { id, ...rest } = p;
    batch.set(doc(db, 'paket', id), { ...rest, updated_at: serverTimestamp() });
    batch.set(doc(db, 'paket_tokens', p.token_paket_soal), {
      paket_id: id,
      ...rest,
      updated_at: serverTimestamp(),
    });
  });

  const sampleSoal = [
    {
      id: 'S1',
      paket_id: 'pkt_mtk_6',
      paket: 'Matematika Kelas 6',
      nomor_soal: 1,
      jenis_soal: 'PG',
      teks_stimulus:
        'Bu Ani membeli 3 kg apel seharga Rp25.000 per kg dan 2 kg jeruk seharga Rp20.000 per kg di pasar.',
      gambar_stimulus_url: '/src/assets/images/soal_apel_jeruk_1795224176339.jpg',
      teks_soal: 'Berapa total uang yang harus dibayar Bu Ani?',
      gambar_soal_url: '',
      pilihan_a: 'Rp95.000',
      pilihan_b: 'Rp105.000',
      pilihan_c: 'Rp115.000',
      pilihan_d: 'Rp125.000',
      kunci_jawaban: 'C',
      pembahasan: 'Apel: 3 x 25.000 = 75.000. Jeruk: 2 x 20.000 = 40.000. Total = 115.000.',
      bobot: 10,
      tka_mapel: 'Matematika',
      tka_elemen: 'Bilangan',
      tka_subelemen: 'Bilangan Rasional',
      tka_indikator: 'Operasi penjumlahan, pengurangan, perkalian, dan pembagian bilangan cacah',
    },
    {
      id: 'S2',
      paket_id: 'pkt_mtk_6',
      paket: 'Matematika Kelas 6',
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
      tka_mapel: 'Matematika',
      tka_elemen: 'Bilangan',
      tka_subelemen: 'Bilangan Rasional',
      tka_indikator: 'Kelipatan, faktor, KPK, dan FPB bilangan asli',
    },
    {
      id: 'S3',
      paket_id: 'pkt_mtk_6',
      paket: 'Matematika Kelas 6',
      nomor_soal: 3,
      jenis_soal: 'PGK Kategori:Benar/Salah',
      teks_stimulus:
        'Kebun Pak Budi berbentuk persegi panjang dengan panjang 20 m dan lebar 15 m.',
      gambar_stimulus_url: '/src/assets/images/soal_kebun_persegi_1795224175539.jpg',
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
      tka_mapel: 'Matematika',
      tka_elemen: 'Geometri dan Pengukuran',
      tka_subelemen: 'Pengukuran',
      tka_indikator: 'Keliling dan luas bangun datar (segitiga, segiempat, dan segi banyak)',
    },
  ];

  sampleSoal.forEach((s) => {
    batch.set(doc(db, 'soal', s.id), {
      id_soal: s.id,
      paket_id: s.paket_id,
      paket: s.paket,
      nomor_soal: s.nomor_soal,
      jenis_soal: s.jenis_soal,
      teks_stimulus: s.teks_stimulus,
      gambar_stimulus_url: s.gambar_stimulus_url,
      teks_soal: s.teks_soal,
      gambar_soal_url: s.gambar_soal_url,
      pilihan_a: s.pilihan_a,
      pilihan_b: s.pilihan_b,
      pilihan_c: s.pilihan_c,
      pilihan_d: s.pilihan_d,
      bobot: s.bobot,
      aktif: true,
      tka_mapel: s.tka_mapel,
      tka_elemen: s.tka_elemen,
      tka_subelemen: s.tka_subelemen,
      tka_indikator: s.tka_indikator,
      updated_at: serverTimestamp(),
    });
    batch.set(doc(db, 'soal_kunci', s.id), {
      id_soal: s.id,
      paket_id: s.paket_id,
      kunci_jawaban: s.kunci_jawaban,
      pembahasan: s.pembahasan,
      bobot: s.bobot,
      rilis_kunci: true,
      updated_at: serverTimestamp(),
    });
  });

  const sampleSiswa = [
    { nama: 'Andi Saputra', kelas: '6A' },
    { nama: 'Siti Rahma', kelas: '6A' },
    { nama: 'Budi Santoso', kelas: '6B' },
  ];
  sampleSiswa.forEach((s) => {
    const key = slugifyName(s.nama);
    batch.set(doc(db, 'siswa', key), {
      nama_siswa: s.nama,
      nama_key: key,
      kelas: s.kelas,
      status_ujian: 'Belum',
      status_akun: 'Aktif',
      updated_at: serverTimestamp(),
    });
  });

  await batch.commit();
}

// ===== 1-Click Migration from Old Google Apps Script Web App =====
async function callLegacyGas(apiUrl: string, fn: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(apiUrl.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn, args }),
    redirect: 'follow',
  });
  const text = await res.text();
  let json: { ok?: boolean; data?: unknown; error?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Respons Apps Script tidak valid. Pastikan URL /exec dan akses "Anyone".');
  }
  if (!json.ok) {
    throw new Error(json.error || 'Gagal membaca data dari Apps Script.');
  }
  return json.data;
}

function shortHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseLegacyDate(raw: unknown): Date {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 100000) {
    // Excel serial date
    return new Date(Math.round((raw - 25569) * 86400 * 1000));
  }
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return new Date();
  // Format "YYYY-MM-DD HH:mm:ss" or ISO
  const isoCandidate = s.includes('T') ? s : s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
  const direct = Date.parse(isoCandidate);
  if (!Number.isNaN(direct)) return new Date(direct);
  // Format "DD/MM/YYYY[ ,]HH[:.]mm[:.]ss"
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,\s]+(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?)?/);
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
  return new Date();
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

export async function importPelanggaranBatch(
  rawRows: Record<string, unknown>[],
  paketsInput?: PaketUjian[]
): Promise<{ added: number; skipped: number }> {
  try {
    const pakets = paketsInput || (await listPaket());
    const paketByName = new Map<string, PaketUjian>();
    pakets.forEach((p) => {
      paketByName.set(p.nama_paket_soal.trim().toLowerCase(), p);
    });

    const existingSnap = await getDocs(collection(db, 'pelanggaran'));
    const existingIds = new Set(existingSnap.docs.map((d) => d.id));

    const seenCounts = new Map<string, number>();
    const toWrite: Array<{
      id: string;
      data: {
        siswa_id: string;
        nama_siswa: string;
        kelas: string;
        paket_id: string;
        paket_nama: string;
        jenis_pelanggaran: string;
        status_ujian: string;
        created_at: Timestamp;
      };
    }> = [];
    let skipped = 0;

    for (const row of rawRows || []) {
      const nama = String(
        getRowField(row, ['Nama_Siswa', 'Nama Siswa', 'nama_siswa', 'Nama'])
      ).trim();
      if (!nama) {
        skipped++;
        continue;
      }
      const kelas =
        String(getRowField(row, ['Kelas', 'kelas'])).trim() || '-';
      const jenis =
        String(
          getRowField(row, ['Jenis_Pelanggaran', 'Jenis Pelanggaran', 'jenis_pelanggaran', 'Jenis'])
        ).trim() || 'Pelanggaran Ujian';
      const statusUjian = String(
        getRowField(row, ['Status_Ujian', 'Status Ujian', 'status_ujian', 'Status'])
      ).trim();
      const rawWaktu = getRowField(row, [
        'Waktu_Kejadian',
        'Waktu Kejadian',
        'Timestamp',
        'Waktu',
        'created_at',
      ]);
      const waktuStr = String(rawWaktu ?? '').trim();
      const parsedDate = parseLegacyDate(rawWaktu);

      let paketNama = String(
        getRowField(row, ['Paket', 'Paket Ujian', 'Paket_Ujian', 'Nama_Paket_Soal', 'paket_nama'])
      ).trim();
      if (!paketNama && statusUjian) {
        const matchSedang = statusUjian.match(/^sedang\s+ujian\s*:\s*(.+)$/i);
        if (matchSedang && matchSedang[1]) {
          paketNama = matchSedang[1].trim();
        }
      }

      const matchedPaket = paketNama
        ? paketByName.get(paketNama.toLowerCase()) ||
          pakets.find((p) =>
            paketNama.toLowerCase().includes(p.nama_paket_soal.trim().toLowerCase())
          )
        : undefined;

      const paketId = matchedPaket ? matchedPaket.id : '';
      const resolvedPaketNama = matchedPaket
        ? matchedPaket.nama_paket_soal
        : paketNama || (statusUjian && !/^(belum|selesai)$/i.test(statusUjian) ? statusUjian : '-');

      const siswaId = slugifyName(nama).slice(0, 120);
      const sig = `${siswaId}|${kelas}|${jenis}|${waktuStr}|${statusUjian}|${resolvedPaketNama}`;
      const occ = seenCounts.get(sig) || 0;
      seenCounts.set(sig, occ + 1);
      const docId = `mig_${shortHash(`${sig}#${occ}`)}`;

      if (existingIds.has(docId)) {
        skipped++;
        continue;
      }
      existingIds.add(docId);

      toWrite.push({
        id: docId,
        data: {
          siswa_id: siswaId,
          nama_siswa: nama.slice(0, 120),
          kelas: kelas.slice(0, 40),
          paket_id: paketId.slice(0, 128),
          paket_nama: resolvedPaketNama.slice(0, 160),
          jenis_pelanggaran: jenis.slice(0, 160),
          status_ujian: statusUjian.slice(0, 200),
          created_at: Timestamp.fromDate(parsedDate),
        },
      });
    }

    const chunkSize = 400;
    for (let i = 0; i < toWrite.length; i += chunkSize) {
      const batch = writeBatch(db);
      toWrite.slice(i, i + chunkSize).forEach((item) => {
        batch.set(doc(db, 'pelanggaran', item.id), item.data);
      });
      await batch.commit();
    }

    return { added: toWrite.length, skipped };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'pelanggaran');
  }
}

export async function migratePelanggaranFromGas(
  apiUrl: string,
  legacyPassword: string
): Promise<{ added: number; skipped: number }> {
  const valid = await callLegacyGas(apiUrl, 'verifyAdminLogin', [legacyPassword]);
  if (!valid) {
    throw new Error('Password admin Apps Script salah.');
  }
  const rawLog = (await callLegacyGas(apiUrl, 'admin', [
    legacyPassword,
    'list',
    { k: 'log' },
  ])) as Record<string, unknown>[];
  return importPelanggaranBatch(rawLog || []);
}

export async function migrateFromLegacyGas(
  apiUrl: string,
  legacyPassword: string,
  onProgress?: (msg: string) => void
): Promise<{ paket: number; soal: number; siswa: number; hasil: number; pelanggaran: number }> {
  onProgress?.('Memeriksa koneksi ke Apps Script...');
  const valid = await callLegacyGas(apiUrl, 'verifyAdminLogin', [legacyPassword]);
  if (!valid) {
    throw new Error('Password admin Apps Script salah.');
  }

  onProgress?.('Mengambil pengaturan, paket, soal, siswa, hasil, dan log pelanggaran...');
  const [settings, rawPaket, rawSoal, rawSiswa, rawHasil, rawLog] = (await Promise.all([
    callLegacyGas(apiUrl, 'getSettings', []),
    callLegacyGas(apiUrl, 'admin', [legacyPassword, 'list', { k: 'paket' }]),
    callLegacyGas(apiUrl, 'admin', [legacyPassword, 'list', { k: 'soal' }]),
    callLegacyGas(apiUrl, 'admin', [legacyPassword, 'list', { k: 'siswa' }]),
    callLegacyGas(apiUrl, 'admin', [legacyPassword, 'list', { k: 'hasil' }]),
    callLegacyGas(apiUrl, 'admin', [legacyPassword, 'list', { k: 'log' }]).catch(() => []),
  ])) as [
    Record<string, string>,
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[]
  ];

  if (settings && settings.judul) {
    onProgress?.('Menyimpan pengaturan sekolah...');
    await savePengaturan({
      judul: String(settings.judul || DEFAULT_PENGATURAN.judul),
      subjudul: String(settings.subjudul ?? DEFAULT_PENGATURAN.subjudul),
      judul_admin: String(settings.judul_admin || 'Admin CBT'),
      subjudul_admin: String(settings.subjudul_admin ?? ''),
      logo: String(settings.logo || ''),
    });
  }

  const paketMap = new Map<string, PaketUjian>();
  let paketCount = 0;
  onProgress?.(`Memigrasikan ${rawPaket.length} paket soal...`);
  for (const p of rawPaket || []) {
    const nama = String(p.Nama_Paket_Soal || '').trim();
    if (!nama) continue;
    const token = String(p.Token_Paket_Soal || generateRandomToken())
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
    const id = `pkt_${slugifyName(nama).slice(0, 60)}`;
    const paketObj: PaketUjian = {
      id,
      nama_paket_soal: nama,
      mata_pelajaran: String(p.Mata_Pelajaran || 'Umum').trim() || 'Umum',
      durasi_menit: Number(p['Durasi_(Menit)']) || 60,
      status: p.Status === 'Aktif' ? 'Aktif' : 'Nonaktif',
      token_paket_soal: token,
      waktu_mulai: String(p.Waktu_Mulai || ''),
      waktu_berakhir: String(p.Waktu_Berakhir || ''),
      tampilkan_nilai: true,
      acak_soal: false,
    };
    await savePaket(paketObj);
    paketMap.set(nama.toLowerCase(), paketObj);
    paketCount++;
  }

  onProgress?.(`Memigrasikan ${rawSoal.length} butir soal...`);
  let soalCount = 0;
  for (const [namaLower, pkt] of paketMap.entries()) {
    const matching = (rawSoal || []).filter(
      (q) => String(q.Paket || '').trim().toLowerCase() === namaLower
    );
    if (matching.length > 0) {
      await importSoalBatch(
        matching.map((q, idx) => ({
          id_soal: safeDocId(q.ID_Soal || `S_${pkt.id}_${idx + 1}`),
          nomor_soal: Number(q.Nomor_Soal) || idx + 1,
          jenis_soal: String(q.Jenis_Soal || 'PG'),
          teks_stimulus: String(q.Teks_Stimulus || ''),
          gambar_stimulus_url: String(q.Gambar_Stimulus_URL || ''),
          teks_soal: String(q.Teks_Soal || ''),
          gambar_soal_url: String(q.Gambar_Soal_URL || ''),
          pilihan_a: String(q.Pilihan_A || ''),
          pilihan_b: String(q.Pilihan_B || ''),
          pilihan_c: String(q.Pilihan_C || ''),
          pilihan_d: String(q.Pilihan_D || ''),
          kunci_jawaban: String(q.Kunci_Jawaban || ''),
          pembahasan: String(q.Pembahasan || ''),
          bobot: Number(q.Bobot) || 1,
        })),
        pkt
      );
      soalCount += matching.length;
    }
  }

  onProgress?.(`Memigrasikan ${rawSiswa.length} data siswa...`);
  const existingSiswa = await listSiswa();
  const resSiswa = await importSiswaBatch(
    (rawSiswa || []).map((s) => ({
      nama_siswa: String(s.Nama_Siswa || ''),
      kelas: String(s.Kelas || '-'),
      status_akun: String(s.Status_Akun || 'Aktif'),
    })),
    existingSiswa
  );

  onProgress?.(`Memigrasikan ${rawHasil.length} riwayat hasil ujian...`);
  let hasilCount = 0;
  const hasilItems = (rawHasil || []).filter((h) => {
    const pName = String(h.Paket || '').trim().toLowerCase();
    return paketMap.has(pName) && String(h.Nama_Siswa || '').trim() !== '';
  });

  const chunkSize = 400;
  for (let i = 0; i < hasilItems.length; i += chunkSize) {
    const batch = writeBatch(db);
    hasilItems.slice(i, i + chunkSize).forEach((h) => {
      const pkt = paketMap.get(String(h.Paket || '').trim().toLowerCase())!;
      const siswaId = slugifyName(h.Nama_Siswa);
      const docId = `${pkt.id}__${siswaId}`;
      let detail: Record<string, AnswerValue> = {};
      try {
        detail = JSON.parse(String(h.Detail_Jawaban_JSON || '{}'));
      } catch {
        detail = {};
      }
      batch.set(doc(db, 'hasil', docId), {
        paket_id: pkt.id,
        paket: pkt.nama_paket_soal,
        siswa_id: siswaId,
        nama_siswa: String(h.Nama_Siswa),
        kelas: String(h.Kelas || '-'),
        nilai_akhir: Number(h.Nilai_Akhir) || 0,
        total_benar: Number(h.Total_Benar) || 0,
        total_salah: Number(h.Total_Salah) || 0,
        pelanggaran_tab: Number(h.Pelanggaran_Tab) || 0,
        detail_jawaban: detail,
        status_penilaian: 'dinilai',
        created_at: serverTimestamp(),
      });
      hasilCount++;
    });
    await batch.commit();
  }

  onProgress?.(`Memigrasikan ${(rawLog || []).length} log pelanggaran...`);
  const resPel = await importPelanggaranBatch(rawLog || [], Array.from(paketMap.values()));

  return {
    paket: paketCount,
    soal: soalCount,
    siswa: resSiswa.added,
    hasil: hasilCount,
    pelanggaran: resPel.added,
  };
}
