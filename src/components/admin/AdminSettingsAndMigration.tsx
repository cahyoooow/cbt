import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  CloudDownload,
  Database,
  KeyRound,
  Link2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  addAdminPasscode,
  deleteAdminPasscode,
  getPengaturan,
  savePengaturan,
  saveTataTertibList,
  seedSampleDatabase,
} from '../../services/cbtService';
import {
  DEFAULT_GAS_URL,
  getGasUrl,
  setGasUrl as persistGasUrl,
  testGasConnection,
} from '../../services/gasClient';
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

  // Apps Script Web App URL configuration
  const [gasUrl, setGasUrl] = useState(() => getGasUrl());
  const [testingConn, setTestingConn] = useState(false);
  const [connLog, setConnLog] = useState<{ ok: boolean; msg: string } | null>(null);

  // On-demand Firebase -> Spreadsheet sync
  const [syncingFb, setSyncingFb] = useState(false);
  const [fbSyncStatus, setFbSyncStatus] = useState('');
  const [fbSyncResult, setFbSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  if (tab === 'akun') {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#0F172A]">
            Password Admin &amp; Tata Tertib
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola password masuk panel admin CBT dan butir tata tertib ujian peserta.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-5 sm:gap-6 items-start">
          {/* Admin Passcodes */}
          <div className="bg-white border border-sky-100 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-600 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" strokeWidth={1.85} />
              </span>
              <h2 className="font-bold text-sm text-[#0F172A]">Kelola Password Admin</h2>
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
                className="sm:col-span-5 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password baru"
                className="sm:col-span-4 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={savingPass}
                className="sm:col-span-3 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
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
                      Password admin Spreadsheet aktif
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
          <div className="bg-white border border-sky-100 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-600 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-4 h-4" strokeWidth={1.85} />
                </span>
                <h2 className="font-bold text-sm text-[#0F172A]">Tata Tertib Ujian</h2>
              </div>
              <button
                type="button"
                onClick={() => setTibDrafts((d) => [...d, ''])}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-sky-200/80 text-xs font-semibold text-slate-700 hover:bg-[#F2F8FF] inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Butir
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Saat siswa login, daftar tata tertib utama diambil dari sheet{' '}
              <code>Tata_Tertib</code> di Spreadsheet. Perubahan di sini tersimpan di pratinjau
              perangkat ini.
            </p>

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
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
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
              className="w-full min-h-[44px] py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {savingTib ? 'Menyimpan...' : 'Simpan Tata Tertib'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== TAB: PENGATURAN & KONEKSI APPS SCRIPT =====
  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">
          Pengaturan &amp; Koneksi Server
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Sesuaikan identitas sekolah serta koneksi Google Apps Script (Spreadsheet) untuk
          menyimpan seluruh data CBT.
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
            <span className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-600 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" strokeWidth={1.85} />
            </span>
            <h2 className="font-bold text-sm text-[#0F172A]">Identitas Portal Sekolah</h2>
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
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Sub Judul</label>
            <input
              type="text"
              value={subjudul}
              onChange={(e) => setSubjudul(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Admin</label>
              <input
                type="text"
                value={judulAdmin}
                onChange={(e) => setJudulAdmin(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
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
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
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
                className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
              <label className="min-h-[42px] px-3.5 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] hover:bg-[#E6F2FF] text-xs font-semibold inline-flex items-center cursor-pointer whitespace-nowrap transition-colors">
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
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {savingCfg ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </form>

        {/* Apps Script Connection Config */}
        <div className="space-y-4">
          <div className="bg-white border border-sky-100 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/70 text-emerald-700 flex items-center justify-center shrink-0">
                <Link2 className="w-4 h-4" strokeWidth={1.85} />
              </span>
              <div>
                <h2 className="font-bold text-sm text-[#0F172A]">
                  Koneksi Google Apps Script (Spreadsheet)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Penyimpanan utama seluruh paket soal, siswa, jawaban, hasil, dan pelanggaran.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Aplikasi terhubung langsung ke Web App Google Apps Script (<code>/exec</code>) sehingga
              database Google Spreadsheet lama tetap utuh tanpa batas kuota harian. Pastikan Web App
              di-deploy dengan akses <strong>&quot;Anyone&quot;</strong>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                URL Web App Apps Script (/exec)
              </label>
              <input
                type="url"
                value={gasUrl}
                onChange={(e) => {
                  setGasUrl(e.target.value);
                  setConnLog(null);
                }}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
            </div>

            {connLog && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  connLog.ok
                    ? 'bg-emerald-50 border-emerald-200/80 text-emerald-800'
                    : 'bg-rose-50 border-rose-200/80 text-rose-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{connLog.msg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={testingConn}
                onClick={async () => {
                  const target = gasUrl.trim();
                  if (!target) {
                    onToast('Masukkan URL Web App Apps Script (/exec).', 'err');
                    return;
                  }
                  setTestingConn(true);
                  setConnLog(null);
                  try {
                    const res = await testGasConnection(target);
                    if (!res.ok) {
                      const errMsg = res.error || 'Gagal terhubung ke Apps Script.';
                      setConnLog({ ok: false, msg: errMsg });
                      onToast(errMsg, 'err');
                      return;
                    }
                    persistGasUrl(target);
                    const cfgUpdated = await getPengaturan(true);
                    onSettingsUpdated(cfgUpdated);
                    setJudul(cfgUpdated.judul);
                    setSubjudul(cfgUpdated.subjudul);
                    setJudulAdmin(cfgUpdated.judul_admin);
                    setSubjudulAdmin(cfgUpdated.subjudul_admin);
                    setLogo(cfgUpdated.logo);
                    await onRefresh();
                    setConnLog({
                      ok: true,
                      msg: 'Terhubung ke Google Apps Script & Spreadsheet! Data berhasil dimuat.',
                    });
                    onToast('Koneksi Apps Script berhasil disimpan & diuji.', 'ok');
                  } catch (err) {
                    const m =
                      err instanceof Error ? err.message : 'Gagal menguji koneksi Apps Script.';
                    setConnLog({ ok: false, msg: m });
                    onToast(m, 'err');
                  } finally {
                    setTestingConn(false);
                  }
                }}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {testingConn ? 'Menguji Koneksi...' : 'Simpan & Uji Koneksi'}
              </button>

              <button
                type="button"
                disabled={testingConn}
                onClick={() => {
                  setGasUrl(DEFAULT_GAS_URL);
                  persistGasUrl(DEFAULT_GAS_URL);
                  setConnLog({
                    ok: true,
                    msg: 'URL dikembalikan ke Web App Apps Script default.',
                  });
                  onToast('URL Apps Script dikembalikan ke default.', 'ok');
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-sky-200/80 bg-white hover:bg-[#F2F8FF] text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Default
              </button>
            </div>
          </div>

          <div className="bg-white border border-sky-100 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-3.5">
            <div className="flex items-start gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/70 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                <CloudDownload className="w-4 h-4" strokeWidth={1.85} />
              </span>
              <div>
                <h3 className="font-bold text-sm text-[#0F172A]">
                  Tarik Data Terbaru dari Firebase ke Spreadsheet
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Gunakan jika Anda sempat menambahkan paket, soal Word/gambar, siswa, nilai, atau
                  pelanggaran di penyimpanan Firebase dan ingin menyalinnya masuk ke Google
                  Spreadsheet tanpa menghapus data lama.
                </p>
              </div>
            </div>

            {fbSyncResult && (
              <div
                className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  fbSyncResult.ok
                    ? 'bg-emerald-50 border-emerald-200/80 text-emerald-800'
                    : 'bg-rose-50 border-rose-200/80 text-rose-800'
                }`}
              >
                {fbSyncResult.msg}
              </div>
            )}

            <button
              type="button"
              disabled={syncingFb || testingConn}
              onClick={async () => {
                setSyncingFb(true);
                setFbSyncResult(null);
                setFbSyncStatus('Menyiapkan koneksi Firebase...');
                try {
                  const { syncLatestFirebaseToGas } = await import(
                    '../../services/firebaseSyncService'
                  );
                  const summary = await syncLatestFirebaseToGas((msg) => setFbSyncStatus(msg));
                  await onRefresh();
                  const msg = `Sinkronisasi selesai: ${summary.paket} paket, ${summary.soal} soal, ${summary.siswa} siswa baru, ${summary.hasil} hasil, dan ${summary.pelanggaran} log pelanggaran tersimpan ke Spreadsheet.`;
                  setFbSyncResult({ ok: true, msg });
                  onToast('Data terbaru dari Firebase berhasil disalin ke Spreadsheet.', 'ok');
                } catch (err) {
                  const errMsg =
                    err instanceof Error ? err.message : 'Gagal menarik data dari Firebase.';
                  setFbSyncResult({ ok: false, msg: errMsg });
                  onToast(errMsg, 'err');
                } finally {
                  setSyncingFb(false);
                  setFbSyncStatus('');
                }
              }}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100/80 disabled:opacity-60 text-amber-900 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <CloudDownload className="w-4 h-4 shrink-0" />
              {syncingFb
                ? fbSyncStatus || 'Menyinkronkan ke Spreadsheet...'
                : 'Login Google & Tarik Data dari Firebase'}
            </button>
          </div>

          <div className="bg-white border border-sky-100 shadow-2xs rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-[#0F172A]">Isi Data Contoh Awal</h3>
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
              className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl border border-sky-200/80 bg-white hover:bg-[#F2F8FF] text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
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
