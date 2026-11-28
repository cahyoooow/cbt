import { signInWithPopup, signOut } from 'firebase/auth';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import {
  getTataTertib,
  importPelanggaranBatch,
  importSiswaBatch,
  importSoalBatch,
  listHasil,
  listPaket,
  listSiswa,
  listSoalLengkap,
  savePaket,
  saveSoal,
  saveTataTertibList,
  updateSoalTkaBatch,
} from './cbtService';
import { callGasAdmin } from './gasClient';
import type { PaketUjian, SoalLengkap } from '../types/cbt';
import { slugifyName } from '../utils/mathFormat';

export interface FirebaseSyncSummary {
  paket: number;
  soal: number;
  siswa: number;
  hasil: number;
  pelanggaran: number;
}

function toDateFromFirestore(val: unknown): Date {
  if (val instanceof Timestamp) return val.toDate();
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function formatFirebaseError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  if (/quota|resource-exhausted|free daily read/i.test(raw)) {
    return new Error(
      'Kuota baca harian Firebase sedang habis (reset otomatis tiap hari sekitar pukul 15.00 WIB). Data di Spreadsheet tetap aman; silakan coba tarik data Firebase lagi setelah kuota reset.'
    );
  }
  if (/popup-closed-by-user/i.test(raw)) {
    return new Error('Login Google dibatalkan sebelum selesai.');
  }
  if (/popup-blocked/i.test(raw)) {
    return new Error('Popup login Google diblokir browser. Izinkan popup lalu coba lagi.');
  }
  if (/unauthorized-domain/i.test(raw)) {
    return new Error(
      'Domain aplikasi ini belum masuk Authorized Domains di Firebase Authentication (gunakan alamat AI Studio/localhost yang terdaftar atau tambahkan domain di Firebase Console).'
    );
  }
  if (/permission-denied|insufficient permissions/i.test(raw)) {
    return new Error(
      'Akun Google yang dipilih tidak memiliki akses admin Firebase. Gunakan akun Google admin utama (cahyoooow@gmail.com).'
    );
  }
  return err instanceof Error ? err : new Error(raw);
}

export async function syncLatestFirebaseToGas(
  onProgress?: (msg: string) => void
): Promise<FirebaseSyncSummary> {
  onProgress?.('Meminta login akun Google admin Firebase...');

  try {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      throw formatFirebaseError(err);
    }

    onProgress?.('Membaca data terbaru dari Firebase Firestore...');

    let paketSnap, soalSnap, kunciSnap, siswaSnap, hasilSnap, logSnap, tibSnap;
    try {
      [paketSnap, soalSnap, kunciSnap, siswaSnap, hasilSnap, logSnap, tibSnap] = await Promise.all([
        getDocs(collection(db, 'paket')),
        getDocs(collection(db, 'soal')),
        getDocs(collection(db, 'soal_kunci')),
        getDocs(collection(db, 'siswa')),
        getDocs(collection(db, 'hasil')),
        getDocs(collection(db, 'pelanggaran')),
        getDocs(collection(db, 'tata_tertib')),
      ]);
    } catch (err) {
      throw formatFirebaseError(err);
    }

    // 1. Sinkronkan Tata Tertib jika ada di Firestore dan belum ada kustomisasi lokal
    if (!tibSnap.empty) {
      const fbTibs = tibSnap.docs
        .map((d) => d.data())
        .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0))
        .map((d, idx) => ({ no: Number(d.no) || idx + 1, teks: String(d.teks || '').trim() }))
        .filter((d) => d.teks);
      if (fbTibs.length > 0) {
        const existingTibs = await getTataTertib();
        const existingSet = new Set(existingTibs.map((t) => t.teks.trim()));
        const missingTibs = fbTibs.filter((t) => !existingSet.has(t.teks));
        if (missingTibs.length > 0) {
          const merged = [
            ...existingTibs.map((t) => ({ no: t.no, teks: t.teks })),
            ...missingTibs,
          ].map((item, idx) => ({ no: idx + 1, teks: item.teks }));
          await saveTataTertibList(merged);
        }
      }
    }

    // 2. Sinkronkan Paket Ujian
    onProgress?.('Menyinkronkan paket ujian ke Google Spreadsheet...');
    const existingPakets = await listPaket();
    const gasPaketByName = new Map(
      existingPakets.map((p) => [p.nama_paket_soal.trim().toLowerCase(), p])
    );
    const fbPaketIdToName = new Map<string, string>();
    let paketSynced = 0;

    for (const docSnap of paketSnap.docs) {
      const d = docSnap.data();
      const nama = String(d.nama_paket_soal || '').trim();
      if (!nama) continue;
      fbPaketIdToName.set(docSnap.id, nama);

      const existing = gasPaketByName.get(nama.toLowerCase());
      const nextDurasi = Number(d.durasi_menit) || 60;
      const nextStatus: 'Aktif' | 'Nonaktif' = d.status === 'Aktif' ? 'Aktif' : 'Nonaktif';
      const nextToken = String(d.token_paket_soal || existing?.token_paket_soal || '').trim();
      const nextMapel = String(d.mata_pelajaran || existing?.mata_pelajaran || '').trim();
      const nextMulai = String(d.waktu_mulai || existing?.waktu_mulai || '');
      const nextBerakhir = String(d.waktu_berakhir || existing?.waktu_berakhir || '');
      const nextTampil = d.tampilkan_nilai !== false;
      const nextAcak = d.acak_soal === true;

      const changed =
        !existing ||
        existing.mata_pelajaran !== nextMapel ||
        existing.durasi_menit !== nextDurasi ||
        existing.status !== nextStatus ||
        existing.token_paket_soal !== nextToken ||
        existing.waktu_mulai !== nextMulai ||
        existing.waktu_berakhir !== nextBerakhir ||
        existing.tampilkan_nilai !== nextTampil ||
        existing.acak_soal !== nextAcak;

      if (changed) {
        await savePaket({
          id: existing?.id,
          nama_paket_soal: nama,
          mata_pelajaran: nextMapel || 'Umum',
          durasi_menit: nextDurasi,
          status: nextStatus,
          token_paket_soal: nextToken,
          waktu_mulai: nextMulai,
          waktu_berakhir: nextBerakhir,
          tampilkan_nilai: nextTampil,
          acak_soal: nextAcak,
        });
        paketSynced++;
      }
    }

    const latestPakets = await listPaket();
    const latestPaketByName = new Map(
      latestPakets.map((p) => [p.nama_paket_soal.trim().toLowerCase(), p])
    );

    // 3. Sinkronkan Bank Soal & Kunci Jawaban
    onProgress?.('Menyinkronkan soal terbaru (beserta gambar jika ada)...');
    const kunciById = new Map<string, Record<string, unknown>>();
    kunciSnap.docs.forEach((kDoc) => {
      const kd = kDoc.data();
      const id = String(kd.id_soal || kDoc.id).trim();
      kunciById.set(id, kd);
    });

    const existingSoal = await listSoalLengkap();
    const existingSoalById = new Map(
      existingSoal.map((s) => [s.id_soal.trim().toLowerCase(), s])
    );

    const newSoalByPaketName = new Map<string, { paket: PaketUjian; items: Partial<SoalLengkap>[] }>();
    const tkaUpdates: {
      id: string;
      tka_mapel: string;
      tka_elemen: string;
      tka_subelemen: string;
      tka_indikator: string;
    }[] = [];
    let soalSynced = 0;

    for (const sDoc of soalSnap.docs) {
      const sd = sDoc.data();
      const idSoal = String(sd.id_soal || sDoc.id).trim();
      if (!idSoal) continue;
      const kd = kunciById.get(idSoal) || {};

      const paketNama = String(sd.paket || fbPaketIdToName.get(String(sd.paket_id || '')) || '').trim();
      if (!paketNama) continue;

      let targetPaket = latestPaketByName.get(paketNama.toLowerCase());
      if (!targetPaket) {
        await savePaket({
          nama_paket_soal: paketNama,
          mata_pelajaran: 'Umum',
          durasi_menit: 60,
          status: 'Nonaktif',
          token_paket_soal: '',
          waktu_mulai: '',
          waktu_berakhir: '',
          tampilkan_nilai: true,
          acak_soal: false,
        });
        const refreshed = await listPaket();
        refreshed.forEach((p) => latestPaketByName.set(p.nama_paket_soal.trim().toLowerCase(), p));
        targetPaket = latestPaketByName.get(paketNama.toLowerCase());
        paketSynced++;
      }
      if (!targetPaket) continue;

      const tkaMapel = String(sd.tka_mapel || '');
      const tkaElemen = String(sd.tka_elemen || '');
      const tkaSubelemen = String(sd.tka_subelemen || '');
      const tkaIndikator = String(sd.tka_indikator || '');
      if (tkaMapel || tkaElemen || tkaSubelemen || tkaIndikator) {
        tkaUpdates.push({
          id: idSoal,
          tka_mapel: tkaMapel,
          tka_elemen: tkaElemen,
          tka_subelemen: tkaSubelemen,
          tka_indikator: tkaIndikator,
        });
      }

      const candidate: Omit<SoalLengkap, 'id'> & { id?: string } = {
        id: idSoal,
        id_soal: idSoal,
        paket_id: targetPaket.id,
        paket: targetPaket.nama_paket_soal,
        nomor_soal: Number(sd.nomor_soal) || 1,
        jenis_soal: String(sd.jenis_soal || 'PG'),
        teks_stimulus: String(sd.teks_stimulus || ''),
        gambar_stimulus_url: String(sd.gambar_stimulus_url || ''),
        teks_soal: String(sd.teks_soal || ''),
        gambar_soal_url: String(sd.gambar_soal_url || ''),
        pilihan_a: String(sd.pilihan_a || ''),
        pilihan_b: String(sd.pilihan_b || ''),
        pilihan_c: String(sd.pilihan_c || ''),
        pilihan_d: String(sd.pilihan_d || ''),
        bobot: Number(sd.bobot ?? kd.bobot) || 1,
        aktif: sd.aktif !== false,
        tka_mapel: tkaMapel,
        tka_elemen: tkaElemen,
        tka_subelemen: tkaSubelemen,
        tka_indikator: tkaIndikator,
        kunci_jawaban: String(kd.kunci_jawaban || ''),
        pembahasan: String(kd.pembahasan || ''),
        rilis_kunci: kd.rilis_kunci !== false,
      };

      const existing = existingSoalById.get(idSoal.toLowerCase());
      if (!existing) {
        const key = targetPaket.nama_paket_soal.toLowerCase();
        const bucket = newSoalByPaketName.get(key) || { paket: targetPaket, items: [] };
        bucket.items.push(candidate);
        newSoalByPaketName.set(key, bucket);
      } else {
        const isDifferent =
          existing.paket !== candidate.paket ||
          existing.nomor_soal !== candidate.nomor_soal ||
          existing.jenis_soal !== candidate.jenis_soal ||
          existing.teks_stimulus !== candidate.teks_stimulus ||
          existing.teks_soal !== candidate.teks_soal ||
          existing.pilihan_a !== candidate.pilihan_a ||
          existing.pilihan_b !== candidate.pilihan_b ||
          existing.pilihan_c !== candidate.pilihan_c ||
          existing.pilihan_d !== candidate.pilihan_d ||
          existing.kunci_jawaban !== candidate.kunci_jawaban ||
          existing.pembahasan !== candidate.pembahasan ||
          existing.bobot !== candidate.bobot ||
          (candidate.gambar_stimulus_url.startsWith('http') &&
            existing.gambar_stimulus_url !== candidate.gambar_stimulus_url) ||
          (candidate.gambar_soal_url.startsWith('http') &&
            existing.gambar_soal_url !== candidate.gambar_soal_url);

        if (isDifferent) {
          await saveSoal(candidate, targetPaket);
          soalSynced++;
        }
      }
    }

    for (const bucket of newSoalByPaketName.values()) {
      onProgress?.(`Mengimpor ${bucket.items.length} soal baru ke paket ${bucket.paket.nama_paket_soal}...`);
      const added = await importSoalBatch(bucket.items, bucket.paket);
      soalSynced += added;
    }

    if (tkaUpdates.length > 0) {
      await updateSoalTkaBatch(tkaUpdates);
    }

    // 4. Sinkronkan Siswa Baru
    onProgress?.('Menyinkronkan data siswa terbaru...');
    const existingSiswa = await listSiswa();
    const fbSiswaRows = siswaSnap.docs.map((sDoc) => {
      const d = sDoc.data();
      return {
        nama_siswa: String(d.nama_siswa || '').trim(),
        kelas: String(d.kelas || '-').trim() || '-',
        status_akun: d.status_akun === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
      };
    });
    const siswaRes = await importSiswaBatch(fbSiswaRows, existingSiswa);

    // 5. Sinkronkan Hasil Ujian Terbaru
    onProgress?.('Menyinkronkan hasil ujian siswa...');
    const existingHasil = await listHasil();
    const gasHasilMap = new Map(
      existingHasil.map((h) => [`${h.siswa_id}|${h.paket.trim().toLowerCase()}`, h])
    );
    let hasilSynced = 0;

    for (const hDoc of hasilSnap.docs) {
      const d = hDoc.data();
      const nama = String(d.nama_siswa || '').trim();
      const paketNama = String(d.paket || '').trim();
      if (!nama || !paketNama) continue;

      const key = `${slugifyName(nama)}|${paketNama.toLowerCase()}`;
      const existing = gasHasilMap.get(key);
      const fbTime = toDateFromFirestore(d.created_at);
      const gasTime = existing?.created_at?.getTime() || 0;
      const shouldWrite = !existing || fbTime.getTime() > gasTime + 5000;

      if (shouldWrite) {
        await callGasAdmin('save', {
          k: 'hasil',
          o: {
            Timestamp: fbTime.toLocaleString('id-ID'),
            Paket: paketNama,
            Nama_Siswa: nama,
            Kelas: String(d.kelas || '-'),
            Nilai_Akhir: Number(d.nilai_akhir) || 0,
            Total_Benar: Number(d.total_benar) || 0,
            Total_Salah: Number(d.total_salah) || 0,
            Pelanggaran_Tab: Number(d.pelanggaran_tab) || 0,
            Detail_Jawaban_JSON: JSON.stringify(d.detail_jawaban || {}),
          },
        });
        hasilSynced++;
      }
    }

    // 6. Sinkronkan Log Pelanggaran
    onProgress?.('Menyinkronkan catatan pelanggaran...');
    const fbLogRows = logSnap.docs.map((lDoc) => {
      const d = lDoc.data();
      return {
        Nama_Siswa: String(d.nama_siswa || ''),
        Kelas: String(d.kelas || '-'),
        Jenis_Pelanggaran: String(d.jenis_pelanggaran || 'Pelanggaran Ujian'),
        Paket: String(d.paket_nama || ''),
        Status_Ujian: String(d.status_ujian || ''),
        Waktu: toDateFromFirestore(d.created_at).toISOString(),
      };
    });
    const logRes = await importPelanggaranBatch(fbLogRows);

    return {
      paket: paketSynced,
      soal: soalSynced,
      siswa: siswaRes.added,
      hasil: hasilSynced,
      pelanggaran: logRes.added,
    };
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}
