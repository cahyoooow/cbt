import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpenCheck,
  CheckCircle2,
  Download,
  FileText,
  Printer,
  Save,
  Sparkles,
  Users,
} from 'lucide-react';
import { updateSoalTkaBatch } from '../../services/cbtService';
import type { HasilUjian, PaketUjian, Pengaturan, SoalLengkap } from '../../types/cbt';
import { exportRowsToExcel } from '../../utils/excelUtils';
import { exportTablePdf, triggerPrintOrPdf } from '../../utils/pdfUtils';
import { scoreQuestion } from '../../utils/mathFormat';
import {
  classifySoalTka,
  getFrameworkByBidang,
  inferTkaBidang,
  TKA_BAHASA_INDONESIA_FRAMEWORK,
  TKA_MATEMATIKA_FRAMEWORK,
  type TkaBidang,
} from '../../utils/tkaFramework';
import { RichText } from '../RichText';

interface Props {
  settings?: Pengaturan;
  pakets: PaketUjian[];
  soals: SoalLengkap[];
  hasils: HasilUjian[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

interface DraftMapping {
  tka_mapel: TkaBidang;
  tka_elemen: string;
  tka_subelemen: string;
  tka_indikator: string;
  source: 'Tersimpan' | 'Otomatis' | 'Diubah';
  reason: string;
}

function getMasteryBadge(pct: number | null) {
  if (pct === null) {
    return { label: 'Belum ada hasil', cls: 'text-slate-500 bg-slate-100' };
  }
  if (pct >= 75) {
    return { label: 'Baik', cls: 'text-emerald-700 bg-emerald-50 border border-emerald-200/70' };
  }
  if (pct >= 50) {
    return { label: 'Cukup', cls: 'text-amber-700 bg-amber-50 border border-amber-200/70' };
  }
  return { label: 'Perlu Bimbingan', cls: 'text-rose-700 bg-rose-50 border border-rose-200/70' };
}

export function AdminAnalisisTka({ settings, pakets, soals, hasils, onRefresh, onToast }: Props) {
  const [selectedPaketId, setSelectedPaketId] = useState(() => pakets[0]?.id || '');
  const [bidangOverride, setBidangOverride] = useState<'AUTO' | TkaBidang>('AUTO');
  const [filterKelas, setFilterKelas] = useState('');
  const [subTab, setSubTab] = useState<'overview' | 'butir' | 'siswa' | 'kisi'>('overview');
  const [drafts, setDrafts] = useState<Record<string, DraftMapping>>({});
  const [saving, setSaving] = useState(false);

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

  const activeBidang: TkaBidang = useMemo(() => {
    if (bidangOverride !== 'AUTO') return bidangOverride;
    return inferTkaBidang(activePaket, paketSoals);
  }, [activePaket, bidangOverride, paketSoals]);

  const framework = useMemo(() => getFrameworkByBidang(activeBidang), [activeBidang]);

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
    () => Array.from(new Set(paketHasils.map((h) => h.kelas).filter(Boolean))).sort(),
    [paketHasils]
  );

  const filteredHasils = useMemo(
    () => paketHasils.filter((h) => !filterKelas || h.kelas === filterKelas),
    [filterKelas, paketHasils]
  );

  useEffect(() => {
    const next: Record<string, DraftMapping> = {};
    paketSoals.forEach((q) => {
      const hasSaved =
        q.tka_elemen &&
        q.tka_subelemen &&
        (bidangOverride === 'AUTO' || q.tka_mapel === activeBidang);
      if (hasSaved) {
        next[q.id_soal] = {
          tka_mapel: q.tka_mapel === 'Bahasa Indonesia' ? 'Bahasa Indonesia' : 'Matematika',
          tka_elemen: q.tka_elemen!,
          tka_subelemen: q.tka_subelemen!,
          tka_indikator: q.tka_indikator || q.tka_subelemen!,
          source: 'Tersimpan',
          reason: 'Tersimpan di database soal',
        };
      } else {
        const cls = classifySoalTka(q, activeBidang);
        next[q.id_soal] = {
          tka_mapel: cls.mapel,
          tka_elemen: cls.elemen,
          tka_subelemen: cls.subelemen,
          tka_indikator: cls.indikator,
          source: 'Otomatis',
          reason: cls.reason,
        };
      }
    });
    setDrafts(next);
  }, [activeBidang, bidangOverride, paketSoals]);

  const handleRunAutoAnalyzeAll = () => {
    const next: Record<string, DraftMapping> = {};
    paketSoals.forEach((q) => {
      const stripped: SoalLengkap = {
        ...q,
        tka_mapel: undefined,
        tka_elemen: undefined,
        tka_subelemen: undefined,
        tka_indikator: undefined,
      };
      const cls = classifySoalTka(stripped, activeBidang);
      next[q.id_soal] = {
        tka_mapel: cls.mapel,
        tka_elemen: cls.elemen,
        tka_subelemen: cls.subelemen,
        tka_indikator: cls.indikator,
        source: 'Otomatis',
        reason: cls.reason,
      };
    });
    setDrafts(next);
    onToast(
      `${paketSoals.length} soal dianalisis ulang berdasarkan kisi-kisi TKA ${activeBidang}.`,
      'ok'
    );
  };

  const hasUnsavedChanges = useMemo(() => {
    return paketSoals.some((q) => {
      const d = drafts[q.id_soal];
      if (!d) return false;
      return (
        (q.tka_mapel || '') !== d.tka_mapel ||
        (q.tka_elemen || '') !== d.tka_elemen ||
        (q.tka_subelemen || '') !== d.tka_subelemen ||
        (q.tka_indikator || '') !== d.tka_indikator
      );
    });
  }, [drafts, paketSoals]);

  const handleSaveMappings = async () => {
    if (paketSoals.length === 0) return;
    setSaving(true);
    try {
      const updates = paketSoals
        .map((q) => {
          const d = drafts[q.id_soal];
          if (!d) return null;
          return {
            id: q.id,
            tka_mapel: d.tka_mapel,
            tka_elemen: d.tka_elemen,
            tka_subelemen: d.tka_subelemen,
            tka_indikator: d.tka_indikator,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const count = await updateSoalTkaBatch(updates);
      await onRefresh();
      onToast(`${count} pemetaan TKA soal berhasil disimpan ke Firestore.`, 'ok');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan pemetaan TKA.', 'err');
    } finally {
      setSaving(false);
    }
  };

  const soalMasteryMap = useMemo(() => {
    const map = new Map<string, { got: number; max: number; pct: number | null }>();
    paketSoals.forEach((q) => {
      if (filteredHasils.length === 0) {
        map.set(q.id_soal, { got: 0, max: 0, pct: null });
        return;
      }
      let got = 0;
      let max = 0;
      filteredHasils.forEach((h) => {
        const sc = scoreQuestion(q, h.detail_jawaban?.[q.id_soal]);
        got += sc.skor;
        max += sc.maks;
      });
      const pct = max > 0 ? Math.round((got / max) * 1000) / 10 : 0;
      map.set(q.id_soal, { got, max, pct });
    });
    return map;
  }, [filteredHasils, paketSoals]);

  const elemenNames = useMemo(
    () => Array.from(new Set(framework.map((f) => f.elemen))),
    [framework]
  );

  const elemenSummary = useMemo(() => {
    return elemenNames.map((elName, idx) => {
      const qs = paketSoals.filter((q) => drafts[q.id_soal]?.tka_elemen === elName);
      let got = 0;
      let max = 0;
      qs.forEach((q) => {
        const m = soalMasteryMap.get(q.id_soal);
        if (m) {
          got += m.got;
          max += m.max;
        }
      });
      const pct =
        filteredHasils.length > 0 && max > 0 ? Math.round((got / max) * 1000) / 10 : null;
      return {
        no: idx + 1,
        elemen: elName,
        jumlahSoal: qs.length,
        nomorList: qs.map((q) => q.nomor_soal),
        pct,
      };
    });
  }, [drafts, elemenNames, filteredHasils.length, paketSoals, soalMasteryMap]);

  const subelemenSummary = useMemo(() => {
    return framework.map((fw) => {
      const qs = paketSoals.filter(
        (q) =>
          drafts[q.id_soal]?.tka_elemen === fw.elemen &&
          drafts[q.id_soal]?.tka_subelemen === fw.subelemen
      );
      let got = 0;
      let max = 0;
      qs.forEach((q) => {
        const m = soalMasteryMap.get(q.id_soal);
        if (m) {
          got += m.got;
          max += m.max;
        }
      });
      const pct =
        filteredHasils.length > 0 && max > 0 ? Math.round((got / max) * 1000) / 10 : null;
      const indikatorDetails = fw.indikatorList.map((ind) => {
        const iqs = qs.filter((q) => drafts[q.id_soal]?.tka_indikator === ind);
        let igot = 0;
        let imax = 0;
        iqs.forEach((q) => {
          const m = soalMasteryMap.get(q.id_soal);
          if (m) {
            igot += m.got;
            imax += m.max;
          }
        });
        const ipct =
          filteredHasils.length > 0 && imax > 0 ? Math.round((igot / imax) * 1000) / 10 : null;
        return {
          indikator: ind,
          soalCount: iqs.length,
          nomorList: iqs.map((q) => q.nomor_soal),
          pct: ipct,
        };
      });
      return {
        fw,
        jumlahSoal: qs.length,
        nomorList: qs.map((q) => q.nomor_soal),
        pct,
        indikatorDetails,
      };
    });
  }, [drafts, filteredHasils.length, framework, paketSoals, soalMasteryMap]);

  const studentRows = useMemo(() => {
    return filteredHasils.map((h) => {
      const perElemen: Record<string, number | null> = {};
      elemenNames.forEach((elName) => {
        const qs = paketSoals.filter((q) => drafts[q.id_soal]?.tka_elemen === elName);
        if (qs.length === 0) {
          perElemen[elName] = null;
          return;
        }
        let got = 0;
        let max = 0;
        qs.forEach((q) => {
          const sc = scoreQuestion(q, h.detail_jawaban?.[q.id_soal]);
          got += sc.skor;
          max += sc.maks;
        });
        perElemen[elName] = max > 0 ? Math.round((got / max) * 1000) / 10 : 0;
      });
      return { hasil: h, perElemen };
    });
  }, [drafts, elemenNames, filteredHasils, paketSoals]);

  const totalIndikator = useMemo(
    () => framework.reduce((sum, f) => sum + f.indikatorList.length, 0),
    [framework]
  );
  const coveredIndikator = useMemo(
    () =>
      subelemenSummary.reduce(
        (sum, s) => sum + s.indikatorDetails.filter((i) => i.soalCount > 0).length,
        0
      ),
    [subelemenSummary]
  );
  const overallAvgPct = useMemo(() => {
    if (filteredHasils.length === 0 || paketSoals.length === 0) return null;
    let got = 0;
    let max = 0;
    paketSoals.forEach((q) => {
      const m = soalMasteryMap.get(q.id_soal);
      if (m) {
        got += m.got;
        max += m.max;
      }
    });
    return max > 0 ? Math.round((got / max) * 1000) / 10 : null;
  }, [filteredHasils.length, paketSoals, soalMasteryMap]);

  const handleExportExcel = () => {
    if (!activePaket) return;
    const headers = [
      'Elemen_Materi',
      'Sub_Elemen',
      'Cakupan_Indikator',
      'Jumlah_Soal',
      'Nomor_Soal',
      'Persen_Penguasaan',
    ];
    const rows: Record<string, unknown>[] = [];
    subelemenSummary.forEach((s) => {
      s.indikatorDetails.forEach((ind) => {
        rows.push({
          Elemen_Materi: s.fw.elemen,
          Sub_Elemen: s.fw.subelemen,
          Cakupan_Indikator: ind.indikator,
          Jumlah_Soal: ind.soalCount,
          Nomor_Soal: ind.nomorList.join(', ') || '-',
          Persen_Penguasaan: ind.pct === null ? '-' : `${ind.pct}%`,
        });
      });
    });
    exportRowsToExcel(`analisis_tka_${activePaket.nama_paket_soal}.xlsx`, headers, rows);
  };

  const handleExportPdf = () => {
    if (!activePaket) return;
    const slug = activePaket.nama_paket_soal.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const rows: (string | number)[][] = [];
    subelemenSummary.forEach((s) => {
      s.indikatorDetails.forEach((ind) => {
        rows.push([
          s.fw.elemen,
          s.fw.subelemen,
          ind.indikator,
          ind.soalCount,
          ind.nomorList.join(', ') || '-',
          ind.pct === null ? '-' : `${ind.pct}%`,
        ]);
      });
    });
    exportTablePdf({
      filename: `analisis_tka_${slug}.pdf`,
      title: `ANALISIS MATERI & KOMPETENSI TKA (${activeBidang.toUpperCase()})`,
      schoolName: settings?.judul || 'Portal Ujian CBT',
      schoolSubtitle: settings?.subjudul || '',
      orientation: 'landscape',
      metaPairs: [
        { label: 'Paket Ujian', value: activePaket.nama_paket_soal },
        { label: 'Kelas', value: filterKelas || 'Semua Kelas' },
        { label: 'Peserta Dianalisis', value: `${filteredHasils.length} siswa` },
        {
          label: 'Rata-rata Penguasaan',
          value: overallAvgPct !== null ? `${overallAvgPct}%` : '-',
        },
      ],
      headers: [
        'Elemen Materi',
        'Sub-Elemen',
        'Cakupan Indikator',
        'Jml Soal',
        'No. Soal',
        'Penguasaan',
      ],
      rows,
    });
    onToast('File PDF analisis TKA berhasil diunduh.', 'ok');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header & Toolbar */}
      <div className="flex flex-col gap-3 no-print">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            Analisis Materi &amp; Kompetensi TKA
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pemetaan butir soal dan penguasaan peserta berdasarkan kerangka TKA {activeBidang}.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <select
            value={activePaket?.id || ''}
            onChange={(e) => setSelectedPaketId(e.target.value)}
            className="col-span-2 sm:col-span-1 min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
          >
            {pakets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama_paket_soal}
              </option>
            ))}
          </select>

          <select
            value={bidangOverride}
            onChange={(e) => setBidangOverride(e.target.value as 'AUTO' | TkaBidang)}
            className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
          >
            <option value="AUTO">Otomatis ({inferTkaBidang(activePaket, paketSoals)})</option>
            <option value="Matematika">TKA Matematika</option>
            <option value="Bahasa Indonesia">TKA Bahasa Indonesia</option>
          </select>

          <select
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
          >
            <option value="">Semua Kelas</option>
            {kelasList.map((k) => (
              <option key={k} value={k}>
                Kelas {k}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleRunAutoAnalyzeAll}
            disabled={paketSoals.length === 0}
            className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-sky-600" />
            Analisis Ulang
          </button>

          <button
            type="button"
            onClick={() => void handleSaveMappings()}
            disabled={saving || paketSoals.length === 0 || !hasUnsavedChanges}
            className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Menyimpan...' : 'Simpan Pemetaan'}
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Ekspor Excel
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            Cetak PDF
          </button>

          <button
            type="button"
            onClick={() => triggerPrintOrPdf(handleExportPdf, (msg) => onToast(msg, 'ok'))}
            className="min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Cetak
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex overflow-x-auto scrollbar-smooth gap-1 p-1 bg-slate-200/70 rounded-xl no-print w-full sm:w-fit">
        {(
          [
            ['overview', 'Ringkasan Materi'],
            ['butir', 'Pemetaan Butir'],
            ['siswa', 'Per Siswa'],
            ['kisi', 'Kisi-Kisi TKA'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {hasUnsavedChanges && (
        <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200/80 text-xs text-sky-900 flex flex-wrap items-center justify-between gap-2 no-print">
          <span>
            Ada hasil pemetaan TKA yang belum disimpan ke database. Klik{' '}
            <strong>Simpan Pemetaan</strong> agar tersimpan permanen pada soal.
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveMappings()}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
          >
            Simpan Sekarang
          </button>
        </div>
      )}

      {/* TAB 1: OVERVIEW & COVERAGE */}
      {subTab === 'overview' && (
        <div className="space-y-5">
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              {
                label: 'Total Butir Soal',
                val: paketSoals.length,
                sub: activePaket?.nama_paket_soal || '-',
                icon: FileText,
                iconBg: 'bg-sky-50 text-sky-600 border-sky-200/60',
              },
              {
                label: 'Keterpenuhan Subkompetensi',
                val: `${coveredIndikator} / ${totalIndikator}`,
                sub: 'Indikator terwakili soal',
                icon: CheckCircle2,
                iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-200/60',
              },
              {
                label: 'Peserta Dianalisis',
                val: filteredHasils.length,
                sub: filterKelas ? `Kelas ${filterKelas}` : 'Seluruh kelas',
                icon: Users,
                iconBg: 'bg-amber-50 text-amber-600 border-amber-200/60',
              },
              {
                label: 'Rata-rata Penguasaan',
                val: overallAvgPct === null ? '-' : `${overallAvgPct}%`,
                sub: 'Skor perolehan / maks',
                icon: Award,
                iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200/60',
              },
            ].map((k) => {
              const Icon = k.icon;
              return (
                <div
                  key={k.label}
                  className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-slate-500 font-medium leading-snug">
                      {k.label}
                    </span>
                    <span
                      className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${k.iconBg}`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.85} />
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
                    {k.val}
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
                    {k.sub}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary per Elemen / Kompetensi */}
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-bold text-sm text-slate-900">
                Rekap Per {activeBidang === 'Matematika' ? 'Elemen / Materi' : 'Kompetensi'} TKA{' '}
                {activeBidang}
              </h2>
            </div>

            {/* Mobile Summary Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {elemenSummary.map((row) => {
                const badge = getMasteryBadge(row.pct);
                return (
                  <div key={row.elemen} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm text-slate-900">
                        {row.no}. {row.elemen}
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.jumlahSoal} soal (No. {row.nomorList.length ? row.nomorList.join(', ') : '-'})
                    </div>
                    {row.pct !== null && (
                      <div className="flex items-center gap-2.5 pt-1">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${Math.min(100, row.pct)}%` }}
                          />
                        </div>
                        <span className="font-mono tabular-nums text-xs font-bold text-slate-800">
                          {row.pct}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
                  <tr>
                    <th className="py-3 px-4 w-12">No</th>
                    <th className="py-3 px-4">
                      {activeBidang === 'Matematika' ? 'Elemen / Materi' : 'Kompetensi'}
                    </th>
                    <th className="py-3 px-4">Jumlah Soal</th>
                    <th className="py-3 px-4">Nomor Soal</th>
                    <th className="py-3 px-4 w-56">% Penguasaan</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {elemenSummary.map((row) => {
                    const badge = getMasteryBadge(row.pct);
                    return (
                      <tr key={row.elemen} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-500">{row.no}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.elemen}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                          {row.jumlahSoal}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">
                          {row.nomorList.length ? row.nomorList.join(', ') : '-'}
                        </td>
                        <td className="py-3 px-4">
                          {row.pct === null ? (
                            <span className="text-xs text-slate-400">-</span>
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full bg-blue-600 rounded-full"
                                  style={{ width: `${Math.min(100, row.pct)}%` }}
                                />
                              </div>
                              <span className="font-mono tabular-nums text-xs font-semibold text-slate-800 w-12 text-right">
                                {row.pct}%
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Sub-elemen & Cakupan Matrix */}
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-bold text-sm text-slate-900">
                Rincian Cakupan Sub-elemen &amp; Indikator TKA
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribusi soal yang sudah ada dan bagian kisi-kisi yang belum terwakili.
              </p>
            </div>
            <div className="overflow-x-auto scrollbar-smooth">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
                  <tr>
                    <th className="py-3 px-4">Elemen / Kompetensi</th>
                    <th className="py-3 px-4">Sub-elemen / Cakupan Indikator</th>
                    <th className="py-3 px-4">Soal Terkait</th>
                    <th className="py-3 px-4">% Penguasaan</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {subelemenSummary.map((group) => (
                    <React.Fragment key={`${group.fw.elemen}_${group.fw.subelemen}`}>
                      <tr className="bg-slate-50/70">
                        <td className="py-2.5 px-4 font-semibold text-slate-900 text-xs">
                          {group.fw.elemen}
                        </td>
                        <td className="py-2.5 px-4 text-xs min-w-[220px]">
                          <div className="font-bold text-slate-900">{group.fw.subelemen}</div>
                          {group.fw.batasanCatatan && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Batasan: {group.fw.batasanCatatan}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {group.jumlahSoal} soal
                          {group.nomorList.length > 0 && ` (No. ${group.nomorList.join(', ')})`}
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-xs font-bold text-slate-900">
                          {group.pct === null ? '-' : `${group.pct}%`}
                        </td>
                        <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold ${
                              getMasteryBadge(group.pct).cls
                            }`}
                          >
                            {getMasteryBadge(group.pct).label}
                          </span>
                        </td>
                      </tr>
                      {group.indikatorDetails.map((ind) => {
                        const badge = getMasteryBadge(ind.pct);
                        return (
                          <tr key={ind.indikator} className="hover:bg-slate-50/50">
                            <td className="py-2 px-4 text-xs text-slate-400">↳</td>
                            <td className="py-2 px-4 text-xs text-slate-700">{ind.indikator}</td>
                            <td className="py-2 px-4 text-xs font-mono whitespace-nowrap">
                              {ind.soalCount > 0 ? (
                                <span className="text-slate-800">
                                  {ind.soalCount} soal (No. {ind.nomorList.join(', ')})
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Belum ada soal</span>
                              )}
                            </td>
                            <td className="py-2 px-4 font-mono tabular-nums text-xs text-slate-700">
                              {ind.pct === null ? '-' : `${ind.pct}%`}
                            </td>
                            <td className="py-2 px-4 text-xs whitespace-nowrap">
                              {ind.soalCount === 0 ? (
                                <span className="text-slate-400">Kosong</span>
                              ) : (
                                <span className={`px-2 py-0.5 rounded-md font-semibold ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MAPPING PER EXISTING QUESTION */}
      {subTab === 'butir' && (
        <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-bold text-sm text-slate-900">
              Pemetaan Butir Soal yang Sudah Ada ({paketSoals.length} soal)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Periksa atau sesuaikan Elemen, Sub-elemen, dan Indikator tiap butir soal lalu klik
              Simpan Pemetaan.
            </p>
          </div>

          {/* Mobile Stacked Mapping Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {paketSoals.map((q) => {
              const d = drafts[q.id_soal];
              const m = soalMasteryMap.get(q.id_soal);
              const subOptions = framework.filter((f) => f.elemen === d?.tka_elemen);
              const currentSubObj =
                subOptions.find((f) => f.subelemen === d?.tka_subelemen) || subOptions[0];
              const indOptions = currentSubObj?.indikatorList || [];

              return (
                <div key={q.id_soal} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                      Soal No. {q.nomor_soal} · {q.jenis_soal}
                    </span>
                    <span className="font-mono tabular-nums text-xs font-semibold text-blue-600">
                      {m?.pct === null || m?.pct === undefined ? '-' : `${m.pct}% Benar`}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700">
                    <RichText text={q.teks_soal} className="line-clamp-3" />
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {d?.source}: {d?.reason}
                  </div>
                  <div className="space-y-2 pt-1">
                    <select
                      value={d?.tka_elemen || ''}
                      onChange={(e) => {
                        const nextEl = e.target.value;
                        const firstSub = framework.find((f) => f.elemen === nextEl);
                        setDrafts((prev) => ({
                          ...prev,
                          [q.id_soal]: {
                            tka_mapel: activeBidang,
                            tka_elemen: nextEl,
                            tka_subelemen: firstSub?.subelemen || '',
                            tka_indikator: firstSub?.indikatorList[0] || '',
                            source: 'Diubah',
                            reason: 'Disesuaikan manual oleh admin',
                          },
                        }));
                      }}
                      className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                    >
                      {elemenNames.map((el) => (
                        <option key={el} value={el}>
                          {el}
                        </option>
                      ))}
                    </select>
                    <select
                      value={d?.tka_subelemen || ''}
                      onChange={(e) => {
                        const nextSub = e.target.value;
                        const subObj = subOptions.find((f) => f.subelemen === nextSub);
                        setDrafts((prev) => ({
                          ...prev,
                          [q.id_soal]: {
                            ...(prev[q.id_soal] || {
                              tka_mapel: activeBidang,
                              tka_elemen: d?.tka_elemen || '',
                            }),
                            tka_subelemen: nextSub,
                            tka_indikator: subObj?.indikatorList[0] || '',
                            source: 'Diubah',
                            reason: 'Disesuaikan manual oleh admin',
                          },
                        }));
                      }}
                      className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                    >
                      {subOptions.map((s) => (
                        <option key={s.subelemen} value={s.subelemen}>
                          {s.subelemen}
                        </option>
                      ))}
                    </select>
                    <select
                      value={d?.tka_indikator || ''}
                      onChange={(e) => {
                        const nextInd = e.target.value;
                        setDrafts((prev) => ({
                          ...prev,
                          [q.id_soal]: {
                            ...(prev[q.id_soal] || {
                              tka_mapel: activeBidang,
                              tka_elemen: d?.tka_elemen || '',
                              tka_subelemen: d?.tka_subelemen || '',
                            }),
                            tka_indikator: nextInd,
                            source: 'Diubah',
                            reason: 'Disesuaikan manual oleh admin',
                          },
                        }));
                      }}
                      className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                    >
                      {indOptions.map((ind) => (
                        <option key={ind} value={ind}>
                          {ind}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
            {paketSoals.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-400">
                Belum ada soal pada paket ini.
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4 w-12">No</th>
                  <th className="py-3 px-4">Cuplikan Soal</th>
                  <th className="py-3 px-4">Elemen / Kompetensi</th>
                  <th className="py-3 px-4">Sub-elemen</th>
                  <th className="py-3 px-4">Cakupan / Subkompetensi</th>
                  <th className="py-3 px-4">% Benar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {paketSoals.map((q) => {
                  const d = drafts[q.id_soal];
                  const m = soalMasteryMap.get(q.id_soal);
                  const subOptions = framework.filter((f) => f.elemen === d?.tka_elemen);
                  const currentSubObj =
                    subOptions.find((f) => f.subelemen === d?.tka_subelemen) || subOptions[0];
                  const indOptions = currentSubObj?.indikatorList || [];

                  return (
                    <tr key={q.id_soal} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-800">
                        {q.nomor_soal}
                      </td>
                      <td className="py-3 px-4 max-w-xs text-xs text-slate-700 space-y-1">
                        <RichText text={q.teks_soal} className="line-clamp-3" />
                        <div className="text-[11px] text-slate-400">
                          {q.jenis_soal} · {d?.source}: {d?.reason}
                        </div>
                      </td>
                      <td className="py-3 px-3 min-w-[11rem]">
                        <select
                          value={d?.tka_elemen || ''}
                          onChange={(e) => {
                            const nextEl = e.target.value;
                            const firstSub = framework.find((f) => f.elemen === nextEl);
                            setDrafts((prev) => ({
                              ...prev,
                              [q.id_soal]: {
                                tka_mapel: activeBidang,
                                tka_elemen: nextEl,
                                tka_subelemen: firstSub?.subelemen || '',
                                tka_indikator: firstSub?.indikatorList[0] || '',
                                source: 'Diubah',
                                reason: 'Disesuaikan manual oleh admin',
                              },
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                        >
                          {elemenNames.map((el) => (
                            <option key={el} value={el}>
                              {el}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 min-w-[12rem]">
                        <select
                          value={d?.tka_subelemen || ''}
                          onChange={(e) => {
                            const nextSub = e.target.value;
                            const subObj = subOptions.find((f) => f.subelemen === nextSub);
                            setDrafts((prev) => ({
                              ...prev,
                              [q.id_soal]: {
                                ...(prev[q.id_soal] || {
                                  tka_mapel: activeBidang,
                                  tka_elemen: d?.tka_elemen || '',
                                }),
                                tka_subelemen: nextSub,
                                tka_indikator: subObj?.indikatorList[0] || '',
                                source: 'Diubah',
                                reason: 'Disesuaikan manual oleh admin',
                              },
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                        >
                          {subOptions.map((s) => (
                            <option key={s.subelemen} value={s.subelemen}>
                              {s.subelemen}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 min-w-[16rem]">
                        <select
                          value={d?.tka_indikator || ''}
                          onChange={(e) => {
                            const nextInd = e.target.value;
                            setDrafts((prev) => ({
                              ...prev,
                              [q.id_soal]: {
                                ...(prev[q.id_soal] || {
                                  tka_mapel: activeBidang,
                                  tka_elemen: d?.tka_elemen || '',
                                  tka_subelemen: d?.tka_subelemen || '',
                                }),
                                tka_indikator: nextInd,
                                source: 'Diubah',
                                reason: 'Disesuaikan manual oleh admin',
                              },
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                        >
                          {indOptions.map((ind) => (
                            <option key={ind} value={ind}>
                              {ind}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs font-semibold text-slate-800 whitespace-nowrap">
                        {m?.pct === null || m?.pct === undefined ? '-' : `${m.pct}%`}
                      </td>
                    </tr>
                  );
                })}
                {paketSoals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                      Belum ada soal pada paket ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PER STUDENT TKA MASTERY */}
      {subTab === 'siswa' && (
        <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-sm text-slate-900">
                Penguasaan Materi TKA Per Peserta ({studentRows.length} siswa)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!activePaket) return;
                const headers = ['Nama_Siswa', 'Kelas', 'Nilai_Akhir', ...elemenNames];
                exportRowsToExcel(
                  `tka_siswa_${activePaket.nama_paket_soal}.xlsx`,
                  headers,
                  studentRows.map(({ hasil, perElemen }) => {
                    const obj: Record<string, unknown> = {
                      Nama_Siswa: hasil.nama_siswa,
                      Kelas: hasil.kelas,
                      Nilai_Akhir: hasil.nilai_akhir,
                    };
                    elemenNames.forEach((el) => {
                      obj[el] = perElemen[el] === null ? '-' : `${perElemen[el]}%`;
                    });
                    return obj;
                  })
                );
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Ekspor Siswa (Excel)
            </button>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {studentRows.map(({ hasil, perElemen }) => (
              <div key={hasil.id} className="p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm text-slate-900">{hasil.nama_siswa}</div>
                    <div className="text-xs text-slate-500">Kelas {hasil.kelas}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Nilai Akhir</div>
                    <div className="font-mono tabular-nums font-bold text-base text-slate-900">
                      {hasil.nilai_akhir}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1.5 pt-1">
                  {elemenNames.map((el) => {
                    const val = perElemen[el];
                    const badge = getMasteryBadge(val);
                    return (
                      <div key={el} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 truncate pr-2">{el}</span>
                        {val === null ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-md font-mono font-semibold ${badge.cls}`}>
                            {val}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {studentRows.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-400">
                Belum ada hasil ujian pada paket ini.
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4 w-10">No</th>
                  <th className="py-3 px-4">Nama Siswa</th>
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Nilai Akhir</th>
                  {elemenNames.map((el) => (
                    <th key={el} className="py-3 px-4">
                      {el}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentRows.map(({ hasil, perElemen }, idx) => (
                  <tr key={hasil.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{hasil.nama_siswa}</td>
                    <td className="py-2.5 px-4 text-slate-700">{hasil.kelas}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-slate-900">
                      {hasil.nilai_akhir}
                    </td>
                    {elemenNames.map((el) => {
                      const val = perElemen[el];
                      const badge = getMasteryBadge(val);
                      return (
                        <td key={el} className="py-2.5 px-4 font-mono tabular-nums text-xs">
                          {val === null ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-md font-semibold ${badge.cls}`}>
                              {val}%
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {studentRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={4 + elemenNames.length}
                      className="py-8 text-center text-sm text-slate-400"
                    >
                      Belum ada hasil ujian pada paket ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: OFFICIAL TKA FRAMEWORK REFERENCE */}
      {subTab === 'kisi' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <BookOpenCheck className="w-4 h-4" />
              </span>
              <h2 className="font-bold text-sm text-slate-900">
                Ketentuan Kisi-Kisi TKA Matematika (Numerasi)
              </h2>
            </div>
            <div className="overflow-x-auto scrollbar-smooth">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/80 text-left text-slate-600 border-b border-slate-200/80">
                  <tr>
                    <th className="py-2.5 px-3 w-10">No</th>
                    <th className="py-2.5 px-4">Elemen / Materi</th>
                    <th className="py-2.5 px-4">Sub-elemen / Submateri</th>
                    <th className="py-2.5 px-4 min-w-[260px]">Kompetensi &amp; Cakupan</th>
                    <th className="py-2.5 px-4">Batasan / Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {TKA_MATEMATIKA_FRAMEWORK.map((r) => (
                    <tr key={`${r.elemen}_${r.subelemen}`}>
                      <td className="py-3 px-3 font-mono text-slate-500">{r.no}.</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{r.elemen}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{r.subelemen}</td>
                      <td className="py-3 px-4 text-slate-700 space-y-1">
                        <p>{r.kompetensiDesc}</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {r.indikatorList.map((ind) => (
                            <li key={ind}>{ind}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{r.batasanCatatan || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <BookOpenCheck className="w-4 h-4" />
              </span>
              <h2 className="font-bold text-sm text-slate-900">
                Ketentuan Kisi-Kisi TKA Bahasa Indonesia (Literasi)
              </h2>
            </div>
            <div className="overflow-x-auto scrollbar-smooth">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/80 text-left text-slate-600 border-b border-slate-200/80">
                  <tr>
                    <th className="py-2.5 px-3 w-10">No</th>
                    <th className="py-2.5 px-4">Kompetensi</th>
                    <th className="py-2.5 px-4 min-w-[260px]">Subkompetensi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {TKA_BAHASA_INDONESIA_FRAMEWORK.map((r) => (
                    <tr key={r.elemen}>
                      <td className="py-3 px-3 font-mono text-slate-500">{r.no}.</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{r.elemen}</td>
                      <td className="py-3 px-4 text-slate-700">
                        <ul className="list-disc pl-4 space-y-1">
                          {r.indikatorList.map((ind) => (
                            <li key={ind}>{ind}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
