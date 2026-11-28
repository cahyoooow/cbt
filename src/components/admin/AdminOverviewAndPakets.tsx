import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Database,
  FolderOpen,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import {
  copyPaketWithSoal,
  deletePaket,
  resetPesertaUjian,
  savePaket,
  seedSampleDatabase,
} from '../../services/cbtService';
import type {
  AdminTab,
  HasilUjian,
  LogPelanggaran,
  PaketUjian,
  Siswa,
  SoalLengkap,
} from '../../types/cbt';
import { generateRandomToken } from '../../utils/mathFormat';

interface Props {
  tab: 'dash' | 'paket';
  pakets: PaketUjian[];
  soals: SoalLengkap[];
  siswas: Siswa[];
  hasils: HasilUjian[];
  pelanggarans: LogPelanggaran[];
  onRefresh: () => Promise<void>;
  onNavigate: (tab: AdminTab) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function AdminOverviewAndPakets({
  tab,
  pakets,
  soals,
  siswas,
  hasils,
  pelanggarans,
  onRefresh,
  onNavigate,
  onToast,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PaketUjian | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [copiedId, setCopiedId] = useState('');

  // Daftar Ujian filter state
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'Aktif' | 'Nonaktif'>('ALL');
  const [filterMapel, setFilterMapel] = useState('');
  const [searchPaket, setSearchPaket] = useState('');

  // Form state
  const [nama, setNama] = useState('');
  const [mapel, setMapel] = useState('');
  const [durasi, setDurasi] = useState(60);
  const [status, setStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [token, setToken] = useState('');
  const [waktuMulai, setWaktuMulai] = useState('');
  const [waktuBerakhir, setWaktuBerakhir] = useState('');
  const [tampilkanNilai, setTampilkanNilai] = useState(true);
  const [acakSoal, setAcakSoal] = useState(false);

  const paketStats = useMemo(() => {
    const map = new Map<string, { count: number; weight: number }>();
    soals.forEach((q) => {
      const cur = map.get(q.paket_id) || { count: 0, weight: 0 };
      cur.count += 1;
      cur.weight += Number(q.bobot) || 1;
      map.set(q.paket_id, cur);
    });
    return map;
  }, [soals]);

  const mapelList = useMemo(
    () => Array.from(new Set(pakets.map((p) => p.mata_pelajaran).filter(Boolean))).sort(),
    [pakets]
  );

  const countAktif = useMemo(
    () => pakets.filter((p) => p.status === 'Aktif').length,
    [pakets]
  );
  const countNonaktif = useMemo(
    () => pakets.filter((p) => p.status === 'Nonaktif').length,
    [pakets]
  );

  const filteredPakets = useMemo(() => {
    const q = searchPaket.trim().toLowerCase();
    return pakets.filter((p) => {
      if (filterStatus !== 'ALL' && p.status !== filterStatus) return false;
      if (filterMapel && p.mata_pelajaran !== filterMapel) return false;
      if (
        q &&
        !p.nama_paket_soal.toLowerCase().includes(q) &&
        !p.mata_pelajaran.toLowerCase().includes(q) &&
        !p.token_paket_soal.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [pakets, filterStatus, filterMapel, searchPaket]);

  const openForm = (p?: PaketUjian) => {
    if (p) {
      setEditing(p);
      setNama(p.nama_paket_soal);
      setMapel(p.mata_pelajaran);
      setDurasi(p.durasi_menit);
      setStatus(p.status);
      setToken(p.token_paket_soal);
      setWaktuMulai(p.waktu_mulai ? p.waktu_mulai.replace(' ', 'T').slice(0, 16) : '');
      setWaktuBerakhir(p.waktu_berakhir ? p.waktu_berakhir.replace(' ', 'T').slice(0, 16) : '');
      setTampilkanNilai(p.tampilkan_nilai);
      setAcakSoal(p.acak_soal);
    } else {
      setEditing(null);
      setNama('');
      setMapel('');
      setDurasi(60);
      setStatus('Aktif');
      setToken(generateRandomToken(6));
      setWaktuMulai('2026-01-01T00:00');
      setWaktuBerakhir('2030-12-31T23:59');
      setTampilkanNilai(true);
      setAcakSoal(false);
    }
    setModalOpen(true);
  };

  const handleSavePaket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim() || !mapel.trim()) {
      onToast('Nama paket dan mata pelajaran wajib diisi.', 'err');
      return;
    }
    setSaving(true);
    try {
      await savePaket(
        {
          id: editing?.id,
          nama_paket_soal: nama.trim(),
          mata_pelajaran: mapel.trim(),
          durasi_menit: Number(durasi) || 60,
          status,
          token_paket_soal: token.trim().toUpperCase() || generateRandomToken(6),
          waktu_mulai: waktuMulai ? waktuMulai.replace('T', ' ') : '',
          waktu_berakhir: waktuBerakhir ? waktuBerakhir.replace('T', ' ') : '',
          tampilkan_nilai: tampilkanNilai,
          acak_soal: acakSoal,
        },
        editing?.token_paket_soal
      );
      setModalOpen(false);
      await onRefresh();
      onToast(
        editing ? 'Paket soal berhasil diperbarui.' : 'Paket soal baru berhasil ditambahkan.',
        'ok'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan paket soal.', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePaket = async (p: PaketUjian) => {
    if (!window.confirm(`Hapus paket "${p.nama_paket_soal}" beserta seluruh soalnya?`)) return;
    try {
      await deletePaket(p);
      await onRefresh();
      onToast('Paket soal berhasil dihapus.', 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus paket.', 'err');
    }
  };

  const handleCopyPaket = async (p: PaketUjian) => {
    try {
      const res = await copyPaketWithSoal(p, pakets);
      await onRefresh();
      onToast(`Paket disalin: "${res.nama_paket_soal}" (Token: ${res.token_paket_soal}).`, 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyalin paket.', 'err');
    }
  };

  const handleResetPaket = async (p: PaketUjian) => {
    if (
      !window.confirm(
        `Reset seluruh status, progres, dan hasil peserta pada paket "${p.nama_paket_soal}"?`
      )
    ) {
      return;
    }
    try {
      const n = await resetPesertaUjian(p);
      await onRefresh();
      onToast(`${n} peserta pada paket "${p.nama_paket_soal}" berhasil direset.`, 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mereset paket.', 'err');
    }
  };

  const handleSeedSample = async () => {
    setSeeding(true);
    try {
      await seedSampleDatabase();
      await onRefresh();
      onToast('Data contoh CBT (Paket, Soal, Siswa, Tata Tertib) berhasil diisi.', 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mengisi data contoh.', 'err');
    } finally {
      setSeeding(false);
    }
  };

  const copyToken = (id: string, tok: string) => {
    void navigator.clipboard?.writeText(tok);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(''), 1500);
  };

  if (tab === 'dash') {
    const siswaSelesai = new Set(hasils.map((h) => h.siswa_id)).size;
    const paketAktif = pakets.filter((p) => p.status === 'Aktif');

    const kpiItems = [
      {
        label: 'Siswa Sudah Ujian',
        val: siswaSelesai,
        sub: `dari ${siswas.length} terdaftar`,
        icon: Users,
        iconBg: 'bg-sky-50 text-sky-600 border-sky-200/80',
      },
      {
        label: 'Paket Soal Ujian',
        val: pakets.length,
        sub: `${soals.length} total butir soal`,
        icon: FolderOpen,
        iconBg: 'bg-slate-100 text-slate-700 border-slate-200/80',
      },
      {
        label: 'Token Paket Aktif',
        val: paketAktif.length,
        sub: 'Siap dikerjakan siswa',
        icon: KeyRound,
        iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200/60',
      },
      {
        label: 'Pelanggaran Tercatat',
        val: pelanggarans.length,
        sub: 'Deteksi pindah tab',
        icon: AlertTriangle,
        iconBg: 'bg-amber-50 text-amber-600 border-amber-200/60',
      },
    ];

    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[#0F172A]">Dashboard CBT</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Ringkasan paket ujian, peserta, dan aktivitas database Google Apps Script
              (Spreadsheet).
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('set')}
              className="min-h-[42px] sm:min-h-[38px] px-3 sm:px-3.5 py-2 rounded-xl border border-sky-200/80 bg-white hover:bg-[#F2F8FF] text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-2xs"
            >
              <UploadCloud className="w-4 h-4 text-sky-600 shrink-0" strokeWidth={1.85} />
              <span className="truncate">Koneksi Apps Script</span>
            </button>
            <button
              type="button"
              onClick={() => openForm()}
              className="min-h-[42px] sm:min-h-[38px] px-3 sm:px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-xs shadow-sky-500/20"
            >
              <Plus className="w-4 h-4 shrink-0" strokeWidth={2} />
              <span className="truncate">Tambah Paket</span>
            </button>
          </div>
        </div>

        {/* Empty Onboarding Banner */}
        {pakets.length === 0 && (
          <div className="bg-white border border-sky-100 shadow-xs rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[#0F172A]">
                Database Spreadsheet Masih Kosong
              </h2>
              <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                Tambahkan paket soal pertama Anda, periksa koneksi Web App Apps Script, atau isi
                data contoh awal ke Google Spreadsheet untuk menguji coba.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedSample}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-sky-200/80 bg-white hover:bg-[#F2F8FF] text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Database className="w-4 h-4 text-sky-600" strokeWidth={1.85} />
                {seeding ? 'Mengisi...' : 'Isi Contoh'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('set')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <UploadCloud className="w-4 h-4" strokeWidth={1.85} />
                Cek Koneksi
              </button>
            </div>
          </div>
        )}

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {kpiItems.map((k) => {
            const Icon = k.icon;
            return (
              <div
                key={k.label}
                className="bg-white border border-sky-100 shadow-2xs hover:shadow-sm transition-shadow rounded-2xl p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <span className="text-xs font-medium text-slate-500 leading-snug">{k.label}</span>
                  <span
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center shrink-0 ${k.iconBg}`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.9} />
                  </span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums">
                  {k.val}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-1 truncate">{k.sub}</div>
              </div>
            );
          })}
        </div>

        {/* Overview Tables & Mobile Lists */}
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-5">
          {/* Paket Soal Card */}
          <div className="bg-white border border-sky-100 shadow-2xs rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-sky-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <FolderOpen className="w-4 h-4" strokeWidth={1.85} />
                </span>
                <h2 className="font-bold text-sm text-[#0F172A]">Paket Soal Ujian</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('paket')}
                className="min-h-[36px] px-2 text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer"
              >
                Kelola Semua
              </button>
            </div>

            {/* Mobile Card Rows */}
            <div className="md:hidden divide-y divide-slate-100">
              {pakets.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 truncate">
                      {p.nama_paket_soal}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="truncate">{p.mata_pelajaran}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums shrink-0">{p.durasi_menit} mnt</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      p.status === 'Aktif' ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
              {pakets.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">Belum ada paket soal.</div>
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 text-left text-xs text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-4">Nama Paket</th>
                    <th className="py-2.5 px-4">Mapel</th>
                    <th className="py-2.5 px-4">Durasi</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pakets.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-slate-900">{p.nama_paket_soal}</td>
                      <td className="py-2.5 px-4 text-slate-600">{p.mata_pelajaran}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600">
                        {p.durasi_menit} mnt
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`text-xs font-semibold ${
                            p.status === 'Aktif' ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {pakets.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                        Belum ada paket soal.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Tokens Card */}
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <KeyRound className="w-4 h-4" strokeWidth={1.85} />
              </span>
              <h2 className="font-bold text-sm text-slate-900">Token Paket Soal Aktif</h2>
            </div>

            {/* Mobile Card Rows */}
            <div className="md:hidden divide-y divide-slate-100">
              {paketAktif.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-[#0F172A] truncate">
                      {p.nama_paket_soal}
                    </div>
                    <div className="font-mono font-bold text-sm text-sky-600 tracking-wider mt-0.5">
                      {p.token_paket_soal}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToken(p.id, p.token_paket_soal)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-sky-200/80 bg-[#F2F8FF] hover:bg-[#E6F2FF] text-xs font-semibold text-slate-700 cursor-pointer shrink-0 transition-colors"
                  >
                    {copiedId === p.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" /> Disalin
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" /> Salin
                      </>
                    )}
                  </button>
                </div>
              ))}
              {paketAktif.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  Tidak ada paket yang berstatus Aktif.
                </div>
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F2F8FF] text-left text-xs text-slate-600 border-b border-sky-100">
                  <tr>
                    <th className="py-2.5 px-4">Nama Paket</th>
                    <th className="py-2.5 px-4">Token</th>
                    <th className="py-2.5 px-4 text-right">Salin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paketAktif.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F2F8FF]/70 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-[#0F172A]">{p.nama_paket_soal}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-sky-600 tracking-wider">
                        {p.token_paket_soal}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => copyToken(p.id, p.token_paket_soal)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-200/80 bg-white hover:bg-[#F2F8FF] text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                        >
                          {copiedId === p.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" /> Disalin
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-500" /> Salin
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paketAktif.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-xs text-slate-400">
                        Tidak ada paket yang berstatus Aktif.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== TAB: DAFTAR UJIAN (PAKET) =====
  const hasActiveFilter = filterStatus !== 'ALL' || Boolean(filterMapel) || Boolean(searchPaket.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#0F172A]">Daftar Ujian</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Menampilkan {filteredPakets.length} dari {pakets.length} paket ujian.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openForm()}
          className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-xs shadow-sky-500/20"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          Tambah Ujian
        </button>
      </div>

      {/* Filter Status (Aktif/Nonaktif), Mata Pelajaran & Pencarian */}
      <div className="bg-white border border-sky-100 shadow-2xs rounded-2xl p-3 sm:p-3.5 flex flex-col lg:flex-row lg:items-center gap-2.5">
        <div className="grid grid-cols-3 sm:inline-flex bg-[#F2F8FF] p-1 rounded-xl shrink-0">
          {(
            [
              { id: 'ALL', label: `Semua (${pakets.length})` },
              { id: 'Aktif', label: `Aktif (${countAktif})` },
              { id: 'Nonaktif', label: `Nonaktif (${countNonaktif})` },
            ] as const
          ).map((item) => {
            const active = filterStatus === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilterStatus(item.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-white text-[#0F172A] shadow-2xs'
                    : 'text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 flex-1 gap-2.5">
          <select
            value={filterMapel}
            onChange={(e) => setFilterMapel(e.target.value)}
            aria-label="Filter mata pelajaran"
            className="min-h-[40px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          >
            <option value="">Semua Mata Pelajaran</option>
            {mapelList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchPaket}
                onChange={(e) => setSearchPaket(e.target.value)}
                placeholder="Cari paket atau token..."
                className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus('ALL');
                  setFilterMapel('');
                  setSearchPaket('');
                }}
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 shrink-0 cursor-pointer transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-3">
        {filteredPakets.map((p) => {
          const st = paketStats.get(p.id) || { count: 0, weight: 0 };
          return (
            <div
              key={p.id}
              className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900">{p.nama_paket_soal}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.mata_pelajaran} · {p.tampilkan_nilai ? 'Nilai tampil' : 'Nilai tersembunyi'} ·{' '}
                    {p.acak_soal ? 'Diacak' : 'Urut'}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold shrink-0 ${
                    p.status === 'Aktif' ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {p.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <div className="text-[11px] text-slate-400">Token</div>
                  <div className="font-mono font-bold text-sky-600 mt-0.5">
                    {p.token_paket_soal}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Durasi</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-700 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {p.durasi_menit}m
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Soal / Bobot</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-700 mt-0.5">
                    {st.count} / {Math.round(st.weight * 100) / 100}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => openForm(p)}
                  className="min-h-[40px] px-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyPaket(p)}
                  className="min-h-[40px] px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetPaket(p)}
                  className="min-h-[40px] px-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeletePaket(p)}
                  aria-label={`Hapus ${p.nama_paket_soal}`}
                  className="min-h-[40px] px-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hapus
                </button>
              </div>
            </div>
          );
        })}
        {filteredPakets.length === 0 && (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-sm text-slate-400">
            {pakets.length === 0
              ? 'Belum ada paket ujian. Klik "Tambah Ujian" untuk memulai.'
              : 'Tidak ada paket ujian yang cocok dengan filter.'}
          </div>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4 w-10">No</th>
                <th className="py-3 px-4">Nama Paket Soal</th>
                <th className="py-3 px-4">Mata Pelajaran</th>
                <th className="py-3 px-4">Durasi</th>
                <th className="py-3 px-4">Soal / Bobot</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Token</th>
                <th className="py-3 px-4">Jadwal</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPakets.map((p, idx) => {
                const st = paketStats.get(p.id) || { count: 0, weight: 0 };
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>{p.nama_paket_soal}</div>
                      <div className="text-[11px] font-normal text-slate-500">
                        {p.tampilkan_nilai ? 'Nilai tampil' : 'Nilai tersembunyi'} ·{' '}
                        {p.acak_soal ? 'Soal diacak' : 'Urut nomor'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{p.mata_pelajaran}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      {p.durasi_menit} mnt
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      {st.count} soal · {Math.round(st.weight * 100) / 100}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          p.status === 'Aktif' ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-sky-600">
                      {p.token_paket_soal}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 font-mono tabular-nums">
                      <div>{p.waktu_mulai || '-'}</div>
                      <div>{p.waktu_berakhir || '-'}</div>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openForm(p)}
                          className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyPaket(p)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Salin
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResetPaket(p)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeletePaket(p)}
                          title="Hapus Paket"
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPakets.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-slate-400">
                    {pakets.length === 0
                      ? 'Belum ada paket ujian. Klik "Tambah Ujian" untuk memulai.'
                      : 'Tidak ada paket ujian yang cocok dengan filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Paket Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSavePaket}
            className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl w-full max-w-xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {editing ? 'Edit Paket Ujian' : 'Tambah Paket Ujian'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Paket Soal
                </label>
                <input
                  type="text"
                  required
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Contoh: Matematika Kelas 6"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mata Pelajaran
                </label>
                <input
                  type="text"
                  required
                  value={mapel}
                  onChange={(e) => setMapel(e.target.value)}
                  placeholder="Contoh: Matematika"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Durasi (Menit)
                </label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  required
                  value={durasi}
                  onChange={(e) => setDurasi(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Nonaktif">Nonaktif</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Token Paket Soal
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value.toUpperCase())}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setToken(generateRandomToken(6))}
                    title="Acak Token"
                    className="min-w-[42px] min-h-[42px] rounded-xl border border-sky-200/80 hover:bg-[#F2F8FF] text-slate-600 flex items-center justify-center cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Waktu Mulai
                </label>
                <input
                  type="datetime-local"
                  value={waktuMulai}
                  onChange={(e) => setWaktuMulai(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Waktu Berakhir
                </label>
                <input
                  type="datetime-local"
                  value={waktuBerakhir}
                  onChange={(e) => setWaktuBerakhir(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-sky-200/80 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div className="sm:col-span-2 pt-3 space-y-2.5 border-t border-slate-100">
                <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tampilkanNilai}
                    onChange={(e) => setTampilkanNilai(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 accent-sky-500"
                  />
                  <span>Tampilkan Nilai &amp; Pembahasan langsung setelah siswa mengirim</span>
                </label>
                <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acakSoal}
                    onChange={(e) => setAcakSoal(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 accent-sky-500"
                  />
                  <span>Acak urutan soal per siswa (konsisten saat muat ulang)</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 min-h-[44px] py-2 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 min-h-[44px] py-2 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Paket'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
