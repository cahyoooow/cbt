# Security Specification — CBT SD Negeri 5 Wonosobo

## 1. Data Invariants
1. **Admin Authority:** Only Google-authenticated users with `request.auth.token.email_verified == true` matching the primary admin email (`cahyoooow@gmail.com`) or listed in `/admins/{email}` can manage `paket`, `soal`, `soal_kunci`, `siswa`, `tata_tertib`, `pengaturan`, `admins`, and delete/rescore `hasil` or `pelanggaran`.
2. **Answer Key Isolation:** `kunci_jawaban` and `pembahasan` live strictly in `/soal_kunci/{soalId}`, never in `/soal/{soalId}`. When `rilis_kunci == false`, students are completely blocked from reading `/soal_kunci`.
3. **Token & Roster Privacy:** Students look up exams by exact token (`/paket_tokens/{token}`) and student record by exact normalized name key (`/siswa/{siswaId}`) via `get` only; `list` on `/paket`, `/paket_tokens`, `/siswa`, `/progres`, `/hasil`, and `/pelanggaran` is strictly restricted to admins.
4. **Immutable & Single-Submission Results:** `hasil/{paketId}__{siswaId}` uses a deterministic composite ID. Students can `create` it once only for an active `paket` and active `siswa`, and cannot `update` or `delete` it afterward.
5. **Atomic Submission Cleanup:** Deleting `/progres/{progresId}` by a student is allowed only when `/hasil/{progresId}` exists in the same atomic batch (`existsAfter`).
6. **Strict Schema & Bounds:** Every `create` and `update` validates exact key sets (`hasAll`, `hasOnly`), types, string `.size()` limits, valid ID regex, and server timestamp (`request.time`).

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Shadow Field Injection on Progres:** `{ ...validProgres, isAdmin: true }` -> Blocked by `hasOnly(...)`.
2. **Ghost Field on Hasil Submission:** `{ ...validHasil, overrideScore: 100 }` -> Blocked by `hasOnly(...)`.
3. **Unverified Email Spoofing on Admin Action:** Authenticated user with `email: "cahyoooow@gmail.com"`, `email_verified: false` reading `/soal_kunci` -> Blocked by `email_verified == true`.
4. **Oversized ID Poisoning (1.5KB):** `doc(db, 'progres', 'a'.repeat(1500))` -> Blocked by `isValidId()` (`<= 128` chars + regex).
5. **Non-Admin Creating Soal:** Unauthenticated or student user creating `/soal/S99` -> Blocked by `isAdmin()`.
6. **Student Reading Locked Answer Key:** Unauthenticated user reading `/soal_kunci/S1` when `rilis_kunci == false` -> Blocked by `isAdmin() || resource.data.rilis_kunci == true`.
7. **Student Modifying Own Hasil:** Student calling `updateDoc` on `/hasil/P1__andi` to change `nilai_akhir: 100` -> Blocked by `allow update: if isAdmin()`.
8. **Student Scraping All Students (`list`):** Unauthenticated user running `getDocs(collection(db, 'siswa'))` -> Blocked by `allow list: if isAdmin()`.
9. **Student Submitting for Nonexistent/Inactive Paket:** Creating `/progres/FAKE__andi` with `paket_id: "FAKE"` -> Blocked by `exists()` and `status == 'Aktif'` check.
10. **Client-Spoofed Timestamp:** Creating `/pelanggaran/L1` with `created_at: new Date(2020, 0, 1)` instead of `serverTimestamp()` -> Blocked by `incoming().created_at == request.time`.
11. **Student Changing Own Account Status:** Updating `/siswa/andi` with `{ status_akun: 'Aktif', kelas: '9Z' }` -> Blocked by `affectedKeys().hasOnly(['status_ujian', 'updated_at'])` and `existing().status_akun == 'Aktif'`.
12. **Orphan Progres Deletion Without Submission:** Deleting `/progres/P1__andi` without creating `/hasil/P1__andi` in the same batch -> Blocked by `existsAfter(/databases/$(database)/documents/hasil/$(progresId))`.
