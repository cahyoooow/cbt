import React, { useState } from 'react';
import {
  Building2,
  ClipboardList,
  Database,
  KeyRound,
  Plus,
  Save,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  addAdminPasscode,
  deleteAdminPasscode,
  migrateFromLegacyGas,
  savePengaturan,
  saveTataTertibList,
  seedSampleDatabase,
} from '../../services/cbtService';
import type { AdminPassLabel, Pengaturan, TataTertib } from '../../types/cbt';
import { compressImageToDataUrl } from '../../utils/mathFormat';

interface Props {
  tab: 'akun' | 'set';
  settings: Pengaturan;
  passLabels: AdminPassLabel[];
  tibs: TataTertib[];
  onRefresh: () => Promise<void>;
  onSettingsUpdated: (cfg: Pengaturan) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function AdminSettingsAndMigration({
  tab,
  settings,
  passLabels,
  tibs,
  onRefresh,
  onSettingsUpdated,
  onToast,
}: Props) {
  // Admin passcode form
  const [newLabel, setNewLabel] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  // Tata tertib editor
  const [tibDrafts, setTibDrafts] = useState<string[]>(() => tibs.map((t) => t.teks));
  const [savingTib, setSavingTib] = useState(false);

  // Settings form
  const [judul, setJudul] = useState(settings.judul);
  const [subjudul, setSubjudul] = useState(settings.subjudul);
  const [judulAdmin, setJudulAdmin] = useState(settings.judul_admin);
  const [subjudulAdmin, setSubjudulAdmin] = useState(settings.subjudul_admin);
  const [logo, setLogo] = useState(settings.logo);
  const [savingCfg, setSavingCfg] = useState(false);

  // Legacy GAS migration tool
  const [gasUrl, setGasUrl] = useState(() => {
    try {
      return (
        localStorage.getItem('cbt_legacy_gas_url') ||
        'https://script.google.com/macros/s/AKfycbwCLsMHzKd_wqwLX-5w71sKtmubFHSxAgcr1Bdlcr-IESMcl21QBlKyBoI3L0df3a1X/exec'
      );
    } catch {
      return 'https://script.google.com/macros/s/AKfycbwCLsMHzKd_wqwLX-5w71sKtmubFHSxAgcr1Bdlcr-IESMcl21QBlKyBoI3L0df3a1X/exec';
    }
  });
  const [gasPw, setGasPw] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migLog, setMigLog] = useState('');

  if (tab === 'akun') {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            Password Admin &amp; Tata Tertib
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola password masuk panel admin CBT dan butir tata tertib ujian peserta.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-5 sm:gap-6 items-start">
          {/* Admin Passcodes */}
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200/70 text-sky-600 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" strokeWidth={1.85} />
              </span>
              <h2 className="font-bold text-sm text-slate-800">Kelola Password Admin</h2>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (newPassword.trim().length < 3) {
                  onToast('Password minimal 3 karakter.', 'err');
                  return;
                }
                setSavingPass(true);
                try {
                  await addAdminPasscode(newLabel, newPassword);
                  setNewLabel('');
                  setNewPassword('');
                  await onRefresh();
                  onToast('Password admin baru ditambahkan.', 'ok');
                } catch (err) {
                  onToast(err instanceof Error ? err.message : 'Gagal menambah password.', 'err');
                } finally {
                  setSavingPass(false);
                }
              }}
              className="grid sm:grid-cols-12 gap-2"
            >
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (mis: Pengawas / Cadangan)"
                className="sm:col-span-5 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password baru"
                className="sm:col-span-4 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={savingPass}
                className="sm:col-span-3 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {savingPass ? '...' : 'Tambah'}
              </button>
            </form>

            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden">
              {passLabels.map((p) => (
                <div
                  key={p.id}
                  className="px-3.5 py-3 flex items-center justify-between gap-3 text-xs bg-white"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{p.label}</div>
                    <div className="text-slate-400 mt-0.5">
                      Password terenkripsi aktif
                      {p.created_at ? ` · ${p.created_at.toLocaleDateString('id-ID')}` : ''}
                    </div>
                  </div>
                  {passLabels.length > 1 ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Hapus password "${p.label}"?`)) return;
                        try {
                          await deleteAdminPasscode(p.id, p.verifier);
                          await onRefresh();
                          onToast('Password admin dihapus.', 'ok');
                        } catch (err) {
                          onToast(
                            err instanceof Error ? err.message : 'Gagal menghapus password.',
                            'err'
                          );
                        }
                      }}
                      className="min-w-[40px] min-h-[40px] text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="text-emerald-600 text-xs font-semibold shrink-0">Aktif</span>
                  )}
                </div>
              ))}
              {passLabels.length === 0 && (
                <div className="px-3.5 py-4 text-center text-xs text-slate-400 bg-white">
                  Belum ada daftar password tersimpan.
                </div>
              )}
            </div>
          </div>

          {/* Tata Tertib */}
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/70 text-indigo-600 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-4 h-4" strokeWidth={1.85} />
                </span>
                <h2 className="font-bold text-sm text-slate-800">Tata Tertib Ujian</h2>
              </div>
              <button
                type="button"
                onClick={() => setTibDrafts((d) => [...d, ''])}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Butir
              </button>
            </div>

            <div className="space-y-2">
              {tibDrafts.map((teks, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400 w-5 text-right shrink-0">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={teks}
                    onChange={(e) => {
                      const next = [...tibDrafts];
                      next[idx] = e.target.value;
                      setTibDrafts(next);
                    }}
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setTibDrafts((d) => d.filter((_, i) => i !== idx))}
                    className="min-w-[40px] min-h-[40px] text-rose-600 hover:bg-rose-50 rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={savingTib}
              onClick={async () => {
                setSavingTib(true);
                try {
                  const clean = tibDrafts
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((teks, i) => ({ no: i + 1, teks }));
                  await saveTataTertibList(clean);
                  await onRefresh();
                  onToast('Tata tertib berhasil disimpan.', 'ok');
                } finally {
                  setSavingTib(false);
                }
              }}
              className="w-full min-h-[44px] py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {savingTib ? 'Menyimpan...' : 'Simpan Tata Tertib'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== TAB: PENGATURAN & MIGRASI =====
  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">
          Pengaturan &amp; Migrasi Data
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Sesuaikan identitas sekolah serta pindahkan data lama dari Apps Script/Spreadsheet ke
          Firebase.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 sm:gap-6 items-start">
        {/* School Branding Settings */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingCfg(true);
            try {
              const next: Pengaturan = {
                judul: judul.trim(),
                subjudul,
                judul_admin: judulAdmin,
                subjudul_admin: subjudulAdmin,
                logo,
              };
              await savePengaturan(next);
              onSettingsUpdated(next);
              onToast('Pengaturan portal CBT berhasil disimpan.', 'ok');
            } catch (err) {
              onToast(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.', 'err');
            } finally {
              setSavingCfg(false);
            }
          }}
          className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200/70 text-sky-600 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" strokeWidth={1.85} />
            </span>
            <h2 className="font-bold text-sm text-slate-800">Identitas Portal Sekolah</h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Judul Halaman Login Siswa
            </label>
            <input
              type="text"
              required
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Sub Judul</label>
            <input
              type="text"
              value={subjudul}
              onChange={(e) => setSubjudul(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Admin</label>
              <input
                type="text"
                value={judulAdmin}
                onChange={(e) => setJudulAdmin(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sub Judul Admin
              </label>
              <input
                type="text"
                value={subjudulAdmin}
                onChange={(e) => setSubjudulAdmin(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Logo Sekolah</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="URL logo atau unggah gambar..."
                className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <label className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold inline-flex items-center cursor-pointer whitespace-nowrap transition-colors">
                Unggah
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const dataUrl = await compressImageToDataUrl(f, 400, 0.85);
                    setLogo(dataUrl);
                  }}
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingCfg}
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {savingCfg ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </form>

        {/* 1-Click Migration from Google Apps Script */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/70 text-indigo-600 flex items-center justify-center shrink-0">
                <UploadCloud className="w-4 h-4" strokeWidth={1.85} />
              </span>
              <h2 className="font-bold text-sm text-slate-800">
                Migrasi Otomatis dari Apps Script / Spreadsheet Lama
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Masukkan URL Web App Apps Script (<code>/exec</code>) dan Password Admin lama Anda.
              Alat ini akan menyalin Pengaturan, Paket Soal, Bank Soal, Master Siswa, Hasil Ujian,
              dan Log Pelanggaran dari Spreadsheet ke Firebase Firestore dalam satu kali proses.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                URL Web App Apps Script (/exec)
              </label>
              <input
                type="url"
                value={gasUrl}
                onChange={(e) => setGasUrl(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password Admin Apps Script Lama
              </label>
              <input
                type="password"
                value={gasPw}
                onChange={(e) => setGasPw(e.target.value)}
                placeholder="Masukkan password admin lama"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {migLog && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700">
                {migLog}
              </div>
            )}

            <button
              type="button"
              disabled={migrating}
              onClick={async () => {
                if (!gasUrl.trim() || !gasPw) {
                  onToast('Isi URL Web App dan password admin lama terlebih dahulu.', 'err');
                  return;
                }
                setMigrating(true);
                setMigLog('Memulai proses migrasi...');
                try {
                  try {
                    localStorage.setItem('cbt_legacy_gas_url', gasUrl.trim());
                  } catch {
                    // ignore storage quota errors
                  }
                  const res = await migrateFromLegacyGas(gasUrl, gasPw, (m) => setMigLog(m));
                  await onRefresh();
                  const cfgUpdated = await (
                    await import('../../services/cbtService')
                  ).getPengaturan();
                  onSettingsUpdated(cfgUpdated);
                  setMigLog(
                    `Migrasi selesai! ${res.paket} paket, ${res.soal} soal, ${res.siswa} siswa baru, ${res.hasil} hasil ujian, dan ${res.pelanggaran} log pelanggaran baru berhasil disalin.`
                  );
                  onToast('Migrasi data dari Apps Script berhasil!', 'ok');
                } catch (err) {
                  const m =
                    err instanceof Error ? err.message : 'Gagal migrasi dari Apps Script.';
                  setMigLog(`Gagal: ${m}`);
                  onToast(m, 'err');
                } finally {
                  setMigrating(false);
                }
              }}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              {migrating ? 'Sedang Memigrasikan...' : 'Mulai Migrasi ke Firebase'}
            </button>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Isi Data Contoh Awal</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Menambahkan contoh paket Matematika, IPA, 3 soal AKM/PGK, dan 3 siswa uji coba.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await seedSampleDatabase();
                await onRefresh();
                onToast('Data contoh berhasil ditambahkan.', 'ok');
              }}
              className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
            >
              <Database className="w-4 h-4 text-sky-600" />
              Isi Contoh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
