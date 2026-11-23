import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FileUp,
  HelpCircle,
  Pencil,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { deleteSoalByIds, importSoalBatch, saveSoal } from '../../services/cbtService';
import type { PaketUjian, Pengaturan, SoalLengkap } from '../../types/cbt';
import { exportRowsToExcel, readExcelOrCsvFile } from '../../utils/excelUtils';
import { exportBankSoalPdf, triggerPrintOrPdf } from '../../utils/pdfUtils';
import {
  compressImageToDataUrl,
  getActiveOptions,
  parseKategoriLabels,
  parseOptionValue,
} from '../../utils/mathFormat';
import {
  classifySoalTka,
  getFrameworkByBidang,
  inferTkaBidang,
  type TkaBidang,
} from '../../utils/tkaFramework';
import { CbtImage, ImageLightbox, RichText } from '../RichText';
import { WordImportModal } from './WordImportModal';

interface Props {
  settings?: Pengaturan;
  pakets: PaketUjian[];
  soals: SoalLengkap[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const MATH_BUTTONS = [
  { label: 'aᵇ', insert: '^{2}', title: 'Pangkat ^{...}' },
  { label: 'aₙ', insert: '_{1}', title: 'Subskrip _{...}' },
  { label: '√', insert: '√{9}', title: 'Akar √{...}' },
  { label: 'a/b', insert: '{1/2}', title: 'Pecahan {a/b}' },
  { label: '×', insert: '×', title: 'Kali' },
  { label: '÷', insert: '÷', title: 'Bagi' },
  { label: '±', insert: '±', title: 'Plus-Minus' },
  { label: '°', insert: '°', title: 'Derajat' },
  { label: '≤', insert: '≤', title: 'Kurang sama dengan' },
  { label: '≥', insert: '≥', title: 'Lebih sama dengan' },
  { label: 'π', insert: 'π', title: 'Pi' },
  { label: 'B', insert: '**teks**', title: 'Tebal **...**' },
  { label: 'I', insert: '*teks*', title: 'Miring *...*' },
];

export function AdminBankSoal({ settings, pakets, soals, onRefresh, onToast }: Props) {
  const [selectedPaketId, setSelectedPaketId] = useState<string>(() => pakets[0]?.id || '');
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

  const totalBobot = useMemo(
    () => Math.round(paketSoals.reduce((acc, q) => acc + (Number(q.bobot) || 1), 0) * 100) / 100,
    [paketSoals]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [wordModalOpen, setWordModalOpen] = useState(false);
  const [previewAllOpen, setPreviewAllOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [zoomImg, setZoomImg] = useState<{ url: string; alt: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleDownloadBankSoalPdf = async () => {
    if (!activePaket || paketSoals.length === 0) {
      onToast('Belum ada soal untuk dicetak ke PDF.', 'err');
      return;
    }
    setExportingPdf(true);
    try {
      const res = await exportBankSoalPdf(activePaket, paketSoals, settings, true);
      if (res.skippedImages > 0 && res.embeddedImages === 0) {
        onToast(
          'PDF diunduh, namun gambar eksternal diblokir server sumber (gunakan tombol Cetak browser atau unggah gambar langsung).',
          'err'
        );
      } else if (res.skippedImages > 0) {
        onToast(
          `PDF diunduh (${res.embeddedImages} gambar disematkan, ${res.skippedImages} gambar eksternal dilewati).`,
          'ok'
        );
      } else if (res.embeddedImages > 0) {
        onToast(`File PDF bank soal & ${res.embeddedImages} gambar berhasil diunduh.`, 'ok');
      } else {
        onToast('File PDF bank soal berhasil diunduh.', 'ok');
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal membuat file PDF.', 'err');
    } finally {
      setExportingPdf(false);
    }
  };

  // Form fields
  const [editId, setEditId] = useState('');
  const [nomor, setNomor] = useState(1);
  const [jenis, setJenis] = useState('PG');
  const [customKat, setCustomKat] = useState('Benar/Salah');
  const [teksStimulus, setTeksStimulus] = useState('');
  const [gambarStimulus, setGambarStimulus] = useState('');
  const [teksSoal, setTeksSoal] = useState('');
  const [gambarSoal, setGambarSoal] = useState('');
  const [pilA, setPilA] = useState('');
  const [pilB, setPilB] = useState('');
  const [pilC, setPilC] = useState('');
  const [pilD, setPilD] = useState('');
  const [kunci, setKunci] = useState('A');
  const [pembahasan, setPembahasan] = useState('');
  const [bobot, setBobot] = useState(10);
  const [tkaMapel, setTkaMapel] = useState<string>('');
  const [tkaElemen, setTkaElemen] = useState<string>('');
  const [tkaSubelemen, setTkaSubelemen] = useState<string>('');
  const [tkaIndikator, setTkaIndikator] = useState<string>('');

  const focusedInputRef = useRef<'stimulus' | 'soal' | 'pembahasan' | 'a' | 'b' | 'c' | 'd'>('soal');

  const openSoalForm = (q?: SoalLengkap) => {
    if (!activePaket) {
      onToast('Buat paket soal terlebih dahulu di menu Daftar Ujian.', 'err');
      return;
    }
    if (q) {
      setEditId(q.id_soal);
      setNomor(q.nomor_soal);
      if (q.jenis_soal.startsWith('PGK Kategori')) {
        setJenis('PGK Kategori');
        setCustomKat(q.jenis_soal.split(':')[1] || 'Benar/Salah');
      } else {
        setJenis(q.jenis_soal || 'PG');
      }
      setTeksStimulus(q.teks_stimulus);
      setGambarStimulus(q.gambar_stimulus_url);
      setTeksSoal(q.teks_soal);
      setGambarSoal(q.gambar_soal_url);
      setPilA(q.pilihan_a);
      setPilB(q.pilihan_b);
      setPilC(q.pilihan_c);
      setPilD(q.pilihan_d);
      setKunci(q.kunci_jawaban);
      setPembahasan(q.pembahasan);
      setBobot(q.bobot || 10);
      setTkaMapel(q.tka_mapel || '');
      setTkaElemen(q.tka_elemen || '');
      setTkaSubelemen(q.tka_subelemen || '');
      setTkaIndikator(q.tka_indikator || '');
    } else {
      const nextNo = paketSoals.length ? Math.max(...paketSoals.map((x) => x.nomor_soal)) + 1 : 1;
      setEditId('');
      setNomor(nextNo);
      setJenis('PG');
      setCustomKat('Benar/Salah');
      setTeksStimulus('');
      setGambarStimulus('');
      setTeksSoal('');
      setGambarSoal('');
      setPilA('');
      setPilB('');
      setPilC('');
      setPilD('');
      setKunci('A');
      setPembahasan('');
      setBobot(10);
      setTkaMapel(inferTkaBidang(activePaket, paketSoals));
      setTkaElemen('');
      setTkaSubelemen('');
      setTkaIndikator('');
    }
    setFormOpen(true);
  };

  const insertSnippet = (snippet: string) => {
    const map: Record<
      typeof focusedInputRef.current,
      [string, React.Dispatch<React.SetStateAction<string>>]
    > = {
      stimulus: [teksStimulus, setTeksStimulus],
      soal: [teksSoal, setTeksSoal],
      pembahasan: [pembahasan, setPembahasan],
      a: [pilA, setPilA],
      b: [pilB, setPilB],
      c: [pilC, setPilC],
      d: [pilD, setPilD],
    };
    const [val, setter] = map[focusedInputRef.current];
    setter((val ? val + ' ' : '') + snippet);
  };

  const handleUploadImage = async (
    file: File | undefined,
    setter: (url: string) => void,
    appendMode = false,
    currentVal = ''
  ) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (appendMode) {
        setter(currentVal.trim() ? `${currentVal.trim()}\n${dataUrl}` : dataUrl);
      } else {
        setter(dataUrl);
      }
      onToast('Gambar berhasil dioptimalkan dan disisipkan.', 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memproses gambar.', 'err');
    }
  };

  const handleSaveSoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePaket) return;
    if (!teksSoal.trim()) {
      onToast('Teks soal tidak boleh kosong.', 'err');
      return;
    }
    setSaving(true);
    try {
      const fullJenis =
        jenis === 'PGK Kategori' ? `PGK Kategori:${customKat || 'Benar/Salah'}` : jenis;
      await saveSoal(
        {
          id_soal: editId || `S${Date.now()}`,
          paket_id: activePaket.id,
          paket: activePaket.nama_paket_soal,
          nomor_soal: Number(nomor) || 1,
          jenis_soal: fullJenis,
          teks_stimulus: teksStimulus,
          gambar_stimulus_url: gambarStimulus,
          teks_soal: teksSoal,
          gambar_soal_url: gambarSoal,
          pilihan_a: pilA,
          pilihan_b: pilB,
          pilihan_c: pilC,
          pilihan_d: pilD,
          bobot: Number(bobot) || 1,
          aktif: activePaket.status === 'Aktif',
          tka_mapel: tkaMapel.trim(),
          tka_elemen: tkaElemen.trim(),
          tka_subelemen: tkaSubelemen.trim(),
          tka_indikator: tkaIndikator.trim(),
          kunci_jawaban: kunci.trim(),
          pembahasan,
          rilis_kunci: activePaket.tampilkan_nilai,
        },
        activePaket
      );
      setFormOpen(false);
      await onRefresh();
      onToast(
        editId ? 'Butir soal berhasil diperbarui.' : 'Butir soal baru berhasil disimpan.',
        'ok'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan soal.', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activePaket) return;

    try {
      const rows = await readExcelOrCsvFile(file);
      if (rows.length === 0) {
        onToast('File Excel kosong.', 'err');
        return;
      }
      const mapped = rows.map((r, idx) => ({
        id_soal: String(r.ID_Soal || `S${Date.now()}_${idx}`),
        nomor_soal: Number(r.Nomor_Soal) || idx + 1,
        jenis_soal: String(r.Jenis_Soal || 'PG'),
        teks_stimulus: String(r.Teks_Stimulus || ''),
        gambar_stimulus_url: String(r.Gambar_Stimulus_URL || ''),
        teks_soal: String(r.Teks_Soal || ''),
        gambar_soal_url: String(r.Gambar_Soal_URL || ''),
        pilihan_a: String(r.Pilihan_A || ''),
        pilihan_b: String(r.Pilihan_B || ''),
        pilihan_c: String(r.Pilihan_C || ''),
        pilihan_d: String(r.Pilihan_D || ''),
        kunci_jawaban: String(r.Kunci_Jawaban || ''),
        pembahasan: String(r.Pembahasan || ''),
        bobot: Number(r.Bobot) || 1,
        tka_mapel: String(r.TKA_Mapel || ''),
        tka_elemen: String(r.TKA_Elemen || ''),
        tka_subelemen: String(r.TKA_Subelemen || ''),
        tka_indikator: String(r.TKA_Indikator || ''),
      }));
      const count = await importSoalBatch(mapped, activePaket);
      await onRefresh();
      onToast(`${count} soal berhasil diimpor ke "${activePaket.nama_paket_soal}".`, 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mengimpor Excel soal.', 'err');
    }
  };

  const handleDownloadTemplate = () => {
    exportRowsToExcel(
      'template_soal_cbt.xlsx',
      [
        'Nomor_Soal',
        'Jenis_Soal',
        'Teks_Stimulus',
        'Gambar_Stimulus_URL',
        'Teks_Soal',
        'Gambar_Soal_URL',
        'Pilihan_A',
        'Pilihan_B',
        'Pilihan_C',
        'Pilihan_D',
        'Kunci_Jawaban',
        'Pembahasan',
        'Bobot',
        'TKA_Mapel',
        'TKA_Elemen',
        'TKA_Subelemen',
        'TKA_Indikator',
      ],
      [
        {
          Nomor_Soal: 1,
          Jenis_Soal: 'PG',
          Teks_Stimulus: 'Contoh stimulus cerita.',
          Gambar_Stimulus_URL: '',
          Teks_Soal: 'Berapakah hasil dari {1/2} + {1/2}?',
          Gambar_Soal_URL: '',
          Pilihan_A: '1',
          Pilihan_B: '2',
          Pilihan_C: '3',
          Pilihan_D: '4',
          Kunci_Jawaban: 'A',
          Pembahasan: 'Setengah ditambah setengah sama dengan 1.',
          Bobot: 10,
          TKA_Mapel: 'Matematika',
          TKA_Elemen: 'Bilangan',
          TKA_Subelemen: 'Bilangan Rasional',
          TKA_Indikator:
            'Operasi penjumlahan dan pengurangan bilangan pecahan, serta operasi perkalian dan pembagian bilangan pecahan dengan bilangan asli',
        },
      ]
    );
  };

  const handleExportExcel = () => {
    if (!activePaket) return;
    exportRowsToExcel(
      `bank_soal_${activePaket.nama_paket_soal}.xlsx`,
      [
        'ID_Soal',
        'Nomor_Soal',
        'Jenis_Soal',
        'Teks_Stimulus',
        'Gambar_Stimulus_URL',
        'Teks_Soal',
        'Gambar_Soal_URL',
        'Pilihan_A',
        'Pilihan_B',
        'Pilihan_C',
        'Pilihan_D',
        'Kunci_Jawaban',
        'Pembahasan',
        'Bobot',
        'TKA_Mapel',
        'TKA_Elemen',
        'TKA_Subelemen',
        'TKA_Indikator',
      ],
      paketSoals.map((q) => ({
        ID_Soal: q.id_soal,
        Nomor_Soal: q.nomor_soal,
        Jenis_Soal: q.jenis_soal,
        Teks_Stimulus: q.teks_stimulus,
        Gambar_Stimulus_URL: q.gambar_stimulus_url,
        Teks_Soal: q.teks_soal,
        Gambar_Soal_URL: q.gambar_soal_url,
        Pilihan_A: q.pilihan_a,
        Pilihan_B: q.pilihan_b,
        Pilihan_C: q.pilihan_c,
        Pilihan_D: q.pilihan_d,
        Kunci_Jawaban: q.kunci_jawaban,
        Pembahasan: q.pembahasan,
        Bobot: q.bobot,
        TKA_Mapel: q.tka_mapel || '',
        TKA_Elemen: q.tka_elemen || '',
        TKA_Subelemen: q.tka_subelemen || '',
        TKA_Indikator: q.tka_indikator || '',
      }))
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      onToast('Centang soal yang ingin dihapus terlebih dahulu.', 'err');
      return;
    }
    if (!window.confirm(`Hapus ${selectedIds.size} soal yang dipilih?`)) return;
    try {
      await deleteSoalByIds(Array.from(selectedIds));
      setSelectedIds(new Set());
      await onRefresh();
      onToast(`${selectedIds.size} soal berhasil dihapus.`, 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus soal.', 'err');
    }
  };

  const handleDeleteAll = async () => {
    if (!activePaket || paketSoals.length === 0) return;
    if (
      !window.confirm(
        `Hapus SEMUA (${paketSoals.length}) soal di paket "${activePaket.nama_paket_soal}"?`
      )
    ) {
      return;
    }
    try {
      await deleteSoalByIds(paketSoals.map((q) => q.id_soal));
      setSelectedIds(new Set());
      await onRefresh();
      onToast('Seluruh soal pada paket ini berhasil dihapus.', 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus semua soal.', 'err');
    }
  };

  const previewQuestionObj: SoalLengkap = {
    id: editId || 'preview',
    id_soal: editId || 'preview',
    paket_id: activePaket?.id || '',
    paket: activePaket?.nama_paket_soal || '',
    nomor_soal: nomor,
    jenis_soal: jenis === 'PGK Kategori' ? `PGK Kategori:${customKat}` : jenis,
    teks_stimulus: teksStimulus,
    gambar_stimulus_url: gambarStimulus,
    teks_soal: teksSoal,
    gambar_soal_url: gambarSoal,
    pilihan_a: pilA,
    pilihan_b: pilB,
    pilihan_c: pilC,
    pilihan_d: pilD,
    bobot,
    aktif: true,
    kunci_jawaban: kunci,
    pembahasan,
    rilis_kunci: true,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Bank Soal</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {activePaket
                ? `${activePaket.nama_paket_soal} · ${paketSoals.length} butir soal · Total bobot ${totalBobot}`
                : 'Belum ada paket ujian'}
            </p>
          </div>

          <select
            value={activePaket?.id || ''}
            onChange={(e) => {
              setSelectedPaketId(e.target.value);
              setSelectedIds(new Set());
            }}
            className="w-full sm:w-auto min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
          >
            {pakets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama_paket_soal}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openSoalForm()}
            className="min-h-[42px] sm:min-h-[36px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-xs shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Tambah Soal
          </button>

          <label className="min-h-[42px] sm:min-h-[36px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-xs shadow-emerald-600/20">
            <Upload className="w-4 h-4" strokeWidth={1.85} />
            Impor Excel
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImportExcel} />
          </label>

          <button
            type="button"
            onClick={() => {
              if (!activePaket) {
                onToast('Buat paket soal terlebih dahulu di menu Daftar Ujian.', 'err');
                return;
              }
              setWordModalOpen(true);
            }}
            className="min-h-[42px] sm:min-h-[36px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-xs shadow-indigo-600/20"
          >
            <FileUp className="w-4 h-4" strokeWidth={1.85} />
            Impor Word
          </button>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="min-h-[42px] sm:min-h-[36px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-500" strokeWidth={1.85} />
            Template
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="min-h-[42px] sm:min-h-[36px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" strokeWidth={1.85} />
            Ekspor
          </button>

          <button
            type="button"
            disabled={exportingPdf}
            onClick={() => void handleDownloadBankSoalPdf()}
            className="min-h-[42px] sm:min-h-[36px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-xs shadow-rose-600/20"
          >
            <FileText className="w-4 h-4" strokeWidth={1.85} />
            {exportingPdf ? 'Menyiapkan PDF...' : 'Cetak PDF'}
          </button>

          <button
            type="button"
            onClick={() => setPreviewAllOpen(true)}
            className="min-h-[42px] sm:min-h-[36px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4 text-slate-500" strokeWidth={1.85} />
            Preview
          </button>

          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="min-h-[42px] sm:min-h-[36px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-slate-500" strokeWidth={1.85} />
            Format
          </button>

          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => void handleDeleteSelected()}
              className="min-h-[42px] sm:min-h-[36px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.85} />
              Hapus ({selectedIds.size})
            </button>
          )}

          {paketSoals.length > 0 && (
            <button
              type="button"
              onClick={() => void handleDeleteAll()}
              className="col-span-2 sm:col-span-1 min-h-[42px] sm:min-h-[36px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.85} />
              Hapus Semua
            </button>
          )}
        </div>
      </div>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-2.5 no-print">
        {paketSoals.map((q) => (
          <div
            key={q.id_soal}
            className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.has(q.id_soal)}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(q.id_soal);
                    else next.delete(q.id_soal);
                    setSelectedIds(next);
                  }}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                  Soal No. {q.nomor_soal}
                </span>
              </label>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                {q.jenis_soal} · Bobot {q.bobot}
              </span>
            </div>

            {q.teks_stimulus && (
              <div className="p-2.5 rounded-xl bg-slate-50 text-xs text-slate-600">
                <RichText text={q.teks_stimulus} className="line-clamp-2" />
              </div>
            )}

            <div className="text-sm text-slate-800">
              <RichText text={q.teks_soal} className="line-clamp-3" />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                Kunci:{' '}
                <span className="font-mono font-bold text-emerald-700">{q.kunci_jawaban}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openSoalForm(q)}
                  className="min-h-[38px] px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Hapus soal No. ${q.nomor_soal}?`)) return;
                    await deleteSoalByIds([q.id_soal]);
                    await onRefresh();
                    onToast('Soal dihapus.', 'ok');
                  }}
                  aria-label={`Hapus soal ${q.nomor_soal}`}
                  className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold inline-flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {paketSoals.length === 0 && (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-sm text-slate-400">
            Belum ada soal untuk paket ini.
          </div>
        )}
      </div>

      {/* Desktop Question Table */}
      <div className="hidden md:block bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={paketSoals.length > 0 && selectedIds.size === paketSoals.length}
                    onChange={(e) => {
                      if (e.target.checked)
                        setSelectedIds(new Set(paketSoals.map((q) => q.id_soal)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className="py-3 px-4 w-14">No</th>
                <th className="py-3 px-4">Jenis</th>
                <th className="py-3 px-4">Stimulus</th>
                <th className="py-3 px-4">Pertanyaan</th>
                <th className="py-3 px-4">Kunci</th>
                <th className="py-3 px-4">Bobot</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {paketSoals.map((q) => (
                <tr key={q.id_soal} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(q.id_soal)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(q.id_soal);
                        else next.delete(q.id_soal);
                        setSelectedIds(next);
                      }}
                    />
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-700">
                    {q.nomor_soal}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                    {q.jenis_soal}
                  </td>
                  <td className="py-3 px-4 max-w-xs text-xs text-slate-600">
                    <RichText text={q.teks_stimulus} className="line-clamp-3" />
                  </td>
                  <td className="py-3 px-4 min-w-[16rem] text-sm text-slate-900">
                    <RichText text={q.teks_soal} />
                  </td>
                  <td className="py-3 px-4 font-mono text-xs font-bold text-emerald-700">
                    {q.kunci_jawaban}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-700">{q.bobot}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openSoalForm(q)}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`Hapus soal No. ${q.nomor_soal}?`)) return;
                          await deleteSoalByIds([q.id_soal]);
                          await onRefresh();
                          onToast('Soal dihapus.', 'ok');
                        }}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paketSoals.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                    Belum ada soal untuk paket ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Soal Modal with Live Preview */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-start justify-center p-0 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveSoal}
            className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl w-full max-w-5xl p-4 sm:p-6 shadow-2xl sm:my-4 space-y-4 max-h-[94vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {editId ? `Edit Soal No. ${nomor}` : 'Tambah Butir Soal'}
                </h3>
                <p className="text-xs text-slate-500">{activePaket?.nama_paket_soal}</p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Math Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-xs font-semibold text-slate-500 mr-1">Sisipkan:</span>
              {MATH_BUTTONS.map((mb) => (
                <button
                  key={mb.label}
                  type="button"
                  title={mb.title}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertSnippet(mb.insert)}
                  className="min-h-[34px] min-w-[34px] px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:border-sky-300 cursor-pointer transition-colors"
                >
                  {mb.label}
                </button>
              ))}
            </div>

            <div className="grid lg:grid-cols-12 gap-5">
              {/* Left: Editor */}
              <div className="lg:col-span-7 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor</label>
                    <input
                      type="number"
                      min={1}
                      value={nomor}
                      onChange={(e) => setNomor(Number(e.target.value))}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jenis Soal
                    </label>
                    <select
                      value={jenis}
                      onChange={(e) => setJenis(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                      <option value="PG">PG (Pilihan Ganda)</option>
                      <option value="PGK MCMA">PGK MCMA (Banyak Jawaban)</option>
                      <option value="PGK Kategori">PGK Kategori (Tabel)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Bobot</label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      value={bobot}
                      onChange={(e) => setBobot(Number(e.target.value))}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-mono"
                    />
                  </div>
                </div>

                {jenis === 'PGK Kategori' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Label Kategori (pisahkan dengan garis miring)
                    </label>
                    <input
                      type="text"
                      value={customKat}
                      onChange={(e) => setCustomKat(e.target.value)}
                      placeholder="Benar/Salah atau Sesuai/Tidak Sesuai"
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Teks Stimulus (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={teksStimulus}
                    onFocus={() => (focusedInputRef.current = 'stimulus')}
                    onChange={(e) => setTeksStimulus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={gambarStimulus}
                      onChange={(e) => setGambarStimulus(e.target.value)}
                      placeholder="URL gambar stimulus atau unggah file..."
                      className="flex-1 min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-200 text-xs"
                    />
                    <label className="min-h-[38px] px-3 py-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold inline-flex items-center cursor-pointer whitespace-nowrap">
                      Unggah
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleUploadImage(e.target.files?.[0], setGambarStimulus)}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pertanyaan / Teks Soal
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={teksSoal}
                    onFocus={() => (focusedInputRef.current = 'soal')}
                    onChange={(e) => setTeksSoal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={gambarSoal}
                      onChange={(e) => setGambarSoal(e.target.value)}
                      placeholder="URL gambar soal atau unggah file..."
                      className="flex-1 min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-200 text-xs"
                    />
                    <label className="min-h-[38px] px-3 py-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold inline-flex items-center cursor-pointer whitespace-nowrap">
                      Unggah
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleUploadImage(e.target.files?.[0], setGambarSoal)}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-2.5">
                  {(
                    [
                      ['A', pilA, setPilA, 'a'],
                      ['B', pilB, setPilB, 'b'],
                      ['C', pilC, setPilC, 'c'],
                      ['D', pilD, setPilD, 'd'],
                    ] as const
                  ).map(([lbl, val, setter, key]) => (
                    <div key={lbl}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">
                          {jenis === 'PGK Kategori' ? `Pernyataan ${lbl}` : `Pilihan ${lbl}`}
                        </label>
                        <label className="text-[11px] text-blue-600 hover:underline cursor-pointer">
                          + Gambar
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              void handleUploadImage(e.target.files?.[0], setter, true, val)
                            }
                          />
                        </label>
                      </div>
                      <textarea
                        rows={2}
                        value={val}
                        onFocus={() => (focusedInputRef.current = key)}
                        onChange={(e) => setter(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kunci Jawaban
                    </label>
                    <input
                      type="text"
                      required
                      value={kunci}
                      onChange={(e) => setKunci(e.target.value)}
                      placeholder={
                        jenis === 'PG'
                          ? 'Contoh: C'
                          : jenis === 'PGK MCMA'
                          ? 'Contoh: A,B,C'
                          : 'Contoh: Benar,Benar,Salah,Salah'
                      }
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pembahasan (Opsional)
                    </label>
                    <input
                      type="text"
                      value={pembahasan}
                      onFocus={() => (focusedInputRef.current = 'pembahasan')}
                      onChange={(e) => setPembahasan(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                </div>

                {/* Pemetaan Materi / Kompetensi TKA */}
                {(() => {
                  const chosenBidang: TkaBidang =
                    tkaMapel === 'Bahasa Indonesia' ? 'Bahasa Indonesia' : 'Matematika';
                  const fw = getFrameworkByBidang(chosenBidang);
                  const elList = Array.from(new Set(fw.map((f) => f.elemen)));
                  const subList = fw.filter((f) => f.elemen === tkaElemen);
                  const indList =
                    subList.find((f) => f.subelemen === tkaSubelemen)?.indikatorList || [];
                  return (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700">
                          Pemetaan Materi / Kompetensi TKA (Opsional)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const forced =
                              tkaMapel === 'Bahasa Indonesia' || tkaMapel === 'Matematika'
                                ? (tkaMapel as TkaBidang)
                                : inferTkaBidang(activePaket, [previewQuestionObj]);
                            const cls = classifySoalTka(
                              {
                                ...previewQuestionObj,
                                tka_mapel: undefined,
                                tka_elemen: undefined,
                                tka_subelemen: undefined,
                                tka_indikator: undefined,
                              },
                              forced
                            );
                            setTkaMapel(cls.mapel);
                            setTkaElemen(cls.elemen);
                            setTkaSubelemen(cls.subelemen);
                            setTkaIndikator(cls.indikator);
                            onToast(`Terdeteksi: ${cls.elemen} — ${cls.subelemen}`, 'ok');
                          }}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          Deteksi Otomatis TKA
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <select
                          value={tkaMapel}
                          onChange={(e) => {
                            const nextM = e.target.value;
                            setTkaMapel(nextM);
                            if (!nextM) {
                              setTkaElemen('');
                              setTkaSubelemen('');
                              setTkaIndikator('');
                              return;
                            }
                            const nextFw = getFrameworkByBidang(
                              nextM === 'Bahasa Indonesia' ? 'Bahasa Indonesia' : 'Matematika'
                            )[0];
                            setTkaElemen(nextFw.elemen);
                            setTkaSubelemen(nextFw.subelemen);
                            setTkaIndikator(nextFw.indikatorList[0] || '');
                          }}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                        >
                          <option value="">-- Bidang TKA (Otomatis) --</option>
                          <option value="Matematika">Matematika</option>
                          <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                        </select>

                        <select
                          value={tkaElemen}
                          disabled={!tkaMapel}
                          onChange={(e) => {
                            const nextEl = e.target.value;
                            setTkaElemen(nextEl);
                            const firstSub = fw.find((f) => f.elemen === nextEl);
                            setTkaSubelemen(firstSub?.subelemen || '');
                            setTkaIndikator(firstSub?.indikatorList[0] || '');
                          }}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs disabled:opacity-50"
                        >
                          <option value="">-- Elemen / Kompetensi --</option>
                          {elList.map((el) => (
                            <option key={el} value={el}>
                              {el}
                            </option>
                          ))}
                        </select>

                        <select
                          value={tkaSubelemen}
                          disabled={!tkaElemen}
                          onChange={(e) => {
                            const nextSub = e.target.value;
                            setTkaSubelemen(nextSub);
                            const found = subList.find((f) => f.subelemen === nextSub);
                            setTkaIndikator(found?.indikatorList[0] || '');
                          }}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs disabled:opacity-50"
                        >
                          <option value="">-- Sub-elemen --</option>
                          {subList.map((s) => (
                            <option key={s.subelemen} value={s.subelemen}>
                              {s.subelemen}
                            </option>
                          ))}
                        </select>

                        <select
                          value={tkaIndikator}
                          disabled={!tkaSubelemen}
                          onChange={(e) => setTkaIndikator(e.target.value)}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs disabled:opacity-50"
                        >
                          <option value="">-- Cakupan / Subkompetensi --</option>
                          {indList.map((ind) => (
                            <option key={ind} value={ind}>
                              {ind}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Right: Live Preview */}
              <div className="lg:col-span-5 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3 overflow-y-auto max-h-[60vh] lg:max-h-[70vh]">
                <div className="text-xs font-bold text-slate-500">
                  Pratinjau Tampilan Siswa
                </div>
                {(teksStimulus || gambarStimulus) && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                    <RichText text={teksStimulus} className="text-xs text-slate-700" />
                    <CbtImage src={gambarStimulus} alt="Preview stimulus" className="max-h-40" />
                  </div>
                )}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
                  <RichText
                    text={teksSoal || '(Teks soal belum diisi)'}
                    className="text-sm font-medium"
                  />
                  <CbtImage src={gambarSoal} alt="Preview soal" className="max-h-40" />
                  {jenis === 'PGK Kategori' ? (
                    <div className="text-xs space-y-1.5">
                      {getActiveOptions(previewQuestionObj).map((o) => (
                        <div
                          key={o.key}
                          className="p-2 rounded-lg border border-slate-200 flex justify-between gap-2"
                        >
                          <RichText text={parseOptionValue(o.value).text} />
                          <span className="text-slate-400 shrink-0">
                            {parseKategoriLabels(previewQuestionObj.jenis_soal).join(' / ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {getActiveOptions(previewQuestionObj).map((o) => {
                        const parsed = parseOptionValue(o.value);
                        return (
                          <div
                            key={o.key}
                            className="p-2 rounded-lg border border-slate-200 text-xs flex gap-2"
                          >
                            <span className="font-mono font-bold text-slate-600">{o.key}.</span>
                            <div>
                              <RichText text={parsed.text} />
                              {parsed.imageUrl && (
                                <CbtImage src={parsed.imageUrl} alt={o.key} className="max-h-24" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex-1 min-h-[44px] py-2 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 min-h-[44px] py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Soal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Preview All Questions Modal */}
      {previewAllOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 print:static print:inset-auto print:bg-white print:p-0 print:block">
          <div className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl print:max-h-none print:shadow-none print:border-0 print:rounded-none">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 no-print">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  Preview: {activePaket?.nama_paket_soal}
                </h3>
                <p className="text-xs text-slate-500">
                  {paketSoals.length} soal · Total bobot {totalBobot}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={() => void handleDownloadBankSoalPdf()}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{exportingPdf ? 'Memproses...' : 'Unduh PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!activePaket || paketSoals.length === 0) return;
                    triggerPrintOrPdf(
                      () => handleDownloadBankSoalPdf(),
                      (msg) => onToast(msg, 'ok')
                    );
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cetak</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAllOpen(false)}
                  className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 print:overflow-visible print:p-0">
              {paketSoals.map((q) => (
                <div
                  key={q.id_soal}
                  className="border-b border-slate-100 pb-5 last:border-b-0 space-y-2"
                >
                  <div className="text-xs font-semibold text-slate-500">
                    No. {q.nomor_soal} · {q.jenis_soal} · Bobot {q.bobot} · Kunci:{' '}
                    <span className="text-emerald-700 font-mono">{q.kunci_jawaban}</span>
                  </div>
                  {q.teks_stimulus && (
                    <RichText text={q.teks_stimulus} className="text-sm text-slate-600 italic" />
                  )}
                  {q.gambar_stimulus_url && (
                    <CbtImage
                      src={q.gambar_stimulus_url}
                      alt={`Stimulus ${q.nomor_soal}`}
                      onZoom={(url, alt) => setZoomImg({ url, alt })}
                    />
                  )}
                  <RichText text={q.teks_soal} className="text-sm font-medium text-slate-900" />
                  {q.gambar_soal_url && (
                    <CbtImage
                      src={q.gambar_soal_url}
                      alt={`Soal ${q.nomor_soal}`}
                      onZoom={(url, alt) => setZoomImg({ url, alt })}
                    />
                  )}
                  <div className="pl-4 space-y-1 text-sm">
                    {getActiveOptions(q).map((o) => {
                      const p = parseOptionValue(o.value);
                      return (
                        <div key={o.key} className="flex gap-2">
                          <span className="font-mono font-semibold text-slate-500">{o.key}.</span>
                          <div>
                            <RichText text={p.text} />
                            {p.imageUrl && (
                              <CbtImage src={p.imageUrl} alt={o.key} className="max-h-24" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Format Help Modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-base font-bold text-slate-900">Panduan Format Penulisan CBT</h3>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-slate-700 space-y-2 leading-relaxed">
              <p>
                <strong>Pangkat &amp; Indeks:</strong> <code>m^{'{2}'}</code> atau <code>x^2</code>,{' '}
                <code>H_{'{2}'}O</code>
              </p>
              <p>
                <strong>Pecahan &amp; Akar:</strong> <code>{'{3/4}'}</code> untuk pecahan susun,{' '}
                <code>√{'{16}'}</code> untuk akar kuadrat.
              </p>
              <p>
                <strong>Tebal &amp; Miring:</strong> <code>**teks tebal**</code> dan{' '}
                <code>*teks miring*</code>.
              </p>
              <p>
                <strong>Kunci Jawaban:</strong>
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <code>PG</code>: isi satu huruf, misal <code>C</code>
                </li>
                <li>
                  <code>PGK MCMA</code>: pisahkan koma, misal <code>A,B,C</code>
                </li>
                <li>
                  <code>PGK Kategori:Benar/Salah</code>: urut sesuai pernyataan A–D, misal{' '}
                  <code>Benar,Benar,Salah,Salah</code>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <WordImportModal
        open={wordModalOpen}
        paket={activePaket}
        existingCount={paketSoals.length}
        onClose={() => setWordModalOpen(false)}
        onImported={async (count) => {
          await onRefresh();
          onToast(
            `${count} soal dari Word berhasil diimpor ke "${activePaket?.nama_paket_soal || 'Paket'}".`,
            'ok'
          );
        }}
        onToast={onToast}
      />

      <ImageLightbox image={zoomImg} onClose={() => setZoomImg(null)} />
    </div>
  );
}
