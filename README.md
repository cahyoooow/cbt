# CBT - SD Negeri 5 Wonosobo

Aplikasi **Computer Based Test (CBT)** berbasis web untuk **SD Negeri 5 Wonosobo** dengan antarmuka biru muda cerah yang nyaman dipandang, dukungan berbagai tipe soal AKM, pemantauan ujian *real-time*, analisis butir soal & TKA, serta penyimpanan utama **Google Apps Script (Spreadsheet)** dan opsi sinkronisasi ke **Firebase Firestore**.

## Fitur Utama

- **Portal Siswa & Tata Tertib**: Login siswa dengan token ujian, verifikasi tata tertib sebelum memulai, navigasi nomor soal, penanda ragu-ragu, serta pengaman *anti-cheat* (*fullscreen* & deteksi pindah tab).
- **Dukungan Soal Lengkap (AKM)**: Pilihan Ganda (PG), Pilihan Ganda Kompleks / MCMA, dan PGK Kategori (Benar/Salah atau Sesuai/Tidak Sesuai), lengkap dengan stimulus teks, rumus matematika, dan gambar.
- **Impor & Ekspor Soal**: Impor langsung dari Microsoft Word (`.docx`) dan Excel (`.xlsx`), serta ekspor soal/hasil ujian ke Word, Excel, dan PDF.
- **Panel Admin & Live Monitor**: Kelola paket soal, daftar siswa, token ujian, tata tertib, pemantauan status peserta secara *real-time*, analisis butir soal, dan pemetaan TKA.
- **Optimasi Trafik Tinggi & Cache**: Dilengkapi *cache* data soal, paket, tata tertib, dan pengaturan agar hemat pembacaan server saat diakses bersamaan, serta mekanisme *retry* bertahap saat pengiriman jawaban untuk meminimalkan kegagalan jaringan.
- **Integrasi Google Apps Script & Firebase**: Penyimpanan utama terhubung ke Google Apps Script Web App (Google Sheets & Google Drive untuk gambar), dengan opsi sinkronisasi ke Firebase Firestore.

## Menjalankan Secara Lokal

Pastikan sudah menginstal **Node.js** versi 20 atau 22 ke atas.

```bash
npm install --legacy-peer-deps
npm run dev
```

Aplikasi akan berjalan di `http://localhost:3000`.

Untuk membuat *build* produksi ke folder `dist/`:

```bash
npm run build
```

## Cara Upload ke GitHub & Deploy ke GitHub Pages

Repositori ini sudah dilengkapi file workflow `.github/workflows/deploy-pages.yml` untuk *deploy* otomatis ke **GitHub Pages**.

1. **Siapkan File Upload**
   - Upload seluruh file dan folder proyek ini **kecuali** folder `node_modules/` dan `dist/` (sudah diatur di `.gitignore`).
   - Pastikan folder `.github/workflows/deploy-pages.yml` ikut ter-upload ke repositori GitHub Anda (branch `main` atau `master`).
2. **Aktifkan GitHub Pages**
   - Buka repositori Anda di GitHub.
   - Masuk ke menu **Settings** → **Pages**.
   - Pada bagian **Build and deployment → Source**, pilih **GitHub Actions**.
3. **Proses Build Otomatis**
   - Setiap kali ada `push` ke branch `main` atau `master`, GitHub Actions akan otomatis menjalankan `npm install`, `npm run build`, dan men-deploy isi folder `dist/` ke GitHub Pages.
   - Anda juga dapat memicu *deploy* secara manual melalui tab **Actions** → **Deploy CBT to GitHub Pages** → **Run workflow**.

## Konfigurasi Backend (Google Apps Script)

- URL Web App Google Apps Script bawaan dikonfigurasi di `src/services/gasClient.ts` dan juga dapat diubah langsung melalui panel **Admin → Pengaturan & Migrasi**.
- Jika menggunakan variabel lingkungan lokal, salin `.env.example` menjadi `.env` (jangan pernah meng-upload file `.env` berisi kunci rahasia ke GitHub).
