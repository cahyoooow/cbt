export type QuestionType = 'PG' | 'PGK MCMA' | string; // e.g. 'PGK Kategori:Benar/Salah'

export interface Pengaturan {
  judul: string;
  subjudul: string;
  judul_admin: string;
  subjudul_admin: string;
  logo: string;
}

export interface TataTertib {
  id: string;
  no: number;
  teks: string;
}

export interface PaketUjian {
  id: string;
  nama_paket_soal: string;
  mata_pelajaran: string;
  durasi_menit: number;
  status: 'Aktif' | 'Nonaktif';
  token_paket_soal: string;
  waktu_mulai: string;
  waktu_berakhir: string;
  tampilkan_nilai: boolean;
  acak_soal: boolean;
  jumlah_soal?: number;
  jumlah_bobot?: number;
}

export interface SoalPublik {
  id: string;
  id_soal: string;
  paket_id: string;
  paket: string;
  nomor_soal: number;
  jenis_soal: QuestionType;
  teks_stimulus: string;
  gambar_stimulus_url: string;
  teks_soal: string;
  gambar_soal_url: string;
  pilihan_a: string;
  pilihan_b: string;
  pilihan_c: string;
  pilihan_d: string;
  bobot: number;
  aktif: boolean;
  tka_mapel?: string;
  tka_elemen?: string;
  tka_subelemen?: string;
  tka_indikator?: string;
}

export interface SoalKunci {
  id: string;
  id_soal: string;
  paket_id: string;
  kunci_jawaban: string;
  pembahasan: string;
  bobot: number;
  rilis_kunci: boolean;
}

export interface SoalLengkap extends SoalPublik {
  kunci_jawaban: string;
  pembahasan: string;
  rilis_kunci: boolean;
}

export interface Siswa {
  id: string;
  nama_siswa: string;
  nama_key: string;
  kelas: string;
  status_ujian: string;
  status_akun: 'Aktif' | 'Nonaktif';
}

export type AnswerValue = string | string[];

export interface ProgresUjian {
  id: string;
  paket_id: string;
  paket_nama: string;
  siswa_id: string;
  nama_siswa: string;
  kelas: string;
  jawaban: Record<string, AnswerValue>;
  ragu: Record<string, boolean>;
  current_index: number;
  sisa_detik: number;
  pelanggaran: number;
  updated_at?: Date | null;
}

export interface HasilUjian {
  id: string;
  paket_id: string;
  paket: string;
  siswa_id: string;
  nama_siswa: string;
  kelas: string;
  nilai_akhir: number;
  total_benar: number;
  total_salah: number;
  pelanggaran_tab: number;
  detail_jawaban: Record<string, AnswerValue>;
  status_penilaian: 'dinilai' | 'menunggu';
  created_at?: Date | null;
}

export interface LogPelanggaran {
  id: string;
  siswa_id: string;
  nama_siswa: string;
  kelas: string;
  paket_id: string;
  paket_nama: string;
  jenis_pelanggaran: string;
  status_ujian: string;
  created_at?: Date | null;
}

export interface AdminUser {
  id: string;
  email: string;
  nama: string;
  role: 'superadmin' | 'admin';
}

export interface AdminPassLabel {
  id: string;
  label: string;
  verifier: string;
  created_at?: Date | null;
}

export interface ReviewItem {
  id_soal: string;
  no: number;
  soal: string;
  jawab: string;
  kunci: string;
  skor: number;
  maks: number;
  benar: boolean;
  pembahasan: string;
}

export interface ExamSubmitResult {
  nilai: number;
  benar: number;
  salah: number;
  tampilkan_nilai: boolean;
  rev: ReviewItem[];
}

export interface ActiveStudentSession {
  siswa: Siswa;
  paket: PaketUjian;
  tib: TataTertib[];
  resume: boolean;
  progres: ProgresUjian | null;
}

export type AdminTab =
  | 'dash'
  | 'paket'
  | 'soal'
  | 'siswa'
  | 'ujian'
  | 'pantau'
  | 'live'
  | 'jwb'
  | 'hasil'
  | 'matriks'
  | 'butir'
  | 'tka'
  | 'pelanggaran'
  | 'akun'
  | 'set';
