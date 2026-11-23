import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  List,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Users,
  UserX,
  X,
} from 'lucide-react';
import {
  deleteSiswa,
  importSiswaBatch,
  resetPesertaUjian,
  saveSiswa,
} from '../../services/cbtService';
import type { HasilUjian, PaketUjian, ProgresUjian, Siswa } from '../../types/cbt';
import { exportRowsToExcel, readExcelOrCsvFile } from '../../utils/excelUtils';
import { formatSeconds } from '../../utils/mathFormat';

interface Props {
  tab: 'siswa' | 'ujian';
  siswas: Siswa[];
  pakets: PaketUjian[];
  hasils: HasilUjian[];
  progresList?: ProgresUjian[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function AdminSiswaAndUjian({
  tab,
  siswas,
  pakets,
  hasils,
  progresList = [],
  onRefresh,
  onToast,
}: Props) {
  const [filterKelas, setFilterKelas] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [viewMode, setViewMode] = useState<'per_kelas' | 'semua'>('per_kelas');
  const [collapsedKelas, setCollapsedKelas] = useState<Set<string>>(new Set());

  // Siswa modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editSiswa, setEditSiswa] = useState<Siswa | null>(null);
  const [namaSiswa, setNamaSiswa] = useState('');
  const [kelas, setKelas] = useState('');
  const [statusAkun, setStatusAkun] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [saving, setSaving] = useState(false);

  // Kelola ujian state
  const [selectedPaketId, setSelectedPaketId] = useState(() => pakets[0]?.id || '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const kelasList = useMemo(
    () => Array.from(new Set(siswas.map((s) => s.kelas).filter(Boolean))).sort(),
    [siswas]
  );

  const studentSummary = useMemo(() => {
    const total = siswas.length;
    const aktif = siswas.filter((s) => s.status_akun === 'Aktif').length;
    const nonaktif = siswas.filter((s) => s.status_akun === 'Nonaktif').length;
    const sedangUjian = siswas.filter((s) =>
      (s.status_ujian || '').toLowerCase().startsWith('sedang ujian')
    ).length;
    const selesaiIds = new Set(hasils.map((h) => h.siswa_id));
    const perKelasMap = new Map<
      string,
      { kelas: string; total: number; aktif: number; nonaktif: number; sedang: number }
    >();

    siswas.forEach((s) => {
      const k = s.kelas?.trim() || 'Tanpa Kelas';
      const entry = perKelasMap.get(k) || {
        kelas: k,
        total: 0,
        aktif: 0,
        nonaktif: 0,
        sedang: 0,
      };
      entry.total += 1;
      if (s.status_akun === 'Aktif') entry.aktif += 1;
      else entry.nonaktif += 1;
      if ((s.status_ujian || '').toLowerCase().startsWith('sedang ujian')) entry.sedang += 1;
      perKelasMap.set(k, entry);
    });

    const perKelas = Array.from(perKelasMap.values()).sort((a, b) =>
      a.kelas.localeCompare(b.kelas)
    );

    return {
      total,
      aktif,
      nonaktif,
      sedangUjian,
      selesaiUjian: selesaiIds.size,
      totalKelas: perKelas.length,
      perKelas,
    };
  }, [hasils, siswas]);

  const filteredSiswas = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return siswas.filter((s) => {
      if (filterKelas && s.kelas !== filterKelas) return false;
      if (filterStatus && s.status_akun !== filterStatus) return false;
      if (q && !s.nama_siswa.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filterKelas, filterStatus, searchQ, siswas]);

  const groupedFilteredSiswas = useMemo(() => {
    const map = new Map<string, Siswa[]>();
    filteredSiswas.forEach((s) => {
      const k = s.kelas?.trim() || 'Tanpa Kelas';
      const list = map.get(k) || [];
      list.push(s);
      map.set(k, list);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kelasName, items]) => ({
        kelasName,
        items: [...items].sort((x, y) => x.nama_siswa.localeCompare(y.nama_siswa)),
        aktif: items.filter((i) => i.status_akun === 'Aktif').length,
        nonaktif: items.filter((i) => i.status_akun === 'Nonaktif').length,
      }));
  }, [filteredSiswas]);

  const toggleKelasCollapse = (kelasName: string) => {
    setCollapsedKelas((prev) => {
      const next = new Set(prev);
      if (next.has(kelasName)) next.delete(kelasName);
      else next.add(kelasName);
      return next;
    });
  };

  const openSiswaForm = (s?: Siswa) => {
    if (s) {
      setEditSiswa(s);
      setNamaSiswa(s.nama_siswa);
      setKelas(s.kelas);
      setStatusAkun(s.status_akun);
    } else {
      setEditSiswa(null);
      setNamaSiswa('');
      setKelas('');
      setStatusAkun('Aktif');
    }
    setModalOpen(true);
  };

  const handleSaveSiswa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaSiswa.trim() || !kelas.trim()) {
      onToast('Nama siswa dan kelas wajib diisi.', 'err');
      return;
    }
    setSaving(true);
    try {
      await saveSiswa({
        id: editSiswa?.id,
        nama_siswa: namaSiswa.trim(),
        kelas: kelas.trim(),
        status_ujian: editSiswa?.status_ujian || 'Belum',
        status_akun: statusAkun,
      });
      setModalOpen(false);
      await onRefresh();
      onToast(editSiswa ? 'Data siswa diperbarui.' : 'Siswa baru ditambahkan.', 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan siswa.', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleImportSiswa = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = await readExcelOrCsvFile(file);
      const list = raw.map((r) => ({
        nama_siswa: String(r.Nama_Siswa || r.Nama || r.nama || ''),
        kelas: String(r.Kelas || r.kelas || '-'),
        status_akun: String(r.Status_Akun || 'Aktif'),
      }));
      const res = await importSiswaBatch(list, siswas);
      await onRefresh();
      onToast(`Impor selesai: ${res.added} ditambah, ${res.skipped} dilewati.`, 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mengimpor data siswa.', 'err');
    }
  };

  const handleDeleteSiswaItem = async (s: Siswa) => {
    if (!window.confirm(`Hapus siswa "${s.nama_siswa}"?`)) return;
    await deleteSiswa(s.id);
    await onRefresh();
    onToast('Siswa dihapus.', 'ok');
  };

  if (tab === 'siswa') {
    const renderSiswaMobileCard = (s: Siswa) => (
      <div
        key={s.id}
        className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <div className="font-semibold text-sm text-slate-900 truncate">{s.nama_siswa}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
            <span>Kelas {s.kelas}</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                s.status_akun === 'Aktif'
                  ? 'text-emerald-600 font-semibold'
                  : 'text-rose-600 font-semibold'
              }
            >
              {s.status_akun}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 truncate">{s.status_ujian}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => openSiswaForm(s)}
            aria-label={`Edit ${s.nama_siswa}`}
            className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteSiswaItem(s)}
            aria-label={`Hapus ${s.nama_siswa}`}
            className="min-h-[40px] min-w-[40px] rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );

    const renderSiswaTableRows = (list: Siswa[], showKelasCol: boolean) =>
      list.map((s, idx) => (
        <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
          <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">{idx + 1}</td>
          <td className="py-2.5 px-4 font-semibold text-slate-900">{s.nama_siswa}</td>
          {showKelasCol && <td className="py-2.5 px-4 text-slate-700">{s.kelas}</td>}
          <td className="py-2.5 px-4 text-xs text-slate-600">{s.status_ujian}</td>
          <td className="py-2.5 px-4">
            <span
              className={`text-xs font-semibold ${
                s.status_akun === 'Aktif' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {s.status_akun}
            </span>
          </td>
          <td className="py-2.5 px-4 text-right whitespace-nowrap">
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openSiswaForm(s)}
                className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSiswaItem(s)}
                aria-label={`Hapus ${s.nama_siswa}`}
                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </tr>
      ));

    return (
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Kelola Siswa</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Total {studentSummary.total} peserta didik di {studentSummary.totalKelas} kelas (
              {filteredSiswas.length} ditampilkan).
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openSiswaForm()}
              className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-xs shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              Tambah Siswa
            </button>
            <label className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-xs shadow-emerald-600/20">
              <Upload className="w-4 h-4" strokeWidth={1.85} />
              Impor Excel
              <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImportSiswa} />
            </label>
            <button
              type="button"
              onClick={() =>
                exportRowsToExcel('template_siswa.xlsx', ['Nama_Siswa', 'Kelas', 'Status_Akun'], [
                  { Nama_Siswa: 'Andi Saputra', Kelas: '6A', Status_Akun: 'Aktif' },
                ])
              }
              className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-500" strokeWidth={1.85} />
              Template
            </button>
            <button
              type="button"
              onClick={() =>
                exportRowsToExcel(
                  'daftar_siswa.xlsx',
                  ['Nama_Siswa', 'Kelas', 'Status_Ujian', 'Status_Akun'],
                  siswas.map((s) => ({
                    Nama_Siswa: s.nama_siswa,
                    Kelas: s.kelas,
                    Status_Ujian: s.status_ujian,
                    Status_Akun: s.status_akun,
                  }))
                )
              }
              className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" strokeWidth={1.85} />
              Ekspor
            </button>
          </div>
        </div>

        {/* Informasi Seluruh Peserta Didik */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Seluruh Peserta Didik</span>
              <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {studentSummary.total}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {studentSummary.totalKelas} rombongan kelas
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Akun Aktif</span>
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {studentSummary.aktif}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Dapat mengikuti ujian</div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Akun Nonaktif</span>
              <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <UserX className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {studentSummary.nonaktif}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Akses ujian dinonaktifkan</div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Aktivitas Ujian</span>
              <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <GraduationCap className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {studentSummary.selesaiUjian}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Sudah ujian · {studentSummary.sedangUjian} sedang berlangsung
            </div>
          </div>
        </div>

        {/* Ringkasan & Pilih Cepat Per Kelas */}
        {studentSummary.perKelas.length > 0 && (
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3.5 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800">
                Ringkasan Peserta Didik Per Kelas
              </div>
              {filterKelas && (
                <button
                  type="button"
                  onClick={() => setFilterKelas('')}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Tampilkan Semua Kelas
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <button
                type="button"
                onClick={() => setFilterKelas('')}
                className={`text-left rounded-xl border p-2.5 transition-all cursor-pointer ${
                  filterKelas === ''
                    ? 'bg-sky-50/90 border-sky-300 ring-1 ring-sky-300/60'
                    : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold text-slate-900">Semua Kelas</div>
                <div className="text-[11px] font-mono tabular-nums text-slate-600 mt-0.5">
                  {studentSummary.total} siswa
                </div>
              </button>
              {studentSummary.perKelas.map((item) => {
                const selected = filterKelas === item.kelas;
                return (
                  <button
                    key={item.kelas}
                    type="button"
                    onClick={() =>
                      setFilterKelas((cur) => (cur === item.kelas ? '' : item.kelas))
                    }
                    className={`text-left rounded-xl border p-2.5 transition-all cursor-pointer ${
                      selected
                        ? 'bg-sky-50/90 border-sky-300 ring-1 ring-sky-300/60'
                        : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        Kelas {item.kelas}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-sky-700 tabular-nums">
                        {item.total}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {item.aktif} aktif{item.nonaktif > 0 ? ` · ${item.nonaktif} nonaktif` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Bar & Mode Tampilan */}
        <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3 sm:p-3.5 flex flex-col lg:flex-row lg:items-center gap-2.5">
          <div className="grid grid-cols-2 sm:inline-flex bg-slate-100/90 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('per_kelas')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'per_kelas'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Per Kelas</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('semua')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'semua'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Semua Daftar</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 flex-1 gap-2.5">
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">Semua Kelas</option>
              {kelasList.map((k) => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">Semua Status Akun</option>
              <option value="Aktif">Aktif</option>
              <option value="Nonaktif">Nonaktif</option>
            </select>
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Cari nama siswa..."
                className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* TAMPILAN PER KELAS */}
        {viewMode === 'per_kelas' ? (
          <div className="space-y-3.5">
            {groupedFilteredSiswas.map((grp) => {
              const isCollapsed = collapsedKelas.has(grp.kelasName);
              return (
                <div
                  key={grp.kelasName}
                  className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleKelasCollapse(grp.kelasName)}
                    className="w-full px-4 py-3 bg-slate-50/80 hover:bg-slate-100/70 border-b border-slate-100 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-xl bg-sky-100/80 text-sky-700 font-bold text-xs flex items-center justify-center shrink-0">
                        {grp.kelasName.slice(0, 3)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900">
                          Kelas {grp.kelasName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {grp.items.length} peserta didik ·{' '}
                          <span className="text-emerald-600 font-semibold">{grp.aktif} aktif</span>
                          {grp.nonaktif > 0 && (
                            <>
                              {' '}
                              ·{' '}
                              <span className="text-rose-600 font-semibold">
                                {grp.nonaktif} nonaktif
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <>
                      {/* Mobile Cards per Class */}
                      <div className="md:hidden p-3 space-y-2.5 bg-slate-50/40">
                        {grp.items.map((s) => renderSiswaMobileCard(s))}
                      </div>

                      {/* Desktop Table per Class */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50/40 text-left text-xs text-slate-500 border-b border-slate-100">
                            <tr>
                              <th className="py-2.5 px-4 w-10">No</th>
                              <th className="py-2.5 px-4">Nama Siswa</th>
                              <th className="py-2.5 px-4">Status Ujian</th>
                              <th className="py-2.5 px-4">Status Akun</th>
                              <th className="py-2.5 px-4 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {renderSiswaTableRows(grp.items, false)}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {groupedFilteredSiswas.length === 0 && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-sm text-slate-400">
                Tidak ada data siswa yang cocok.
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards (Semua Daftar) */}
            <div className="md:hidden space-y-2.5">
              {filteredSiswas.map((s) => renderSiswaMobileCard(s))}
              {filteredSiswas.length === 0 && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-sm text-slate-400">
                  Tidak ada data siswa yang cocok.
                </div>
              )}
            </div>

            {/* Desktop Table (Semua Daftar) */}
            <div className="hidden md:block bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
                    <tr>
                      <th className="py-3 px-4 w-10">No</th>
                      <th className="py-3 px-4">Nama Siswa</th>
                      <th className="py-3 px-4">Kelas</th>
                      <th className="py-3 px-4">Status Ujian</th>
                      <th className="py-3 px-4">Status Akun</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {renderSiswaTableRows(filteredSiswas, true)}
                    {filteredSiswas.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                          Tidak ada data siswa yang cocok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <form
              onSubmit={handleSaveSiswa}
              className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {editSiswa ? 'Edit Data Siswa' : 'Tambah Siswa'}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Siswa</label>
                <input
                  type="text"
                  required
                  value={namaSiswa}
                  onChange={(e) => setNamaSiswa(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                <input
                  type="text"
                  required
                  value={kelas}
                  onChange={(e) => setKelas(e.target.value)}
                  placeholder="Contoh: 6A"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status Akun</label>
                <select
                  value={statusAkun}
                  onChange={(e) => setStatusAkun(e.target.value as 'Aktif' | 'Nonaktif')}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Nonaktif">Nonaktif</option>
                </select>
              </div>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 min-h-[44px] py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 min-h-[44px] py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ===== TAB: KELOLA UJIAN (RESET PESERTA) =====
  const activePaket = pakets.find((p) => p.id === selectedPaketId) || pakets[0] || null;
  const hasilMap = new Map(
    hasils.filter((h) => activePaket && h.paket_id === activePaket.id).map((h) => [h.siswa_id, h])
  );
  const progMap = new Map(
    progresList.filter((p) => activePaket && p.paket_id === activePaket.id).map((p) => [p.siswa_id, p])
  );

  const handleResetSelected = async () => {
    if (!activePaket || selectedIds.size === 0) {
      onToast('Centang siswa yang ingin direset terlebih dahulu.', 'err');
      return;
    }
    if (!window.confirm(`Reset ujian untuk ${selectedIds.size} siswa terpilih?`)) return;
    const n = await resetPesertaUjian(activePaket, Array.from(selectedIds));
    setSelectedIds(new Set());
    await onRefresh();
    onToast(`${n} siswa berhasil direset.`, 'ok');
  };

  const handleResetAll = async () => {
    if (!activePaket) return;
    if (!window.confirm(`Reset SEMUA peserta pada paket "${activePaket.nama_paket_soal}"?`)) return;
    const n = await resetPesertaUjian(activePaket);
    setSelectedIds(new Set());
    await onRefresh();
    onToast(`${n} peserta berhasil direset.`, 'ok');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Kelola Ujian Peserta</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Reset status pengerjaan, progres sementara, atau hasil siswa untuk mengulang ujian.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <select
            value={activePaket?.id || ''}
            onChange={(e) => {
              setSelectedPaketId(e.target.value);
              setSelectedIds(new Set());
            }}
            className="col-span-2 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
          >
            {pakets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama_paket_soal}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void handleResetSelected()}
            className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Reset ({selectedIds.size})</span>
          </button>

          <button
            type="button"
            onClick={() => void handleResetAll()}
            className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Reset Semua</span>
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        <select
          value={filterKelas}
          onChange={(e) => setFilterKelas(e.target.value)}
          className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
        >
          <option value="">Semua Kelas</option>
          {kelasList.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Cari nama siswa..."
            className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
          />
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2.5">
        {filteredSiswas.map((s) => {
          const h = hasilMap.get(s.id);
          const pg = progMap.get(s.id);
          const statusLabel = h
            ? 'Selesai'
            : activePaket && s.status_ujian === `Sedang Ujian: ${activePaket.nama_paket_soal}`
            ? 'Sedang Ujian'
            : 'Belum';
          const checked = selectedIds.has(s.id);

          return (
            <div
              key={s.id}
              className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 flex items-center justify-between gap-3"
            >
              <label className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setSelectedIds(next);
                  }}
                  className="mt-1 w-4 h-4 rounded border-slate-300"
                />
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-900 truncate">{s.nama_siswa}</div>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>Kelas {s.kelas}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        statusLabel === 'Selesai'
                          ? 'text-emerald-600'
                          : statusLabel === 'Sedang Ujian'
                          ? 'text-blue-600'
                          : 'text-slate-400'
                      }`}
                    >
                      {statusLabel}
                    </span>
                    {statusLabel === 'Sedang Ujian' && pg && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatSeconds(pg.sisa_detik)}</span>
                      </>
                    )}
                  </div>
                </div>
              </label>
              {activePaket && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Reset ujian untuk "${s.nama_siswa}"?`)) return;
                    await resetPesertaUjian(activePaket, [s.id]);
                    await onRefresh();
                    onToast(`Ujian "${s.nama_siswa}" berhasil direset.`, 'ok');
                  }}
                  className="min-h-[40px] px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={filteredSiswas.length > 0 && selectedIds.size === filteredSiswas.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(filteredSiswas.map((s) => s.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className="py-3 px-4">Nama Siswa</th>
                <th className="py-3 px-4">Kelas</th>
                <th className="py-3 px-4">Status Pengerjaan</th>
                <th className="py-3 px-4">Sisa Waktu</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSiswas.map((s) => {
                const h = hasilMap.get(s.id);
                const pg = progMap.get(s.id);
                const statusLabel = h
                  ? 'Selesai'
                  : activePaket && s.status_ujian === `Sedang Ujian: ${activePaket.nama_paket_soal}`
                  ? 'Sedang Ujian'
                  : 'Belum';
                return (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{s.nama_siswa}</td>
                    <td className="py-2.5 px-4 text-slate-700">{s.kelas}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          statusLabel === 'Selesai'
                            ? 'text-emerald-600'
                            : statusLabel === 'Sedang Ujian'
                            ? 'text-blue-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600">
                      {statusLabel === 'Sedang Ujian' && pg ? formatSeconds(pg.sisa_detik) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {activePaket && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Reset ujian untuk "${s.nama_siswa}"?`)) return;
                            await resetPesertaUjian(activePaket, [s.id]);
                            await onRefresh();
                            onToast(`Ujian "${s.nama_siswa}" berhasil direset.`, 'ok');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
