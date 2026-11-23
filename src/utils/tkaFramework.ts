import type { PaketUjian, SoalLengkap } from '../types/cbt';

export type TkaBidang = 'Matematika' | 'Bahasa Indonesia';

export interface TkaSubmateriRule {
  no: number;
  elemen: string; // Elemen/Materi (Matematika) atau Kompetensi (Bahasa Indonesia)
  subelemen: string; // Sub-elemen/Submateri atau Ringkasan Subkompetensi
  kompetensiDesc: string;
  indikatorList: string[];
  batasanCatatan: string;
}

export const TKA_MATEMATIKA_FRAMEWORK: TkaSubmateriRule[] = [
  {
    no: 1,
    elemen: 'Bilangan',
    subelemen: 'Bilangan Rasional',
    kompetensiDesc:
      'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait cakupan sub-elemen Bilangan Rasional.',
    indikatorList: [
      'Pecahan senilai menggunakan gambar dan simbol matematika',
      'Perbandingan dan pengurutan bilangan pecahan',
      'Relasi berbagai bentuk pecahan (pecahan sederhana, desimal, persen)',
      'Operasi penjumlahan, pengurangan, perkalian, dan pembagian bilangan cacah',
      'Operasi penjumlahan dan pengurangan bilangan pecahan, serta operasi perkalian dan pembagian bilangan pecahan dengan bilangan asli',
      'Kelipatan, faktor, KPK, dan FPB bilangan asli',
    ],
    batasanCatatan: '',
  },
  {
    no: 2,
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Objek Geometri',
    kompetensiDesc:
      'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait bentuk bangun datar serta konstruksi bangun ruang dan visualisasi spasial.',
    indikatorList: [
      'Bentuk bangun datar',
      'Konstruksi bangun ruang dan visualisasi spasial (bagian depan, atas, dan samping)',
    ],
    batasanCatatan:
      'Bangun datar mencakup segitiga, segiempat, dan segi banyak. Bangun ruang mencakup kubus, balok, dan gabungannya.',
  },
  {
    no: 2,
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    kompetensiDesc:
      'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait pengukuran panjang, volume, berat, waktu, kecepatan, keliling, luas, sudut, dan penaksiran ukuran.',
    indikatorList: [
      'Panjang benda menggunakan satuan baku dan hubungan antar-satuan baku panjang (mm, dm, cm, m, dam, hm, km)',
      'Volume benda menggunakan satuan baku dan hubungan antar-satuan baku volume (ml, dl, cl, l, dal, hl, kl)',
      'Berat benda menggunakan satuan baku dan hubungan antar-satuan baku berat (mg, dg, cg, g, dag, hg, kg)',
      'Waktu dan hubungan antar-satuan waktu (detik, menit, jam, hari, pekan, bulan, tahun)',
      'Laju perubahan (kecepatan)',
      'Keliling dan luas bangun datar (segitiga, segiempat, dan segi banyak)',
      'Volume bangun ruang (kubus, balok, dan gabungannya)',
      'Besar sudut',
      'Penaksiran ukuran',
    ],
    batasanCatatan: '',
  },
  {
    no: 3,
    elemen: 'Data',
    subelemen: 'Penyajian dan Penggunaan Data',
    kompetensiDesc:
      'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait penyajian dan penggunaan data.',
    indikatorList: [
      'Penyajian data (gambar, piktogram, diagram batang, dan tabel frekuensi)',
      'Pengambilan informasi dan penggunaan data',
    ],
    batasanCatatan: '',
  },
];

export const TKA_BAHASA_INDONESIA_FRAMEWORK: TkaSubmateriRule[] = [
  {
    no: 1,
    elemen: 'Pemahaman Tekstual',
    subelemen: 'Identifikasi Kosakata, Objek & Informasi Tersurat',
    kompetensiDesc:
      'Mengidentifikasi informasi eksplisit, kosakata umum/khusus, objek teks, dan menyusun kembali ikhtisar/bagan dari teks.',
    indikatorList: [
      'Mengidentifikasi penggunaan kosakata umum dan khusus dalam berbagai bidang',
      'Mengidentifikasi objek berdasarkan kosakata yang digunakan dalam teks fiksi atau nonfiksi',
      'Menyusun kembali informasi dari teks dalam bentuk ikhtisar/bagan',
      'Mengidentifikasi informasi tersurat dalam teks',
    ],
    batasanCatatan: '',
  },
  {
    no: 2,
    elemen: 'Pemahaman Inferensial',
    subelemen: 'Simpulan, Perubahan Unsur & Makna Ungkapan',
    kompetensiDesc:
      'Menyimpulkan gagasan, amanat, tokoh, peristiwa, perubahan sederhana, serta menjelaskan makna ungkapan dalam teks.',
    indikatorList: [
      'Menyimpulkan ide pokok, gagasan pendukung, amanat, tokoh, peristiwa, dan/atau nilai-nilai dalam teks',
      'Menyimpulkan perubahan sederhana pada objek, karakter, dan/atau latar dalam teks fiksi atau nonfiksi',
      'Menjelaskan makna ungkapan yang digunakan dalam teks',
    ],
    batasanCatatan: '',
  },
  {
    no: 3,
    elemen: 'Evaluasi dan Apresiasi',
    subelemen: 'Relevansi, Kesesuaian & Respons Emosional',
    kompetensiDesc:
      'Menilai relevansi dan kesesuaian informasi teks serta menyimpulkan respons emosional terhadap unsur teks fiksi.',
    indikatorList: [
      'Menilai relevansi peristiwa dalam teks dengan kehidupan sehari-hari berdasarkan pengalaman atau pengetahuan pribadi',
      'Menilai kesesuaian antarunsur dan/atau antarinformasi dalam teks',
      'Menyimpulkan respons emosional terhadap unsur teks fiksi',
    ],
    batasanCatatan: '',
  },
];

export function getFrameworkByBidang(bidang: TkaBidang): TkaSubmateriRule[] {
  return bidang === 'Bahasa Indonesia' ? TKA_BAHASA_INDONESIA_FRAMEWORK : TKA_MATEMATIKA_FRAMEWORK;
}

export function inferTkaBidang(paket?: PaketUjian | null, soals: SoalLengkap[] = []): TkaBidang {
  const txt = `${paket?.mata_pelajaran || ''} ${paket?.nama_paket_soal || ''}`.toLowerCase();
  if (/bahasa\s*indonesia|literasi|b\.?\s*indo|bindo|\bbin\b/.test(txt)) {
    return 'Bahasa Indonesia';
  }
  if (/matematika|numerasi|\bmtk\b|hitung/.test(txt)) {
    return 'Matematika';
  }
  // Inspect existing questions if mapel is ambiguous (e.g. "TKA" or "Try Out")
  const sample = soals
    .map((q) => `${q.teks_stimulus} ${q.teks_soal}`)
    .join(' ')
    .toLowerCase();
  const biScore = (
    sample.match(
      /paragraf|ide pokok|amanat|tokoh|ungkapan|kosakata|teks|fiksi|nonfiksi|kalimat utama|tersurat/g
    ) || []
  ).length;
  const mtkScore = (
    sample.match(
      /\{[0-9]+\/[0-9]+\}|pecahan|kelipatan|kpk|fpb|luas|keliling|kubus|balok|diagram|tabel frekuensi|sudut|kecepatan|rp[0-9]/g
    ) || []
  ).length;
  return biScore > mtkScore ? 'Bahasa Indonesia' : 'Matematika';
}

export interface TkaClassification {
  mapel: TkaBidang;
  elemen: string;
  subelemen: string;
  indikator: string;
  confidence: 'Tinggi' | 'Sedang' | 'Manual';
  reason: string;
}

interface PatternCandidate {
  elemen: string;
  subelemen: string;
  indikator: string;
  patterns: { re: RegExp; weight: number; label: string }[];
}

const MATH_PATTERNS: PatternCandidate[] = [
  {
    elemen: 'Bilangan',
    subelemen: 'Bilangan Rasional',
    indikator: 'Pecahan senilai menggunakan gambar dan simbol matematika',
    patterns: [
      { re: /pecahan senilai|senilai dengan/i, weight: 8, label: 'pecahan senilai' },
      { re: /arsir|diarsir|bagian yang diarsir/i, weight: 5, label: 'arsiran pecahan' },
      { re: /\{[0-9]+\/[0-9]+\}/, weight: 2, label: 'simbol pecahan' },
    ],
  },
  {
    elemen: 'Bilangan',
    subelemen: 'Bilangan Rasional',
    indikator: 'Perbandingan dan pengurutan bilangan pecahan',
    patterns: [
      { re: /urut(kan|an).*?(terkecil|terbesar|pecahan|desimal|persen)/i, weight: 8, label: 'pengurutan pecahan' },
      { re: /(terkecil|terbesar|bandingkan|lebih besar|lebih kecil).*?pecahan/i, weight: 7, label: 'perbandingan pecahan' },
      { re: /\{[0-9]+\/[0-9]+\}/, weight: 2, label: 'simbol pecahan' },
    ],
  },
  {
    elemen: 'Bilangan',
    subelemen: 'Bilangan Rasional',
    indikator: 'Relasi berbagai bentuk pecahan (pecahan sederhana, desimal, persen)',
    patterns: [
      { re: /(bentuk\s+(desimal|persen|pecahan)|ubah.*?(desimal|persen|pecahan)|diubah ke)/i, weight: 8, label: 'relasi pecahan-desimal-persen' },
      { re: /[0-9]+,[0-9]+.*?%|[0-9]+%.*?desimal|persentase/i, weight: 6, label: 'desimal/persen' },
    ],
  },
  {
    elemen: 'Bilangan',
    subelemen: 'Bilangan Rasional',
    indikator: 'Operasi penjumlahan dan pengurangan bilangan pecahan, serta operasi perkalian dan pembagian bilangan pecahan dengan bilangan asli',
    patterns: [
      { re: /\{[0-9]+\/[0-9]+\}.*?(\+|\-|×|÷|kali|bagi|tambah|kurang|sisa)/i, weight: 8, label: 'operasi pecahan' },
      { re: /(penjumlahan|pengurangan|perkalian|pembagian).*?pecahan/i, weight: 8, label: 'operasi pecahan' },
      { re: /\{[0-9]+\/[0-9]+\}/, weight: 3, label: 'simbol pecahan' },
    ],
  },
  {
    elemen: 'Bilangan',
    subelemen: 'Bilangan Rasional',
    indikator: 'Kelipatan, faktor, KPK, dan FPB bilangan asli',
    patterns: [
      { re: /\b(kpk|fpb|kelipatan|faktor persekutuan|faktorisasi|bilangan prima)\b/i, weight: 10, label: 'KPK/FPB/kelipatan/faktor' },
      { re: /habis dibagi|bersamaan lagi|membagi sama banyak/i, weight: 6, label: 'konteks KPK/FPB' },
    ],
  },
  {
    elemen: 'Bilangan',
    subelemen: 'Bilangan Rasional',
    indikator: 'Operasi penjumlahan, pengurangan, perkalian, dan pembagian bilangan cacah',
    patterns: [
      { re: /\b(rp\s*[0-9]|harga|membeli|total uang|kembalian|diskon|dibayar|belanja|seluruhnya|sisa uang)\b/i, weight: 7, label: 'aritmetika bilangan cacah' },
      { re: /\b(hasil dari|selisih|jumlah dari|perkalian|pembagian|penjumlahan|pengurangan|bilangan cacah)\b/i, weight: 5, label: 'operasi hitung cacah' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Objek Geometri',
    indikator: 'Bentuk bangun datar',
    patterns: [
      { re: /\b(sifat[- ]sifat|ciri[- ]ciri|nama bangun|bangun datar|segitiga sama|segitiga siku|jajar genjang|trapesium|belah ketupat|layang[- ]layang|segi banyak|poligon|simetri)\b/i, weight: 7, label: 'bentuk bangun datar' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Objek Geometri',
    indikator: 'Konstruksi bangun ruang dan visualisasi spasial (bagian depan, atas, dan samping)',
    patterns: [
      { re: /\b(tampak depan|tampak atas|tampak samping|visualisasi spasial|susunan kubus|jaring[- ]jaring|banyak sisi|banyak rusuk|titik sudut|konstruksi bangun)\b/i, weight: 9, label: 'konstruksi & visualisasi spasial' },
      { re: /\b(kubus|balok|gabungan bangun ruang)\b/i, weight: 4, label: 'objek kubus/balok' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    indikator: 'Keliling dan luas bangun datar (segitiga, segiempat, dan segi banyak)',
    patterns: [
      { re: /\b(keliling|luas)\b.*?\b(persegi|persegi panjang|segitiga|kebun|tanah|lapangan|taman|halaman|segiempat|segi banyak|trapesium|jajar genjang)\b/i, weight: 10, label: 'keliling/luas bangun datar' },
      { re: /\b(luas|keliling)\b|\bm\^\{?2\}?|\bcm\^\{?2\}?/i, weight: 7, label: 'luas/keliling' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    indikator: 'Volume bangun ruang (kubus, balok, dan gabungannya)',
    patterns: [
      { re: /\b(volume|isi)\b.*?\b(kubus|balok|akuarium|bak|kolam|kardus|kotak|gabungan)\b/i, weight: 10, label: 'volume kubus/balok' },
      { re: /\bcm\^\{?3\}?|\bm\^\{?3\}?/i, weight: 8, label: 'satuan kubik' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    indikator: 'Panjang benda menggunakan satuan baku dan hubungan antar-satuan baku panjang (mm, dm, cm, m, dam, hm, km)',
    patterns: [
      { re: /\b(km|hm|dam|dm|cm|mm)\b.*?(ubah|menjadi|setara|sama dengan|\+|\-|panjang|pita|tali|jarak|tinggi)\b/i, weight: 7, label: 'satuan baku panjang' },
      { re: /\b(mill?imeter|sentimeter|desimeter|dekameter|hektometer|kilometer)\b/i, weight: 7, label: 'satuan panjang' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    indikator: 'Volume benda menggunakan satuan baku dan hubungan antar-satuan baku volume (ml, dl, cl, l, dal, hl, kl)',
    patterns: [
      { re: /\b(ml|dl|cl|dal|hl|kl|liter|mililiter)\b/i, weight: 7, label: 'satuan baku volume' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    indikator: 'Berat benda menggunakan satuan baku dan hubungan antar-satuan baku berat (mg, dg, cg, g, dag, hg, kg)',
    patterns: [
      { re: /\b(mg|dg|cg|dag|hg|ons|kuintal|ton|berat benda|massa|timbangan)\b/i, weight: 7, label: 'satuan baku berat' },
      { re: /\b(kg|gram)\b.*?(ubah|menjadi|setara|gram|dag|hg|ons|kuintal)\b/i, weight: 7, label: 'konversi berat' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    indikator: 'Waktu dan hubungan antar-satuan waktu (detik, menit, jam, hari, pekan, bulan, tahun)',
    patterns: [
      { re: /\b(pukul|detik|menit|jam|hari|pekan|minggu|bulan|tahun|abad|windu|dasawarsa|lama perjalanan|berlangsung selama)\b/i, weight: 6, label: 'satuan waktu' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    indikator: 'Laju perubahan (kecepatan)',
    patterns: [
      { re: /\b(kecepatan|km\/jam|m\/detik|laju|jarak tempuh|berpapasan|menyusul)\b/i, weight: 10, label: 'kecepatan' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    indikator: 'Besar sudut',
    patterns: [
      { re: /\b(besar sudut|sudut siku|sudut tumpul|sudut lancip|busur derajat|derajat|°)\b/i, weight: 9, label: 'besar sudut' },
    ],
  },
  {
    elemen: 'Geometri dan Pengukuran',
    subelemen: 'Pengukuran',
    indikator: 'Penaksiran ukuran',
    patterns: [
      { re: /\b(taksir|penaksiran|memperkirakan|perkiraan ukuran|dibulatkan ke)\b/i, weight: 8, label: 'penaksiran ukuran' },
    ],
  },
  {
    elemen: 'Data',
    subelemen: 'Penyajian dan Penggunaan Data',
    indikator: 'Penyajian data (gambar, piktogram, diagram batang, dan tabel frekuensi)',
    patterns: [
      { re: /\b(piktogram|diagram batang|diagram gambar|tabel frekuensi|menyajikan data|penyajian data|diagram berikut)\b/i, weight: 10, label: 'penyajian data' },
    ],
  },
  {
    elemen: 'Data',
    subelemen: 'Penyajian dan Penggunaan Data',
    indikator: 'Pengambilan informasi dan penggunaan data',
    patterns: [
      { re: /\b(perhatikan tabel|tabel berikut|data berikut|data nilai|data penjualan|data siswa|modus|rata[- ]rata|paling banyak|selisih tertinggi)\b/i, weight: 8, label: 'penggunaan data' },
    ],
  },
];

const BI_PATTERNS: PatternCandidate[] = [
  {
    elemen: 'Pemahaman Tekstual',
    subelemen: 'Identifikasi Kosakata, Objek & Informasi Tersurat',
    indikator: 'Mengidentifikasi penggunaan kosakata umum dan khusus dalam berbagai bidang',
    patterns: [
      { re: /\b(kosakata|kata khusus|kata umum|istilah|sinonim|antonim|arti kata|makna kata)\b/i, weight: 9, label: 'kosakata umum/khusus' },
    ],
  },
  {
    elemen: 'Pemahaman Tekstual',
    subelemen: 'Identifikasi Kosakata, Objek & Informasi Tersurat',
    indikator: 'Mengidentifikasi objek berdasarkan kosakata yang digunakan dalam teks fiksi atau nonfiksi',
    patterns: [
      { re: /\b(objek|menggambarkan|benda yang dimaksud|ciri objek|deskripsi objek|teks fiksi|teks nonfiksi)\b/i, weight: 7, label: 'identifikasi objek' },
    ],
  },
  {
    elemen: 'Pemahaman Tekstual',
    subelemen: 'Identifikasi Kosakata, Objek & Informasi Tersurat',
    indikator: 'Menyusun kembali informasi dari teks dalam bentuk ikhtisar/bagan',
    patterns: [
      { re: /\b(ikhtisar|bagan|peta pikiran|tabel isian|melengkapi bagan|ringkasan teks|urutan peristiwa)\b/i, weight: 10, label: 'ikhtisar/bagan' },
    ],
  },
  {
    elemen: 'Pemahaman Tekstual',
    subelemen: 'Identifikasi Kosakata, Objek & Informasi Tersurat',
    indikator: 'Mengidentifikasi informasi tersurat dalam teks',
    patterns: [
      { re: /\b(informasi tersurat|sesuai (isi )?teks|pernyataan yang sesuai|berdasarkan teks|disebutkan dalam|siapa yang|kapan|di mana|mengapa dalam teks)\b/i, weight: 7, label: 'informasi tersurat' },
    ],
  },
  {
    elemen: 'Pemahaman Inferensial',
    subelemen: 'Simpulan, Perubahan Unsur & Makna Ungkapan',
    indikator: 'Menyimpulkan ide pokok, gagasan pendukung, amanat, tokoh, peristiwa, dan/atau nilai-nilai dalam teks',
    patterns: [
      { re: /\b(ide pokok|gagasan pokok|gagasan utama|kalimat utama|gagasan pendukung|amanat|pesan moral|keteladanan|nilai[- ]nilai|watak|sifat tokoh|simpulan|kesimpulan)\b/i, weight: 10, label: 'ide pokok/amanat/tokoh' },
    ],
  },
  {
    elemen: 'Pemahaman Inferensial',
    subelemen: 'Simpulan, Perubahan Unsur & Makna Ungkapan',
    indikator: 'Menyimpulkan perubahan sederhana pada objek, karakter, dan/atau latar dalam teks fiksi atau nonfiksi',
    patterns: [
      { re: /\b(perubahan|berubah menjadi|perubahan sifat|perubahan karakter|perubahan latar|suasana awal|akhir cerita)\b/i, weight: 9, label: 'perubahan objek/karakter/latar' },
    ],
  },
  {
    elemen: 'Pemahaman Inferensial',
    subelemen: 'Simpulan, Perubahan Unsur & Makna Ungkapan',
    indikator: 'Menjelaskan makna ungkapan yang digunakan dalam teks',
    patterns: [
      { re: /\b(ungkapan|makna ungkapan|arti ungkapan|kiasan|idiom|peribahasa|majas)\b/i, weight: 10, label: 'makna ungkapan' },
    ],
  },
  {
    elemen: 'Evaluasi dan Apresiasi',
    subelemen: 'Relevansi, Kesesuaian & Respons Emosional',
    indikator: 'Menilai relevansi peristiwa dalam teks dengan kehidupan sehari-hari berdasarkan pengalaman atau pengetahuan pribadi',
    patterns: [
      { re: /\b(kehidupan sehari[- ]hari|pengalaman pribadi|relevan|relevansi|teladan dalam kehidupan|jika kamu menjadi|sikap yang sebaiknya|penerapan dalam kehidupan)\b/i, weight: 10, label: 'relevansi kehidupan sehari-hari' },
    ],
  },
  {
    elemen: 'Evaluasi dan Apresiasi',
    subelemen: 'Relevansi, Kesesuaian & Respons Emosional',
    indikator: 'Menilai kesesuaian antarunsur dan/atau antarinformasi dalam teks',
    patterns: [
      { re: /\b(kesesuaian|antarunsur|antarinformasi|hubungan antar|konsisten|bertentangan dengan|sesuai atau tidak sesuai|membandingkan kedua teks)\b/i, weight: 9, label: 'kesesuaian antarunsur' },
    ],
  },
  {
    elemen: 'Evaluasi dan Apresiasi',
    subelemen: 'Relevansi, Kesesuaian & Respons Emosional',
    indikator: 'Menyimpulkan respons emosional terhadap unsur teks fiksi',
    patterns: [
      { re: /\b(perasaan|emosi|respons emosional|merasa terharu|kagum|sedih|simpati|empati|kecewa|gembira|kesan terhadap cerita)\b/i, weight: 9, label: 'respons emosional' },
    ],
  },
];

export function classifySoalTka(
  q: SoalLengkap,
  forcedBidang?: TkaBidang
): TkaClassification {
  // If user has manually saved TKA tags on the question and no force override conflicts
  if (q.tka_elemen && q.tka_subelemen && (!forcedBidang || q.tka_mapel === forcedBidang)) {
    return {
      mapel: (q.tka_mapel === 'Bahasa Indonesia' ? 'Bahasa Indonesia' : 'Matematika'),
      elemen: q.tka_elemen,
      subelemen: q.tka_subelemen,
      indikator: q.tka_indikator || q.tka_subelemen,
      confidence: 'Manual',
      reason: 'Dipetakan & tersimpan pada data soal',
    };
  }

  const bidang = forcedBidang || inferTkaBidang(undefined, [q]);
  const text = `${q.teks_stimulus} ${q.teks_soal} ${q.pilihan_a} ${q.pilihan_b} ${q.pilihan_c} ${q.pilihan_d} ${q.pembahasan}`;
  const candidates = bidang === 'Bahasa Indonesia' ? BI_PATTERNS : MATH_PATTERNS;

  let best: PatternCandidate | null = null;
  let bestScore = 0;
  let bestLabels: string[] = [];

  for (const c of candidates) {
    let score = 0;
    const labels: string[] = [];
    for (const p of c.patterns) {
      if (p.re.test(text)) {
        score += p.weight;
        labels.push(p.label);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
      bestLabels = labels;
    }
  }

  if (best && bestScore > 0) {
    return {
      mapel: bidang,
      elemen: best.elemen,
      subelemen: best.subelemen,
      indikator: best.indikator,
      confidence: bestScore >= 8 ? 'Tinggi' : 'Sedang',
      reason: `Cocok kata kunci: ${bestLabels.join(', ')}`,
    };
  }

  // Fallback default rule inside the chosen domain
  const fw = getFrameworkByBidang(bidang)[0];
  return {
    mapel: bidang,
    elemen: fw.elemen,
    subelemen: fw.subelemen,
    indikator: fw.indikatorList[bidang === 'Matematika' ? 3 : 3] || fw.indikatorList[0],
    confidence: 'Sedang',
    reason: 'Pemetaan awal default (periksa & sesuaikan manual bila perlu)',
  };
}
