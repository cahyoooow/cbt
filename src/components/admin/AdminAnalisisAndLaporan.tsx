import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  BarChart3,
  BookOpen,
  Calculator,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Gauge,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  deletePelanggaranByIds,
  importPelanggaranBatch,
  migratePelanggaranFromGas,
  rescoreHasil,
  resetPelanggaran,
  updatePelanggaran,
} from '../../services/cbtService';
import type {
  HasilUjian,
  LogPelanggaran,
  PaketUjian,
  Pengaturan,
  SoalLengkap,
} from '../../types/cbt';
import { exportRowsToExcel, exportStructuredExcel, readExcelOrCsvFile } from '../../utils/excelUtils';
import { exportTablePdf, stripRichMarkup, triggerPrintOrPdf } from '../../utils/pdfUtils';
import { calculateExamScore, scoreQuestion } from '../../utils/mathFormat';
import { RichText } from '../RichText';

interface Props {
  tab: 'jwb' | 'hasil' | 'matriks' | 'butir' | 'pelanggaran';
  settings?: Pengaturan;
  pakets: PaketUjian[];
  soals: SoalLengkap[];
  hasils: HasilUjian[];
  pelanggarans: LogPelanggaran[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function AdminAnalisisAndLaporan({
  tab,
  settings,
  pakets,
  soals,
  hasils,
  pelanggarans,
  onRefresh,
  onToast,
}: Props) {
  const [selectedPaketId, setSelectedPaketId] = useState(() => pakets[0]?.id || '');
  const [pelanggaranPaketFilter, setPelanggaranPaketFilter] = useState('__ALL__');
  const [filterKelas, setFilterKelas] = useState('');
  const [filterMapel, setFilterMapel] = useState('');
  const [filterKategori, setFilterKategori] = useState<'' | 'Mudah' | 'Sedang' | 'Sulit'>('');
  const [searchQ, setSearchQ] = useState('');
  const [detailModal, setDetailModal] = useState<HasilUjian | null>(null);
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [rescoring, setRescoring] = useState(false);
  const [importingLogs, setImportingLogs] = useState(false);
  const [showGasSync, setShowGasSync] = useState(false);
  const [syncGasUrl, setSyncGasUrl] = useState(() => {
    try {
      return (
        localStorage.getItem('cbt_legacy_gas_url') ||
        'https://script.google.com/macros/s/AKfycbwCLsMHzKd_wqwLX-5w71sKtmubFHSxAgcr1Bdlcr-IESMcl21QBlKyBoI3L0df3a1X/exec'
      );
    } catch {
      return 'https://script.google.com/macros/s/AKfycbwCLsMHzKd_wqwLX-5w71sKtmubFHSxAgcr1Bdlcr-IESMcl21QBlKyBoI3L0df3a1X/exec';
    }
  });
  const [syncGasPw, setSyncGasPw] = useState('');
  const [syncingGas, setSyncingGas] = useState(false);

  // Pelanggaran Edit & Reset modals
  const [editLog, setEditLog] = useState<LogPelanggaran | null>(null);
  const [editLogNama, setEditLogNama] = useState('');
  const [editLogKelas, setEditLogKelas] = useState('');
  const [editLogPaketId, setEditLogPaketId] = useState('');
  const [editLogPaketNama, setEditLogPaketNama] = useState('');
  const [editLogJenis, setEditLogJenis] = useState('');
  const [editLogStatus, setEditLogStatus] = useState('');
  const [savingEditLog, setSavingEditLog] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTargetSiswa, setResetTargetSiswa] = useState('__ALL__');
  const [resettingPel, setResettingPel] = useState(false);

  const activePaket = useMemo(
    () => pakets.find((p) => p.id === selectedPaketId) || pakets[0] || null,
    [pakets, selectedPaketId]
  );

  const paketSoals = useMemo(
    () =>
      activePaket
        ? soals
            .filter((s) => s.paket_id === activePaket.id)
            .sort((a, b) => a.nomor_soal - b.nomor_soal)
        : [],
    [activePaket, soals]
  );

  const paketHasils = useMemo(
    () =>
      activePaket
        ? hasils
            .filter((h) => h.paket_id === activePaket.id)
            .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama_siswa.localeCompare(b.nama_siswa))
        : [],
    [activePaket, hasils]
  );

  const kelasList = useMemo(
    () => Array.from(new Set(hasils.map((h) => h.kelas).filter(Boolean))).sort(),
    [hasils]
  );

  const mapelList = useMemo(
    () => Array.from(new Set(pakets.map((p) => p.mata_pelajaran).filter(Boolean))).sort(),
    [pakets]
  );

  // ===== TAB: KELOLA JAWABAN =====
  if (tab === 'jwb') {
    const handleRescoreAll = async () => {
      if (!activePaket) return;
      setRescoring(true);
      try {
        const n = await rescoreHasil(activePaket, paketSoals, paketHasils);
        await onRefresh();
        onToast(`${n} hasil ujian dihitung ulang berdasarkan kunci terbaru.`, 'ok');
      } catch (err) {
        onToast(err instanceof Error ? err.message : 'Gagal menghitung ulang.', 'err');
      } finally {
        setRescoring(false);
      }
    };

    const rows = paketHasils.map((h) => {
      const scored = calculateExamScore(paketSoals, h.detail_jawaban || {});
      return { h, scored };
    });

    const detailScored = detailModal
      ? calculateExamScore(paketSoals, detailModal.detail_jawaban || {})
      : null;

    return (
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Kelola Jawaban Siswa</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik Hitung Ulang jika kunci jawaban atau bobot soal diperbarui.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <select
              value={activePaket?.id || ''}
              onChange={(e) => setSelectedPaketId(e.target.value)}
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
              disabled={rescoring || paketHasils.length === 0}
              onClick={() => void handleRescoreAll()}
              className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${rescoring ? 'animate-spin' : ''}`} />
              <span>{rescoring ? 'Menghitung...' : 'Hitung Ulang'}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportRowsToExcel(
                  `jawaban_${activePaket?.nama_paket_soal || 'cbt'}.xlsx`,
                  ['Nama_Siswa', 'Kelas', 'Jawaban', 'Skor_Benar', 'Skor_Salah', 'Nilai'],
                  rows.map(({ h, scored }) => ({
                    Nama_Siswa: h.nama_siswa,
                    Kelas: h.kelas,
                    Jawaban: scored.rev.map((r) => `${r.no}:${r.jawab || '-'}`).join(' | '),
                    Skor_Benar: h.total_benar,
                    Skor_Salah: h.total_salah,
                    Nilai: h.nilai_akhir,
                  }))
                )
              }
              className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Ekspor Excel</span>
            </button>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-2.5">
          {rows.map(({ h, scored }) => (
            <div
              key={h.id}
              className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-900 truncate">
                    {h.nama_siswa}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Kelas {h.kelas} · B/S: {h.total_benar} / {h.total_salah}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-slate-400">Nilai</div>
                  <div className="font-mono tabular-nums font-bold text-base text-slate-900">
                    {h.nilai_akhir}
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-mono text-slate-600 bg-slate-50 rounded-xl p-2.5 break-words line-clamp-2">
                {scored.rev.map((r) => `${r.no}:${r.jawab || '-'}`).join(' | ')}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDetailModal(h)}
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Detail
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!activePaket) return;
                    await rescoreHasil(activePaket, paketSoals, [h]);
                    await onRefresh();
                    onToast(`Nilai "${h.nama_siswa}" diperbarui.`, 'ok');
                  }}
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Hitung Ulang
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-sm text-slate-400">
              Belum ada jawaban terkumpul pada paket ini.
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
                  <th className="py-3 px-4">Nama Siswa</th>
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Ringkasan Jawaban</th>
                  <th className="py-3 px-4">Skor B / S</th>
                  <th className="py-3 px-4">Nilai</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {rows.map(({ h, scored }, idx) => (
                  <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{h.nama_siswa}</td>
                    <td className="py-2.5 px-4 text-slate-700">{h.kelas}</td>
                    <td className="py-2.5 px-4 text-xs font-mono text-slate-600 max-w-md break-words">
                      {scored.rev.map((r) => `${r.no}:${r.jawab || '-'}`).join(' | ')}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                      {h.total_benar} / {h.total_salah}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-slate-900">
                      {h.nilai_akhir}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailModal(h)}
                          className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Detail
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!activePaket) return;
                            await rescoreHasil(activePaket, paketSoals, [h]);
                            await onRefresh();
                            onToast(`Nilai "${h.nama_siswa}" diperbarui.`, 'ok');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Hitung Ulang
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                      Belum ada jawaban terkumpul pada paket ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {detailModal && detailScored && (
          <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    Detail Jawaban: {detailModal.nama_siswa}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kelas {detailModal.kelas} · Nilai: {detailScored.nilai} (Benar{' '}
                    {detailScored.benar} · Salah {detailScored.salah})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailModal(null)}
                  className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 sm:p-5 overflow-y-auto space-y-3">
                {detailScored.rev.map((r) => (
                  <div
                    key={r.id_soal}
                    className={`rounded-xl border p-3.5 ${
                      r.benar
                        ? 'bg-emerald-50/50 border-emerald-200/80'
                        : r.skor > 0
                        ? 'bg-amber-50/50 border-amber-200/80'
                        : 'bg-rose-50/50 border-rose-200/80'
                    }`}
                  >
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span>No. {r.no}</span>
                      <span className="font-mono tabular-nums">
                        Skor {r.skor} / {r.maks}
                      </span>
                    </div>
                    <RichText text={r.soal} className="text-xs text-slate-800 mb-1.5" />
                    <div className="text-xs text-slate-600">
                      Jawaban: <strong>{r.jawab || '-'}</strong> · Kunci: <strong>{r.kunci}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== TAB: REKAP NILAI =====
  if (tab === 'hasil') {
    const paketMap = new Map(pakets.map((p) => [p.id, p]));
    const filtered = hasils.filter((h) => {
      const pk = paketMap.get(h.paket_id);
      if (selectedPaketId && h.paket_id !== selectedPaketId && selectedPaketId !== '__ALL__')
        return false;
      if (filterMapel && pk?.mata_pelajaran !== filterMapel) return false;
      if (filterKelas && h.kelas !== filterKelas) return false;
      if (searchQ && !h.nama_siswa.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });

    const selectedRekapPaket =
      selectedPaketId && selectedPaketId !== '__ALL__' ? paketMap.get(selectedPaketId) || null : null;
    const jumlahPeserta = filtered.length;
    const scores = filtered.map((h) => Number(h.nilai_akhir) || 0);
    const rataRata =
      jumlahPeserta > 0
        ? Math.round((scores.reduce((acc, s) => acc + s, 0) / jumlahPeserta) * 100) / 100
        : 0;
    const variance =
      jumlahPeserta > 0
        ? scores.reduce((acc, s) => acc + Math.pow(s - rataRata, 2), 0) / jumlahPeserta
        : 0;
    const standarDeviasi =
      jumlahPeserta > 0 ? Math.round(Math.sqrt(variance) * 100) / 100 : 0;
    const nilaiTertinggi = jumlahPeserta > 0 ? Math.max(...scores) : 0;
    const nilaiTerendah = jumlahPeserta > 0 ? Math.min(...scores) : 0;

    const judulSekolah = settings?.judul?.trim() || 'Portal Ujian CBT';
    const subjudulSekolah = settings?.subjudul?.trim() || '';
    const judulLaporan = 'REKAPITULASI NILAI HASIL UJIAN';
    const namaUjian = selectedRekapPaket ? selectedRekapPaket.nama_paket_soal : 'Semua Paket Ujian';
    const namaMapel =
      filterMapel || selectedRekapPaket?.mata_pelajaran || 'Semua Mata Pelajaran';
    const namaKelas = filterKelas || 'Semua Kelas';

    const handleExportRekapExcel = () => {
      const slug = selectedRekapPaket
        ? selectedRekapPaket.nama_paket_soal.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        : 'semua_ujian';
      exportStructuredExcel({
        filename: `rekap_nilai_${slug}.xlsx`,
        sheetName: 'Rekap Nilai',
        mergeTopRowsCount: subjudulSekolah ? 3 : 2,
        titleRows: [
          [judulLaporan],
          [judulSekolah],
          ...(subjudulSekolah ? [[subjudulSekolah]] : []),
          [],
          ['Ujian', namaUjian, '', 'Mata Pelajaran', namaMapel],
          ['Kelas', namaKelas, '', 'Jumlah Peserta', `${jumlahPeserta} siswa`],
          [
            'Nilai Rata-rata',
            Number(rataRata.toFixed(2)),
            '',
            'Standar Deviasi',
            Number(standarDeviasi.toFixed(2)),
          ],
        ],
        headers: [
          'No',
          'Nama_Siswa',
          'Kelas',
          'Paket',
          'Total_Benar',
          'Total_Salah',
          'Pelanggaran_Tab',
          'Nilai_Akhir',
        ],
        rows: filtered.map((h, idx) => ({
          No: idx + 1,
          Nama_Siswa: h.nama_siswa,
          Kelas: h.kelas,
          Paket: h.paket,
          Total_Benar: h.total_benar,
          Total_Salah: h.total_salah,
          Pelanggaran_Tab: h.pelanggaran_tab,
          Nilai_Akhir: h.nilai_akhir,
        })),
        summaryRows: [
          ['', 'Nilai Rata-rata', '', '', '', '', '', Number(rataRata.toFixed(2))],
          ['', 'Standar Deviasi', '', '', '', '', '', Number(standarDeviasi.toFixed(2))],
          ['', 'Nilai Tertinggi', '', '', '', '', '', nilaiTertinggi],
          ['', 'Nilai Terendah', '', '', '', '', '', nilaiTerendah],
        ],
      });
    };

    const handleExportRekapPdf = () => {
      const slug = selectedRekapPaket
        ? selectedRekapPaket.nama_paket_soal.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        : 'semua_ujian';
      exportTablePdf({
        filename: `rekap_nilai_${slug}.pdf`,
        title: judulLaporan,
        schoolName: judulSekolah,
        schoolSubtitle: subjudulSekolah,
        metaPairs: [
          { label: 'Ujian / Paket', value: namaUjian },
          { label: 'Nilai Rata-rata', value: rataRata.toFixed(2) },
          { label: 'Mata Pelajaran', value: namaMapel },
          { label: 'Standar Deviasi', value: standarDeviasi.toFixed(2) },
          { label: 'Kelas', value: namaKelas },
          { label: 'Jumlah Peserta', value: `${jumlahPeserta} siswa` },
        ],
        headers: ['No', 'Nama Siswa', 'Kelas', 'Paket Soal', 'Benar / Salah', 'Tab', 'Nilai Akhir'],
        rows: filtered.map((h, idx) => [
          idx + 1,
          h.nama_siswa,
          h.kelas,
          h.paket,
          `${h.total_benar} / ${h.total_salah}`,
          h.pelanggaran_tab,
          h.nilai_akhir,
        ]),
        footRows:
          filtered.length > 0
            ? [
                ['', 'Nilai Rata-rata', '', '', '', '', rataRata.toFixed(2)],
                ['', 'Standar Deviasi', '', '', '', '', standarDeviasi.toFixed(2)],
              ]
            : undefined,
      });
      onToast('File PDF rekap nilai berhasil diunduh.', 'ok');
    };

    return (
      <div className="space-y-4">
        {/* Print-only Formal Report Header */}
        <div className="hidden print:block border-b-2 border-slate-800 pb-3 mb-4">
          <div className="text-center space-y-0.5 mb-3">
            <div className="text-base font-bold uppercase tracking-wide text-black">
              {judulLaporan}
            </div>
            <div className="text-sm font-semibold text-black">{judulSekolah}</div>
            {subjudulSekolah && <div className="text-xs text-slate-700">{subjudulSekolah}</div>}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs border-t border-slate-300 pt-2.5">
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Ujian / Paket:</span>
              <span className="font-semibold text-black">{namaUjian}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Nilai Rata-rata:</span>
              <span className="font-bold font-mono tabular-nums text-black">
                {rataRata.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Mata Pelajaran:</span>
              <span className="font-semibold text-black">{namaMapel}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Standar Deviasi:</span>
              <span className="font-bold font-mono tabular-nums text-black">
                {standarDeviasi.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Kelas:</span>
              <span className="font-semibold text-black">{namaKelas}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Jumlah Peserta:</span>
              <span className="font-semibold font-mono tabular-nums text-black">
                {jumlahPeserta} siswa
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Rekapitulasi Nilai</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {judulSekolah} · {namaUjian} ({jumlahPeserta} catatan hasil ujian)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportRekapPdf}
              className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Cetak PDF
            </button>
            <button
              type="button"
              onClick={() => triggerPrintOrPdf(handleExportRekapPdf, (msg) => onToast(msg, 'ok'))}
              className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              Cetak
            </button>
            <button
              type="button"
              onClick={handleExportRekapExcel}
              className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Ekspor Excel
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 no-print">
          <select
            value={selectedPaketId}
            onChange={(e) => setSelectedPaketId(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
          >
            <option value="__ALL__">Semua Paket</option>
            {pakets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama_paket_soal}
              </option>
            ))}
          </select>
          <select
            value={filterMapel}
            onChange={(e) => setFilterMapel(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
          >
            <option value="">Semua Mapel</option>
            {mapelList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
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
          <div className="relative col-span-2 sm:col-span-1">
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

        {/* Summary KPI Strip (Ujian, Rata-rata, Standar Deviasi, Min/Max) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 no-print">
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Ujian &amp; Peserta</span>
              <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <BookOpen className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-sm font-bold text-slate-900 truncate" title={namaUjian}>
              {namaUjian}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {jumlahPeserta} siswa · {namaKelas}
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Nilai Rata-rata</span>
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <BarChart3 className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {rataRata.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">{namaMapel}</div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Standar Deviasi</span>
              <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Calculator className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {standarDeviasi.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Sebaran nilai peserta</div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Rentang Nilai</span>
              <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Award className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {nilaiTerendah} – {nilaiTertinggi}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Terendah – Tertinggi</div>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden print:hidden space-y-2.5">
          {filtered.map((h) => (
            <div
              key={h.id}
              className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-900 truncate">{h.nama_siswa}</div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  Kelas {h.kelas} · {h.paket}
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                  Benar {h.total_benar} · Salah {h.total_salah} · Tab {h.pelanggaran_tab}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-slate-400">Nilai</div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {h.nilai_akhir}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-sm text-slate-400">
              Belum ada hasil ujian yang cocok dengan filter.
            </div>
          )}
        </div>

        {/* Desktop & Print Table */}
        <div className="hidden md:block print:block bg-white border border-slate-200/80 shadow-2xs rounded-2xl print:rounded-none print:border-slate-300 print:shadow-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4 w-10">No</th>
                  <th className="py-3 px-4">Nama Siswa</th>
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Paket Soal</th>
                  <th className="py-3 px-4">Benar / Salah</th>
                  <th className="py-3 px-4">Pelanggaran</th>
                  <th className="py-3 px-4">Nilai Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((h, idx) => (
                  <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{h.nama_siswa}</td>
                    <td className="py-2.5 px-4 text-slate-700">{h.kelas}</td>
                    <td className="py-2.5 px-4 text-slate-600">{h.paket}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600">
                      {h.total_benar} / {h.total_salah}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600">
                      {h.pelanggaran_tab}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-slate-900">
                      {h.nilai_akhir}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                      Belum ada hasil ujian yang cocok dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-slate-50/80 border-t border-slate-200 text-xs font-semibold text-slate-800">
                  <tr>
                    <td colSpan={6} className="py-2.5 px-4 text-right">
                      Nilai Rata-rata ({jumlahPeserta} peserta)
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-slate-900">
                      {rataRata.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="py-2.5 px-4 text-right border-t border-slate-100">
                      Standar Deviasi
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-slate-900 border-t border-slate-100">
                      {standarDeviasi.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ===== TAB: MATRIKS JAWABAN =====
  if (tab === 'matriks') {
    const filtered = paketHasils.filter(
      (h) =>
        (!filterKelas || h.kelas === filterKelas) &&
        (!searchQ || h.nama_siswa.toLowerCase().includes(searchQ.toLowerCase()))
    );

    const handleExportMatriksPdf = () => {
      if (!activePaket) return;
      const slug = activePaket.nama_paket_soal.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      exportTablePdf({
        filename: `matriks_jawaban_${slug}.pdf`,
        title: 'MATRIKS ANALISIS JAWABAN PESERTA',
        schoolName: settings?.judul || 'Portal Ujian CBT',
        schoolSubtitle: settings?.subjudul || '',
        orientation: 'landscape',
        metaPairs: [
          { label: 'Paket Ujian', value: activePaket.nama_paket_soal },
          { label: 'Kelas', value: filterKelas || 'Semua Kelas' },
          { label: 'Jumlah Soal', value: `${paketSoals.length} butir` },
          { label: 'Jumlah Peserta', value: `${filtered.length} siswa` },
        ],
        headers: ['No', 'Nama Siswa', 'Kelas', ...paketSoals.map((q) => `S${q.nomor_soal}`), 'Nilai'],
        rows: filtered.map((h, idx) => [
          idx + 1,
          h.nama_siswa,
          h.kelas,
          ...paketSoals.map((q) => scoreQuestion(q, h.detail_jawaban?.[q.id_soal]).skor),
          h.nilai_akhir,
        ]),
      });
      onToast('File PDF matriks jawaban berhasil diunduh.', 'ok');
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Matriks Analisis Jawaban
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Skor tiap butir soal per siswa (penuh, sebagian, atau 0). Geser tabel ke samping pada
              layar kecil.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <select
              value={activePaket?.id || ''}
              onChange={(e) => setSelectedPaketId(e.target.value)}
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
              onClick={handleExportMatriksPdf}
              className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Cetak PDF
            </button>
            <button
              type="button"
              onClick={() => triggerPrintOrPdf(handleExportMatriksPdf, (msg) => onToast(msg, 'ok'))}
              className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              Cetak
            </button>
            <button
              type="button"
              onClick={() => {
                const headers = [
                  'Nama_Siswa',
                  'Kelas',
                  ...paketSoals.map((q) => `S${q.nomor_soal}`),
                  'Nilai',
                ];
                const exportRows = filtered.map((h) => {
                  const row: Record<string, unknown> = {
                    Nama_Siswa: h.nama_siswa,
                    Kelas: h.kelas,
                    Nilai: h.nilai_akhir,
                  };
                  paketSoals.forEach((q) => {
                    row[`S${q.nomor_soal}`] = scoreQuestion(q, h.detail_jawaban?.[q.id_soal]).skor;
                  });
                  return row;
                });
                exportRowsToExcel(
                  `matriks_${activePaket?.nama_paket_soal || 'cbt'}.xlsx`,
                  headers,
                  exportRows
                );
              }}
              className="col-span-2 sm:col-span-1 min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Ekspor Excel
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-2.5 no-print">
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

        <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
          <div className="overflow-x-auto scrollbar-smooth">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 text-left sticky left-0 bg-slate-50 z-10">
                    Nama Siswa
                  </th>
                  <th className="py-2.5 px-3 text-left">Kelas</th>
                  {paketSoals.map((q) => (
                    <th key={q.id_soal} className="py-2.5 px-2 text-center font-mono">
                      {q.nomor_soal}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 px-3 font-semibold text-slate-900 sticky left-0 bg-white whitespace-nowrap z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                      {h.nama_siswa}
                    </td>
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{h.kelas}</td>
                    {paketSoals.map((q) => {
                      const sc = scoreQuestion(q, h.detail_jawaban?.[q.id_soal]);
                      const full = sc.skor === sc.maks;
                      const partial = sc.skor > 0 && sc.skor < sc.maks;
                      return (
                        <td
                          key={q.id_soal}
                          className={`py-2 px-2 text-center font-mono tabular-nums ${
                            full
                              ? 'bg-emerald-50/80 text-emerald-700 font-semibold'
                              : partial
                              ? 'bg-amber-50/80 text-amber-700'
                              : 'bg-rose-50/50 text-rose-600'
                          }`}
                        >
                          {sc.skor}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {h.nilai_akhir}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={paketSoals.length + 3}
                      className="py-8 text-center text-slate-400"
                    >
                      Belum ada data untuk ditampilkan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ===== TAB: ANALISIS BUTIR SOAL =====
  if (tab === 'butir') {
    const filtered = paketHasils.filter((h) => !filterKelas || h.kelas === filterKelas);
    const hasPeserta = filtered.length > 0;
    const analisisRows = paketSoals.map((q) => {
      let totalSkor = 0;
      let benarPenuh = 0;
      filtered.forEach((h) => {
        const sc = scoreQuestion(q, h.detail_jawaban?.[q.id_soal]);
        totalSkor += sc.skor;
        if (sc.skor === sc.maks) benarPenuh++;
      });
      const n = filtered.length || 1;
      const rata = hasPeserta ? Math.round((totalSkor / n) * 100) / 100 : 0;
      const pct = hasPeserta ? Math.round((totalSkor / (n * (q.bobot || 1))) * 1000) / 10 : 0;
      const tingkat: 'Mudah' | 'Sedang' | 'Sulit' | 'Belum Diuji' = !hasPeserta
        ? 'Belum Diuji'
        : pct >= 70
        ? 'Mudah'
        : pct >= 30
        ? 'Sedang'
        : 'Sulit';
      return { q, benarPenuh, rata, pct, tingkat };
    });

    const totalSoal = analisisRows.length;
    const mudahCount = analisisRows.filter((a) => a.tingkat === 'Mudah').length;
    const sedangCount = analisisRows.filter((a) => a.tingkat === 'Sedang').length;
    const sulitCount = analisisRows.filter((a) => a.tingkat === 'Sulit').length;

    const mudahPct =
      hasPeserta && totalSoal > 0 ? Math.round((mudahCount / totalSoal) * 1000) / 10 : 0;
    const sedangPct =
      hasPeserta && totalSoal > 0 ? Math.round((sedangCount / totalSoal) * 1000) / 10 : 0;
    const sulitPct =
      hasPeserta && totalSoal > 0 ? Math.round((sulitCount / totalSoal) * 1000) / 10 : 0;

    const displayedRows = filterKategori
      ? analisisRows.filter((a) => a.tingkat === filterKategori)
      : analisisRows;

    const handleExportAnalisisButir = () => {
      const slug = (activePaket?.nama_paket_soal || 'cbt')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
      exportStructuredExcel({
        filename: `analisis_butir_${slug}.xlsx`,
        sheetName: 'Analisis Butir',
        mergeTopRowsCount: 2,
        titleRows: [
          ['ANALISIS TINGKAT KESUKARAN BUTIR SOAL'],
          [activePaket?.nama_paket_soal || 'Paket Ujian'],
          [],
          [
            'Total Soal',
            totalSoal,
            'Peserta Dianalisis',
            filtered.length,
            'Kelas',
            filterKelas || 'Semua Kelas',
          ],
          [
            'Soal Mudah (≥70%)',
            `${mudahCount} soal (${mudahPct}%)`,
            'Soal Sedang (30-69%)',
            `${sedangCount} soal (${sedangPct}%)`,
            'Soal Sulit (<30%)',
            `${sulitCount} soal (${sulitPct}%)`,
          ],
        ],
        headers: [
          'Nomor',
          'Jenis',
          'Bobot',
          'Benar_Penuh',
          'Rata_Skor',
          'Persen_Penguasaan',
          'Tingkat_Kesukaran',
        ],
        rows: displayedRows.map((a) => ({
          Nomor: a.q.nomor_soal,
          Jenis: a.q.jenis_soal,
          Bobot: a.q.bobot,
          Benar_Penuh: a.benarPenuh,
          Rata_Skor: a.rata,
          Persen_Penguasaan: a.pct,
          Tingkat_Kesukaran: a.tingkat,
        })),
      });
    };

    const handleExportAnalisisButirPdf = () => {
      if (!activePaket) return;
      const slug = activePaket.nama_paket_soal.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      exportTablePdf({
        filename: `analisis_butir_${slug}.pdf`,
        title: 'LAPORAN ANALISIS BUTIR SOAL',
        schoolName: settings?.judul || 'Portal Ujian CBT',
        schoolSubtitle: settings?.subjudul || '',
        orientation: 'landscape',
        metaPairs: [
          { label: 'Paket Ujian', value: activePaket.nama_paket_soal },
          { label: 'Soal Mudah (≥70%)', value: `${mudahCount} soal (${mudahPct}%)` },
          { label: 'Kelas', value: filterKelas || 'Semua Kelas' },
          { label: 'Soal Sedang (30-69%)', value: `${sedangCount} soal (${sedangPct}%)` },
          { label: 'Peserta Dianalisis', value: `${filtered.length} siswa` },
          { label: 'Soal Sulit (<30%)', value: `${sulitCount} soal (${sulitPct}%)` },
        ],
        headers: ['No', 'Jenis', 'Ringkasan Soal', 'Benar Penuh', 'Rata Skor', 'Bobot', 'Tingkat (%)', 'Kategori'],
        rows: displayedRows.map((a) => [
          a.q.nomor_soal,
          a.q.jenis_soal,
          stripRichMarkup(a.q.teks_soal).slice(0, 120),
          a.benarPenuh,
          a.rata,
          a.q.bobot,
          `${a.pct}%`,
          a.tingkat,
        ]),
      });
      onToast('File PDF analisis butir soal berhasil diunduh.', 'ok');
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Analisis Butir Soal</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Indeks tingkat kesukaran berdasarkan {filtered.length} peserta ({totalSoal} butir soal).
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <select
              value={activePaket?.id || ''}
              onChange={(e) => {
                setSelectedPaketId(e.target.value);
                setFilterKategori('');
              }}
              className="col-span-2 sm:col-span-1 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
            >
              {pakets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama_paket_soal}
                </option>
              ))}
            </select>
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="col-span-2 sm:col-span-1 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
            >
              <option value="">Semua Kelas</option>
              {kelasList.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportAnalisisButirPdf}
              className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Cetak PDF
            </button>
            <button
              type="button"
              onClick={handleExportAnalisisButir}
              className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Ekspor Excel
            </button>
          </div>
        </div>

        {/* Ringkasan Persentase Soal Mudah, Sedang, Sulit */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setFilterKategori('')}
            className={`text-left bg-white border shadow-2xs rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer ${
              filterKategori === ''
                ? 'border-sky-300 ring-1 ring-sky-300/60 bg-sky-50/30'
                : 'border-slate-200/80 hover:bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Total Butir Soal</span>
              <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <BookOpen className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {totalSoal}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {filtered.length} peserta dianalisis
            </div>
          </button>

          <button
            type="button"
            onClick={() => setFilterKategori((cur) => (cur === 'Mudah' ? '' : 'Mudah'))}
            className={`text-left bg-white border shadow-2xs rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer ${
              filterKategori === 'Mudah'
                ? 'border-emerald-300 ring-1 ring-emerald-300/70 bg-emerald-50/30'
                : 'border-slate-200/80 hover:bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Soal Mudah (≥ 70%)</span>
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-600 font-mono tabular-nums">
              {mudahPct}%
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {mudahCount} dari {totalSoal} soal
            </div>
          </button>

          <button
            type="button"
            onClick={() => setFilterKategori((cur) => (cur === 'Sedang' ? '' : 'Sedang'))}
            className={`text-left bg-white border shadow-2xs rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer ${
              filterKategori === 'Sedang'
                ? 'border-sky-300 ring-1 ring-sky-300/70 bg-sky-50/30'
                : 'border-slate-200/80 hover:bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">
                Soal Sedang (30–69%)
              </span>
              <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <Gauge className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-sky-600 font-mono tabular-nums">
              {sedangPct}%
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {sedangCount} dari {totalSoal} soal
            </div>
          </button>

          <button
            type="button"
            onClick={() => setFilterKategori((cur) => (cur === 'Sulit' ? '' : 'Sulit'))}
            className={`text-left bg-white border shadow-2xs rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer ${
              filterKategori === 'Sulit'
                ? 'border-rose-300 ring-1 ring-rose-300/70 bg-rose-50/30'
                : 'border-slate-200/80 hover:bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">Soal Sulit (&lt; 30%)</span>
              <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-rose-600 font-mono tabular-nums">
              {sulitPct}%
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {sulitCount} dari {totalSoal} soal
            </div>
          </button>
        </div>

        {/* Visual Proporsi Tingkat Kesukaran */}
        {totalSoal > 0 && (
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-800">
                Proporsi Tingkat Kesukaran Butir Soal
              </span>
              {filterKategori ? (
                <button
                  type="button"
                  onClick={() => setFilterKategori('')}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Menampilkan kategori {filterKategori} · Tampilkan Semua
                </button>
              ) : (
                <span className="text-[11px] text-slate-500">
                  Klik kartu di atas untuk memfilter soal berdasarkan kategori
                </span>
              )}
            </div>

            {hasPeserta ? (
              <>
                <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                  {mudahPct > 0 && (
                    <div
                      style={{ width: `${mudahPct}%` }}
                      className="bg-emerald-500 transition-all duration-300"
                      title={`Mudah: ${mudahCount} soal (${mudahPct}%)`}
                    />
                  )}
                  {sedangPct > 0 && (
                    <div
                      style={{ width: `${sedangPct}%` }}
                      className="bg-sky-500 transition-all duration-300"
                      title={`Sedang: ${sedangCount} soal (${sedangPct}%)`}
                    />
                  )}
                  {sulitPct > 0 && (
                    <div
                      style={{ width: `${sulitPct}%` }}
                      className="bg-rose-500 transition-all duration-300"
                      title={`Sulit: ${sulitCount} soal (${sulitPct}%)`}
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                    Mudah: <strong className="font-mono tabular-nums text-slate-900">{mudahPct}%</strong> ({mudahCount})
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
                    Sedang: <strong className="font-mono tabular-nums text-slate-900">{sedangPct}%</strong> ({sedangCount})
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                    Sulit: <strong className="font-mono tabular-nums text-slate-900">{sulitPct}%</strong> ({sulitCount})
                  </span>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-400">
                Belum ada peserta yang menyelesaikan paket ujian ini sehingga persentase mudah, sedang, dan sulit belum dapat dihitung.
              </div>
            )}
          </div>
        )}

        {/* Mobile Cards */}
        <div className="md:hidden space-y-2.5">
          {displayedRows.map((a) => (
            <div
              key={a.q.id_soal}
              className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                  Soal No. {a.q.nomor_soal} · {a.q.jenis_soal}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    a.tingkat === 'Mudah'
                      ? 'text-emerald-600'
                      : a.tingkat === 'Sedang'
                      ? 'text-sky-600'
                      : a.tingkat === 'Sulit'
                      ? 'text-rose-600'
                      : 'text-slate-400'
                  }`}
                >
                  {a.tingkat}
                </span>
              </div>
              <div className="text-xs text-slate-700">
                <RichText text={a.q.teks_soal} className="line-clamp-2" />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <div className="text-[11px] text-slate-400">Benar Penuh</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-800">
                    {a.benarPenuh}/{filtered.length}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Rata Skor</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-800">
                    {a.rata} / {a.q.bobot}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Penguasaan</div>
                  <div className="font-mono tabular-nums font-bold text-slate-900">{a.pct}%</div>
                </div>
              </div>
            </div>
          ))}
          {displayedRows.length === 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-sm text-slate-400">
              Tidak ada butir soal pada kategori ini.
            </div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4 w-14">No</th>
                  <th className="py-3 px-4">Jenis</th>
                  <th className="py-3 px-4">Cuplikan Soal</th>
                  <th className="py-3 px-4">Bobot</th>
                  <th className="py-3 px-4">Benar Penuh</th>
                  <th className="py-3 px-4">Rata Skor</th>
                  <th className="py-3 px-4">% Penguasaan</th>
                  <th className="py-3 px-4">Kategori</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.map((a) => (
                  <tr key={a.q.id_soal} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono tabular-nums font-semibold">
                      {a.q.nomor_soal}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">{a.q.jenis_soal}</td>
                    <td className="py-2.5 px-4 max-w-md text-xs text-slate-700">
                      <RichText text={a.q.teks_soal} className="line-clamp-2" />
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{a.q.bobot}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      {a.benarPenuh} / {filtered.length}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{a.rata}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-semibold">{a.pct}%</td>
                    <td className="py-2.5 px-4 text-xs font-semibold">
                      <span
                        className={
                          a.tingkat === 'Mudah'
                            ? 'text-emerald-600'
                            : a.tingkat === 'Sedang'
                            ? 'text-sky-600'
                            : a.tingkat === 'Sulit'
                            ? 'text-rose-600'
                            : 'text-slate-400'
                        }
                      >
                        {a.tingkat}
                      </span>
                    </td>
                  </tr>
                ))}
                {displayedRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                      Tidak ada butir soal pada kategori ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ===== TAB: PELANGGARAN =====
  const pelanggaranKelasList = Array.from(
    new Set([
      ...pelanggarans.map((l) => l.kelas).filter(Boolean),
      ...hasils.map((h) => h.kelas).filter(Boolean),
    ])
  ).sort();

  const selectedPelPaket = pakets.find((p) => p.id === pelanggaranPaketFilter);
  const selectedPelPaketNameLower = selectedPelPaket?.nama_paket_soal.trim().toLowerCase() || '';

  const filteredLogs = pelanggarans.filter((l) => {
    if (pelanggaranPaketFilter && pelanggaranPaketFilter !== '__ALL__') {
      const matchId = l.paket_id === pelanggaranPaketFilter;
      const matchNama =
        selectedPelPaketNameLower !== '' &&
        l.paket_nama.trim().toLowerCase() === selectedPelPaketNameLower;
      const matchStatus =
        selectedPelPaketNameLower !== '' &&
        l.status_ujian.toLowerCase().includes(selectedPelPaketNameLower);
      if (!matchId && !matchNama && !matchStatus) return false;
    }
    if (filterKelas && l.kelas !== filterKelas) return false;
    if (searchQ && !l.nama_siswa.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const handleImportPelanggaranExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingLogs(true);
    try {
      const rows = await readExcelOrCsvFile(file);
      if (rows.length === 0) {
        onToast('File Excel kosong atau format tidak terbaca.', 'err');
        return;
      }
      const res = await importPelanggaranBatch(rows, pakets);
      await onRefresh();
      onToast(
        `${res.added} log pelanggaran berhasil diimpor${res.skipped > 0 ? ` (${res.skipped} duplikat/kosong dilewati)` : ''}.`,
        'ok'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mengimpor file pelanggaran.', 'err');
    } finally {
      setImportingLogs(false);
    }
  };

  const handleSyncGasPelanggaran = async () => {
    if (!syncGasUrl.trim() || !syncGasPw) {
      onToast('Isi URL Web App Apps Script dan password admin lama terlebih dahulu.', 'err');
      return;
    }
    setSyncingGas(true);
    try {
      try {
        localStorage.setItem('cbt_legacy_gas_url', syncGasUrl.trim());
      } catch {
        // ignore storage quota errors
      }
      const res = await migratePelanggaranFromGas(syncGasUrl.trim(), syncGasPw);
      await onRefresh();
      setShowGasSync(false);
      setSyncGasPw('');
      onToast(
        `Sinkron selesai! ${res.added} log pelanggaran baru ditambahkan${res.skipped > 0 ? ` (${res.skipped} sudah ada)` : ''}.`,
        'ok'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mengambil log dari Apps Script.', 'err');
    } finally {
      setSyncingGas(false);
    }
  };

  const handleExportPelanggaranPdf = () => {
    exportTablePdf({
      filename: 'log_pelanggaran.pdf',
      title: 'LAPORAN CATATAN PELANGGARAN UJIAN',
      schoolName: settings?.judul || 'Portal Ujian CBT',
      schoolSubtitle: settings?.subjudul || '',
      metaPairs: [
        {
          label: 'Paket Ujian',
          value: selectedPelPaket ? selectedPelPaket.nama_paket_soal : 'Semua Paket',
        },
        { label: 'Kelas', value: filterKelas || 'Semua Kelas' },
        { label: 'Total Log', value: `${filteredLogs.length} kejadian` },
      ],
      headers: ['No', 'Waktu Kejadian', 'Nama Siswa', 'Kelas', 'Paket / Status', 'Jenis Pelanggaran'],
      rows: filteredLogs.map((l, idx) => [
        idx + 1,
        l.created_at ? l.created_at.toLocaleString('id-ID') : '-',
        l.nama_siswa,
        l.kelas,
        l.paket_nama && l.paket_nama !== '-' ? l.paket_nama : l.status_ujian || '-',
        l.jenis_pelanggaran,
      ]),
    });
    onToast('File PDF log pelanggaran berhasil diunduh.', 'ok');
  };

  const pelanggaranStudents = Array.from(
    new Map(
      pelanggarans.map((l) => [
        l.nama_siswa.trim().toLowerCase(),
        { siswa_id: l.siswa_id, nama_siswa: l.nama_siswa, kelas: l.kelas },
      ])
    ).values()
  ).sort((a, b) => a.nama_siswa.localeCompare(b.nama_siswa));

  const openEditLogModal = (l: LogPelanggaran) => {
    setEditLog(l);
    setEditLogNama(l.nama_siswa);
    setEditLogKelas(l.kelas);
    setEditLogPaketId(l.paket_id);
    setEditLogPaketNama(l.paket_nama);
    setEditLogJenis(l.jenis_pelanggaran);
    setEditLogStatus(l.status_ujian);
  };

  const handleSaveEditLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLog) return;
    setSavingEditLog(true);
    try {
      await updatePelanggaran(editLog.id, {
        nama_siswa: editLogNama,
        kelas: editLogKelas,
        paket_id: editLogPaketId,
        paket_nama: editLogPaketNama,
        jenis_pelanggaran: editLogJenis,
        status_ujian: editLogStatus,
      });
      setEditLog(null);
      await onRefresh();
      onToast('Log pelanggaran berhasil diperbarui.', 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memperbarui log pelanggaran.', 'err');
    } finally {
      setSavingEditLog(false);
    }
  };

  const handleResetStudentPelanggaran = async (siswaId: string, namaSiswa: string) => {
    const scopeText = selectedPelPaket
      ? `pada paket "${selectedPelPaket.nama_paket_soal}"`
      : 'untuk semua paket';
    if (!window.confirm(`Reset semua catatan pelanggaran milik ${namaSiswa} ${scopeText}?`)) return;
    setResettingPel(true);
    try {
      const res = await resetPelanggaran({
        siswaId,
        namaSiswa,
        paketId: pelanggaranPaketFilter,
        paketNama: selectedPelPaket?.nama_paket_soal,
      });
      setSelectedLogIds(new Set());
      await onRefresh();
      onToast(
        `Pelanggaran ${namaSiswa} direset (${res.deletedLogs} log dihapus).`,
        'ok'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mereset pelanggaran peserta.', 'err');
    } finally {
      setResettingPel(false);
    }
  };

  const handleExecuteResetModal = async () => {
    const isAll = resetTargetSiswa === '__ALL__';
    const targetStudent = isAll
      ? null
      : pelanggaranStudents.find((s) => s.nama_siswa === resetTargetSiswa);
    const scopePaket = selectedPelPaket
      ? `pada paket "${selectedPelPaket.nama_paket_soal}"`
      : 'pada semua paket';
    const targetText = isAll
      ? `SEMUA PESERTA`
      : `peserta "${targetStudent?.nama_siswa || resetTargetSiswa}"`;
    if (
      !window.confirm(
        `Yakin ingin mereset pelanggaran ${targetText} ${scopePaket}? Semua log terkait akan dihapus dan hitungan tab direset ke 0.`
      )
    ) {
      return;
    }
    setResettingPel(true);
    try {
      const res = await resetPelanggaran({
        siswaId: targetStudent?.siswa_id,
        namaSiswa: targetStudent?.nama_siswa,
        paketId: pelanggaranPaketFilter,
        paketNama: selectedPelPaket?.nama_paket_soal,
      });
      setSelectedLogIds(new Set());
      setResetModalOpen(false);
      await onRefresh();
      onToast(
        `Reset selesai! ${res.deletedLogs} log dihapus${res.resetHasil > 0 ? ` dan ${res.resetHasil} rekap diperbarui` : ''}.`,
        'ok'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mereset data pelanggaran.', 'err');
    } finally {
      setResettingPel(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Pencatatan Pelanggaran</h1>
            <span className="px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200/80 text-[11px] font-semibold text-slate-700 tabular-nums">
              {filteredLogs.length} / {pelanggarans.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Log aktivitas pindah tab/jendela selama ujian serta data migrasi dari Google Spreadsheet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedLogIds.size > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Hapus ${selectedLogIds.size} log terpilih?`)) return;
                await deletePelanggaranByIds(Array.from(selectedLogIds));
                setSelectedLogIds(new Set());
                await onRefresh();
                onToast('Log pelanggaran dihapus.', 'ok');
              }}
              className="min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Hapus ({selectedLogIds.size})
            </button>
          )}
          {pelanggarans.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setResetTargetSiswa('__ALL__');
                setResetModalOpen(true);
              }}
              className="min-h-[38px] px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Pelanggaran
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowGasSync((v) => !v)}
            className="min-h-[38px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <UploadCloud className="w-4 h-4" />
            Tarik dari Spreadsheet
          </button>
          <label className="min-h-[38px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-slate-500" />
            {importingLogs ? 'Mengimpor...' : 'Impor Excel'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={importingLogs}
              onChange={handleImportPelanggaranExcel}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={handleExportPelanggaranPdf}
            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            Cetak PDF
          </button>
          <button
            type="button"
            onClick={() =>
              exportRowsToExcel(
                'log_pelanggaran.xlsx',
                ['Waktu', 'Nama_Siswa', 'Kelas', 'Paket', 'Jenis_Pelanggaran', 'Status_Ujian'],
                filteredLogs.map((l) => ({
                  Waktu: l.created_at ? l.created_at.toLocaleString('id-ID') : '-',
                  Nama_Siswa: l.nama_siswa,
                  Kelas: l.kelas,
                  Paket: l.paket_nama || '-',
                  Jenis_Pelanggaran: l.jenis_pelanggaran,
                  Status_Ujian: l.status_ujian || '-',
                }))
              )
            }
            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Ekspor Excel
          </button>
        </div>
      </div>

      {showGasSync && (
        <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Sinkron Log Pelanggaran dari Google Apps Script / Spreadsheet
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Mengambil sheet <strong>Log Pelanggaran</strong> langsung dari Web App Apps Script
                tanpa menimpa paket, soal, atau nilai yang sudah ada.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGasSync(false)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-white cursor-pointer"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
            <div className="md:col-span-6">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                URL Web App Apps Script (/exec)
              </label>
              <input
                type="url"
                value={syncGasUrl}
                onChange={(e) => setSyncGasUrl(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Password Admin Lama
              </label>
              <input
                type="password"
                value={syncGasPw}
                onChange={(e) => setSyncGasPw(e.target.value)}
                placeholder="Password Apps Script"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
              />
            </div>
            <div className="md:col-span-3">
              <button
                type="button"
                disabled={syncingGas}
                onClick={handleSyncGasPelanggaran}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingGas ? 'animate-spin' : ''}`} />
                {syncingGas ? 'Mengambil Data...' : 'Ambil Log Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <select
          value={pelanggaranPaketFilter}
          onChange={(e) => setPelanggaranPaketFilter(e.target.value)}
          className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
        >
          <option value="__ALL__">Semua Paket</option>
          {pakets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama_paket_soal}
            </option>
          ))}
        </select>
        <select
          value={filterKelas}
          onChange={(e) => setFilterKelas(e.target.value)}
          className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
        >
          <option value="">Semua Kelas</option>
          {pelanggaranKelasList.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <div className="relative col-span-2 sm:col-span-1">
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
        {filteredLogs.map((l) => (
          <div
            key={l.id}
            className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 space-y-3"
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedLogIds.has(l.id)}
                onChange={(e) => {
                  const next = new Set(selectedLogIds);
                  if (e.target.checked) next.add(l.id);
                  else next.delete(l.id);
                  setSelectedLogIds(next);
                }}
                className="mt-1 w-4 h-4 rounded border-slate-300"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-slate-900 truncate">
                    {l.nama_siswa}
                  </span>
                  <span className="text-xs font-semibold text-rose-600 shrink-0">
                    {l.jenis_pelanggaran}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  Kelas {l.kelas} ·{' '}
                  {l.paket_nama && l.paket_nama !== '-' ? l.paket_nama : l.status_ujian || '-'}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                  {l.created_at ? l.created_at.toLocaleString('id-ID') : '-'}
                </div>
              </div>
            </label>
            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => openEditLogModal(l)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                type="button"
                disabled={resettingPel}
                onClick={() => void handleResetStudentPelanggaran(l.siswa_id, l.nama_siswa)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Peserta
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Hapus log pelanggaran ${l.nama_siswa}?`)) return;
                  await deletePelanggaranByIds([l.id]);
                  setSelectedLogIds((prev) => {
                    const next = new Set(prev);
                    next.delete(l.id);
                    return next;
                  });
                  await onRefresh();
                  onToast('Log pelanggaran dihapus.', 'ok');
                }}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus
              </button>
            </div>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 text-center text-sm text-slate-500 space-y-2">
            <div>Belum ada catatan pelanggaran{pelanggarans.length > 0 ? ' pada filter ini.' : '.'}</div>
            {pelanggarans.length === 0 && (
              <div className="text-xs text-slate-400">
                Gunakan tombol <strong>Tarik dari Spreadsheet</strong> atau <strong>Impor Excel</strong> untuk menyalin data Log Pelanggaran dari Google Spreadsheet.
              </div>
            )}
          </div>
        )}
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
                    checked={
                      filteredLogs.length > 0 && selectedLogIds.size === filteredLogs.length
                    }
                    onChange={(e) => {
                      if (e.target.checked)
                        setSelectedLogIds(new Set(filteredLogs.map((l) => l.id)));
                      else setSelectedLogIds(new Set());
                    }}
                  />
                </th>
                <th className="py-3 px-4">Waktu Kejadian</th>
                <th className="py-3 px-4">Nama Siswa</th>
                <th className="py-3 px-4">Kelas</th>
                <th className="py-3 px-4">Paket / Status Ujian</th>
                <th className="py-3 px-4">Jenis Pelanggaran</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-4">
                    <input
                      type="checkbox"
                      checked={selectedLogIds.has(l.id)}
                      onChange={(e) => {
                        const next = new Set(selectedLogIds);
                        if (e.target.checked) next.add(l.id);
                        else next.delete(l.id);
                        setSelectedLogIds(next);
                      }}
                    />
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                    {l.created_at ? l.created_at.toLocaleString('id-ID') : '-'}
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-900">{l.nama_siswa}</td>
                  <td className="py-2.5 px-4 text-slate-700">{l.kelas}</td>
                  <td className="py-2.5 px-4 text-slate-600">
                    <div>{l.paket_nama && l.paket_nama !== '-' ? l.paket_nama : l.status_ujian || '-'}</div>
                    {l.status_ujian && l.paket_nama && l.paket_nama !== '-' && l.status_ujian !== `Sedang Ujian: ${l.paket_nama}` && (
                      <div className="text-[11px] text-slate-400">{l.status_ujian}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-xs font-semibold text-rose-600">
                    {l.jenis_pelanggaran}
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        title="Edit log pelanggaran"
                        onClick={() => openEditLogModal(l)}
                        className="px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={resettingPel}
                        title={`Reset semua pelanggaran ${l.nama_siswa}`}
                        onClick={() => void handleResetStudentPelanggaran(l.siswa_id, l.nama_siswa)}
                        className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset
                      </button>
                      <button
                        type="button"
                        title="Hapus log ini"
                        onClick={async () => {
                          if (!window.confirm(`Hapus log pelanggaran ${l.nama_siswa}?`)) return;
                          await deletePelanggaranByIds([l.id]);
                          setSelectedLogIds((prev) => {
                            const next = new Set(prev);
                            next.delete(l.id);
                            return next;
                          });
                          await onRefresh();
                          onToast('Log pelanggaran dihapus.', 'ok');
                        }}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    <div>Belum ada catatan pelanggaran{pelanggarans.length > 0 ? ' pada filter ini.' : '.'}</div>
                    {pelanggarans.length === 0 && (
                      <div className="text-xs text-slate-400 mt-1">
                        Gunakan tombol <strong>Tarik dari Spreadsheet</strong> atau <strong>Impor Excel</strong> di atas untuk menyalin data Log Pelanggaran dari Google Spreadsheet.
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Log Pelanggaran Modal */}
      {editLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveEditLog}
            className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Edit Catatan Pelanggaran</h3>
                <p className="text-xs text-slate-500">
                  {editLog.created_at ? editLog.created_at.toLocaleString('id-ID') : '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditLog(null)}
                className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Siswa</label>
                <input
                  type="text"
                  required
                  value={editLogNama}
                  onChange={(e) => setEditLogNama(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                <input
                  type="text"
                  required
                  value={editLogKelas}
                  onChange={(e) => setEditLogKelas(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Paket Ujian</label>
              <select
                value={editLogPaketId}
                onChange={(e) => {
                  const id = e.target.value;
                  setEditLogPaketId(id);
                  const found = pakets.find((p) => p.id === id);
                  if (found) setEditLogPaketNama(found.nama_paket_soal);
                }}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="">-- Sesuai nama manual / Umum --</option>
                {pakets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama_paket_soal}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jenis Pelanggaran
              </label>
              <input
                type="text"
                required
                value={editLogJenis}
                onChange={(e) => setEditLogJenis(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status Ujian / Keterangan
              </label>
              <input
                type="text"
                value={editLogStatus}
                onChange={(e) => setEditLogStatus(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditLog(null)}
                className="flex-1 min-h-[42px] rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingEditLog}
                className="flex-1 min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {savingEditLog ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Pelanggaran Per Peserta / Semua Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Reset Data Pelanggaran</h3>
                <p className="text-xs text-slate-500">
                  Cakupan:{' '}
                  <strong>
                    {selectedPelPaket ? selectedPelPaket.nama_paket_soal : 'Semua Paket Ujian'}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pilih Target Reset
              </label>
              <select
                value={resetTargetSiswa}
                onChange={(e) => setResetTargetSiswa(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
              >
                <option value="__ALL__">
                  Semua Peserta ({pelanggaranStudents.length} siswa)
                </option>
                {pelanggaranStudents.map((s) => (
                  <option key={s.nama_siswa} value={s.nama_siswa}>
                    {s.nama_siswa} (Kelas {s.kelas})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                Tindakan ini akan menghapus log pelanggaran pada database serta mengatur ulang
                jumlah pelanggaran tab menjadi 0.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="flex-1 min-h-[42px] rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={resettingPel}
                onClick={() => void handleExecuteResetModal()}
                className="flex-1 min-h-[42px] rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                {resettingPel ? 'Mereset...' : 'Reset Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
