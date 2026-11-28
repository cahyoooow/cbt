import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  List,
  Radio,
  RotateCcw,
  Search,
  Timer,
  Trophy,
  Users,
  Wifi,
} from 'lucide-react';
import {
  forceFinishSiswa,
  resetPesertaUjian,
  subscribeMonitorPaket,
} from '../../services/cbtService';
import type { HasilUjian, PaketUjian, ProgresUjian, Siswa, SoalLengkap } from '../../types/cbt';
import { calculateExamScore, formatSeconds, isQuestionAnswered } from '../../utils/mathFormat';

interface Props {
  tab: 'pantau' | 'live';
  pakets: PaketUjian[];
  soals: SoalLengkap[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

interface MonitorRow {
  siswa: Siswa;
  progres: ProgresUjian | undefined;
  hasil: HasilUjian | undefined;
  status: 'Selesai' | 'Sedang Mengerjakan' | 'Belum Mulai';
  online: boolean;
  dijawab: number;
  sisaDetik: number;
  benar: number;
  salah: number;
  nilai: number;
  pelanggaran: number;
  lastActive: string;
  submittedAtMs: number;
}

function statusRank(status: MonitorRow['status']): number {
  if (status === 'Selesai') return 2;
  if (status === 'Sedang Mengerjakan') return 1;
  return 0;
}

function compareLiveRows(a: MonitorRow, b: MonitorRow): number {
  const rankDiff = statusRank(b.status) - statusRank(a.status);
  if (rankDiff !== 0) return rankDiff;

  if (a.status === 'Selesai' && b.status === 'Selesai') {
    if (b.nilai !== a.nilai) return b.nilai - a.nilai;
    // Tie-breaker: lebih cepat kirim (timestamp lebih kecil) mendapat peringkat lebih tinggi
    if (a.submittedAtMs !== b.submittedAtMs) return a.submittedAtMs - b.submittedAtMs;
    return a.siswa.nama_siswa.localeCompare(b.siswa.nama_siswa);
  }

  if (a.status === 'Sedang Mengerjakan' && b.status === 'Sedang Mengerjakan') {
    if (b.nilai !== a.nilai) return b.nilai - a.nilai;
    if (b.dijawab !== a.dijawab) return b.dijawab - a.dijawab;
    if (a.submittedAtMs !== b.submittedAtMs) return a.submittedAtMs - b.submittedAtMs;
    return a.siswa.nama_siswa.localeCompare(b.siswa.nama_siswa);
  }

  return a.siswa.nama_siswa.localeCompare(b.siswa.nama_siswa);
}

function formatTimeWithSeconds(d?: Date | null): string {
  if (!d) return '-';
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AdminMonitorAndLive({ tab, pakets, soals, onRefresh, onToast }: Props) {
  const [selectedPaketId, setSelectedPaketId] = useState(() => pakets[0]?.id || '');
  const activePaket = useMemo(
    () => pakets.find((p) => p.id === selectedPaketId) || pakets[0] || null,
    [pakets, selectedPaketId]
  );

  const [allProgres, setAllProgres] = useState<ProgresUjian[]>([]);
  const [allHasils, setAllHasils] = useState<HasilUjian[]>([]);
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [filterKelas, setFilterKelas] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [viewMode, setViewMode] = useState<'per_kelas' | 'semua'>('per_kelas');
  const [collapsedKelas, setCollapsedKelas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activePaket?.id) return;
    const unsub = subscribeMonitorPaket(activePaket.id, {
      onProgres: setAllProgres,
      onHasil: setAllHasils,
      onSiswa: setSiswaList,
    });
    return () => unsub();
  }, [activePaket?.id]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const progresList = useMemo(
    () => (activePaket ? allProgres.filter((p) => p.paket_id === activePaket.id) : []),
    [activePaket, allProgres]
  );

  const hasilList = useMemo(
    () => (activePaket ? allHasils.filter((h) => h.paket_id === activePaket.id) : []),
    [activePaket, allHasils]
  );

  const paketSoals = useMemo(
    () =>
      activePaket
        ? soals
            .filter((q) => q.paket_id === activePaket.id)
            .sort((a, b) => a.nomor_soal - b.nomor_soal)
        : [],
    [activePaket, soals]
  );

  const monitorRows = useMemo<MonitorRow[]>(() => {
    if (!activePaket) return [];
    const hasilMap = new Map(hasilList.map((h) => [h.siswa_id, h]));
    const progMap = new Map(progresList.map((p) => [p.siswa_id, p]));
    const defaultDurasi = (activePaket.durasi_menit || 60) * 60;

    return siswaList.map((s) => {
      const h = hasilMap.get(s.id);
      const pg = progMap.get(s.id);

      if (h) {
        const answered = paketSoals.filter((q) =>
          isQuestionAnswered(q, h.detail_jawaban?.[q.id_soal])
        ).length;
        return {
          siswa: s,
          progres: pg,
          hasil: h,
          status: 'Selesai',
          online: false,
          dijawab: answered,
          sisaDetik: 0,
          benar: h.total_benar,
          salah: h.total_salah,
          nilai: h.nilai_akhir,
          pelanggaran: h.pelanggaran_tab,
          lastActive: formatTimeWithSeconds(h.created_at),
          submittedAtMs: h.created_at ? h.created_at.getTime() : Number.MAX_SAFE_INTEGER,
        };
      }

      if (s.status_ujian === `Sedang Ujian: ${activePaket.nama_paket_soal}` || pg) {
        const pre = pg?.precomputed;
        const ans = pg?.jawaban || {};
        const answered = pre
          ? pre.dijawab
          : paketSoals.filter((q) => isQuestionAnswered(q, ans[q.id_soal])).length;
        const liveScored = pre
          ? { benar: pre.benar, salah: pre.salah, nilai: pre.nilai }
          : calculateExamScore(paketSoals, ans);
        const ageSec = pg?.updated_at
          ? Math.max(0, (nowTick - pg.updated_at.getTime()) / 1000)
          : null;
        const isOnline = pre ? pre.online : ageSec !== null && ageSec <= 75;
        const sisa =
          pg?.sisa_detik != null
            ? Math.max(
                0,
                Math.round(isOnline && ageSec != null ? pg.sisa_detik - ageSec : pg.sisa_detik)
              )
            : defaultDurasi;

        return {
          siswa: s,
          progres: pg,
          hasil: undefined,
          status: 'Sedang Mengerjakan',
          online: isOnline,
          dijawab: answered,
          sisaDetik: sisa,
          benar: liveScored.benar,
          salah: liveScored.salah,
          nilai: liveScored.nilai,
          pelanggaran: pg?.pelanggaran || 0,
          lastActive: pre?.lastActiveLabel || formatTimeWithSeconds(pg?.updated_at),
          submittedAtMs: pg?.updated_at ? pg.updated_at.getTime() : Number.MAX_SAFE_INTEGER,
        };
      }

      return {
        siswa: s,
        progres: undefined,
        hasil: undefined,
        status: 'Belum Mulai',
        online: false,
        dijawab: 0,
        sisaDetik: defaultDurasi,
        benar: 0,
        salah: 0,
        nilai: 0,
        pelanggaran: 0,
        lastActive: '-',
        submittedAtMs: Number.MAX_SAFE_INTEGER,
      };
    });
  }, [activePaket, hasilList, nowTick, paketSoals, progresList, siswaList]);

  const kelasList = useMemo(
    () => Array.from(new Set(siswaList.map((s) => s.kelas).filter(Boolean))).sort(),
    [siswaList]
  );

  const filteredRows = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const rows = monitorRows.filter((r) => {
      if (filterKelas && r.siswa.kelas !== filterKelas) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (q && !r.siswa.nama_siswa.toLowerCase().includes(q)) return false;
      return true;
    });
    if (tab === 'live') {
      return [...rows].sort(compareLiveRows);
    }
    return rows;
  }, [filterKelas, filterStatus, monitorRows, searchQ, tab]);

  const summary = useMemo(() => {
    const total = monitorRows.length;
    const selesai = monitorRows.filter((r) => r.status === 'Selesai').length;
    const mengerjakan = monitorRows.filter((r) => r.status === 'Sedang Mengerjakan').length;
    const online = monitorRows.filter((r) => r.online).length;
    return { total, selesai, mengerjakan, online };
  }, [monitorRows]);

  const liveScoreStats = useMemo(() => {
    const selesaiFiltered = filteredRows.filter((r) => r.status === 'Selesai');
    const aktifFiltered = filteredRows.filter((r) => r.status === 'Sedang Mengerjakan');
    const scoredPool = selesaiFiltered.length > 0 ? selesaiFiltered : aktifFiltered;

    if (scoredPool.length === 0) {
      return {
        hasScores: false,
        selesaiCount: selesaiFiltered.length,
        mengerjakanCount: aktifFiltered.length,
        totalCount: filteredRows.length,
        tertinggi: 0,
        terendah: 0,
        rataRata: 0,
        topName: '-',
        topTime: '-',
        lowName: '-',
        poolCount: 0,
        fromFinished: false,
      };
    }

    const sorted = [...scoredPool].sort(compareLiveRows);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const avg =
      Math.round(
        (scoredPool.reduce((acc, r) => acc + r.nilai, 0) / scoredPool.length) * 100
      ) / 100;

    return {
      hasScores: true,
      selesaiCount: selesaiFiltered.length,
      mengerjakanCount: aktifFiltered.length,
      totalCount: filteredRows.length,
      tertinggi: top.nilai,
      terendah: bottom.nilai,
      rataRata: avg,
      topName: top.siswa.nama_siswa,
      topTime: top.lastActive,
      lowName: bottom.siswa.nama_siswa,
      poolCount: scoredPool.length,
      fromFinished: selesaiFiltered.length > 0,
    };
  }, [filteredRows]);

  const perKelasSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        kelas: string;
        total: number;
        online: number;
        mengerjakan: number;
        selesai: number;
        scoredValues: number[];
      }
    >();

    monitorRows.forEach((r) => {
      const k = r.siswa.kelas?.trim() || 'Tanpa Kelas';
      const entry = map.get(k) || {
        kelas: k,
        total: 0,
        online: 0,
        mengerjakan: 0,
        selesai: 0,
        scoredValues: [],
      };
      entry.total += 1;
      if (r.online) entry.online += 1;
      if (r.status === 'Sedang Mengerjakan') entry.mengerjakan += 1;
      if (r.status === 'Selesai') {
        entry.selesai += 1;
        entry.scoredValues.push(r.nilai);
      }
      map.set(k, entry);
    });

    return Array.from(map.values())
      .map((item) => {
        const hasScored = item.scoredValues.length > 0;
        return {
          ...item,
          maxNilai: hasScored ? Math.max(...item.scoredValues) : null,
          minNilai: hasScored ? Math.min(...item.scoredValues) : null,
        };
      })
      .sort((a, b) => a.kelas.localeCompare(b.kelas));
  }, [monitorRows]);

  const groupedFilteredRows = useMemo(() => {
    const map = new Map<string, MonitorRow[]>();
    filteredRows.forEach((r) => {
      const k = r.siswa.kelas?.trim() || 'Tanpa Kelas';
      const list = map.get(k) || [];
      list.push(r);
      map.set(k, list);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kelasName, items]) => {
        const sortedItems =
          tab === 'live'
            ? [...items].sort(compareLiveRows)
            : [...items].sort((x, y) => x.siswa.nama_siswa.localeCompare(y.siswa.nama_siswa));
        const finished = sortedItems.filter((i) => i.status === 'Selesai');
        const activeScored =
          finished.length > 0
            ? finished
            : sortedItems.filter((i) => i.status === 'Sedang Mengerjakan');
        const maxNilai =
          activeScored.length > 0 ? Math.max(...activeScored.map((i) => i.nilai)) : null;
        const minNilai =
          activeScored.length > 0 ? Math.min(...activeScored.map((i) => i.nilai)) : null;

        return {
          kelasName,
          items: sortedItems,
          online: items.filter((i) => i.online).length,
          mengerjakan: items.filter((i) => i.status === 'Sedang Mengerjakan').length,
          selesai: finished.length,
          maxNilai,
          minNilai,
        };
      });
  }, [filteredRows, tab]);

  const toggleKelasCollapse = (kelasName: string) => {
    setCollapsedKelas((prev) => {
      const next = new Set(prev);
      if (next.has(kelasName)) next.delete(kelasName);
      else next.add(kelasName);
      return next;
    });
  };

  if (!activePaket) {
    return (
      <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-8 text-center text-sm text-slate-500">
        Belum ada paket ujian. Buat paket soal terlebih dahulu di menu Daftar Ujian.
      </div>
    );
  }

  const isPerKelasMode = viewMode === 'per_kelas';

  const renderRankBadge = (idx: number, status: MonitorRow['status']) => {
    const rank = idx + 1;
    if (tab !== 'live') {
      return <span className="font-mono tabular-nums text-slate-500">{rank}</span>;
    }
    if (status === 'Belum Mulai') {
      return <span className="font-mono tabular-nums text-slate-400">-</span>;
    }
    const badgeClass =
      rank === 1
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : rank === 2
        ? 'bg-slate-200/80 text-slate-800 border-slate-300'
        : rank === 3
        ? 'bg-orange-100 text-orange-800 border-orange-200'
        : 'bg-slate-100 text-slate-600 border-slate-200/70';

    return (
      <span
        className={`inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-lg border text-xs font-mono font-bold tabular-nums ${badgeClass}`}
      >
        #{rank}
      </span>
    );
  };

  const renderMobileCard = (r: MonitorRow, idx: number) => (
    <div
      key={r.siswa.id}
      className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4 space-y-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {tab === 'live' && (
            <div className="pt-0.5 shrink-0">{renderRankBadge(idx, r.status)}</div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-sm text-slate-900 truncate">
              {r.siswa.nama_siswa}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Kelas {r.siswa.kelas} · {r.status === 'Selesai' ? 'Kirim' : 'Aktif'}: {r.lastActive}
            </div>
          </div>
        </div>
        {r.status === 'Selesai' ? (
          <span className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Selesai
          </span>
        ) : r.status === 'Sedang Mengerjakan' ? (
          <span className="text-xs font-semibold text-sky-600 inline-flex items-center gap-1 shrink-0">
            <Clock className="w-3.5 h-3.5" />
            {r.online ? 'Online' : 'Idle'}
          </span>
        ) : (
          <span className="text-xs text-slate-400 shrink-0">Belum Mulai</span>
        )}
      </div>

      {r.status !== 'Belum Mulai' && (
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
          <div>
            <div className="text-[11px] text-slate-400">Dijawab</div>
            <div className="font-mono tabular-nums font-semibold text-slate-700 mt-0.5">
              {r.dijawab}/{paketSoals.length}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Sisa</div>
            <div className="font-mono tabular-nums font-semibold text-slate-700 mt-0.5">
              {r.status === 'Sedang Mengerjakan' ? formatSeconds(r.sisaDetik) : '-'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Nilai</div>
            <div className="font-mono tabular-nums font-bold text-slate-900 mt-0.5">
              {r.nilai}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Tab</div>
            <div
              className={`font-mono tabular-nums font-bold mt-0.5 ${
                r.pelanggaran > 0 ? 'text-rose-600' : 'text-slate-400'
              }`}
            >
              {r.pelanggaran}
            </div>
          </div>
        </div>
      )}

      {tab === 'pantau' && r.status !== 'Belum Mulai' && (
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          {r.status === 'Sedang Mengerjakan' && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Selesaikan paksa ujian "${r.siswa.nama_siswa}" sekarang?`)) {
                  return;
                }
                await forceFinishSiswa(activePaket, r.siswa, r.progres, paketSoals);
                await onRefresh();
                onToast(`Ujian "${r.siswa.nama_siswa}" diselesaikan.`, 'ok');
              }}
              className="flex-1 min-h-[40px] px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Selesaikan
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Reset ujian "${r.siswa.nama_siswa}"?`)) return;
              await resetPesertaUjian(activePaket, [r.siswa.id]);
              await onRefresh();
              onToast(`Ujian "${r.siswa.nama_siswa}" direset.`, 'ok');
            }}
            className="flex-1 min-h-[40px] px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      )}
    </div>
  );

  const renderTableRows = (rows: MonitorRow[], showKelasCol: boolean) =>
    rows.map((r, idx) => (
      <tr key={r.siswa.id} className="hover:bg-slate-50/70 transition-colors">
        <td className="py-2.5 px-4">{renderRankBadge(idx, r.status)}</td>
        <td className="py-2.5 px-4 font-semibold text-slate-900">
          <div>{r.siswa.nama_siswa}</div>
          <div className="text-[11px] font-normal text-slate-400">
            {r.status === 'Selesai' ? 'Waktu kirim' : 'Aktif'}: {r.lastActive}
          </div>
        </td>
        {showKelasCol && <td className="py-2.5 px-4 text-slate-700">{r.siswa.kelas}</td>}
        <td className="py-2.5 px-4">
          {r.status === 'Selesai' ? (
            <span className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Selesai
            </span>
          ) : r.status === 'Sedang Mengerjakan' ? (
            <span className="text-xs font-semibold text-sky-600 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {r.online ? 'Mengerjakan (Online)' : 'Mengerjakan (Idle)'}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Belum Mulai</span>
          )}
        </td>
        {tab === 'live' && (
          <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
            {r.status === 'Selesai' ? r.lastActive : '-'}
          </td>
        )}
        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
          {r.status === 'Belum Mulai' ? '-' : `${r.dijawab} / ${paketSoals.length}`}
        </td>
        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
          {r.status === 'Sedang Mengerjakan' ? formatSeconds(r.sisaDetik) : '-'}
        </td>
        <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600">
          {r.status === 'Belum Mulai' ? '-' : `${r.benar} / ${r.salah}`}
        </td>
        <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-slate-900">
          {r.status === 'Belum Mulai' ? '-' : r.nilai}
        </td>
        <td className="py-2.5 px-4 font-mono tabular-nums text-xs">
          {r.pelanggaran > 0 ? (
            <span className="text-rose-600 font-bold">{r.pelanggaran}</span>
          ) : (
            <span className="text-slate-400">0</span>
          )}
        </td>
        {tab === 'pantau' && (
          <td className="py-2.5 px-4 text-right whitespace-nowrap">
            <div className="inline-flex items-center gap-1.5">
              {r.status === 'Sedang Mengerjakan' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !window.confirm(`Selesaikan paksa ujian "${r.siswa.nama_siswa}" sekarang?`)
                    ) {
                      return;
                    }
                    await forceFinishSiswa(activePaket, r.siswa, r.progres, paketSoals);
                    await onRefresh();
                    onToast(`Ujian "${r.siswa.nama_siswa}" diselesaikan.`, 'ok');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Selesaikan
                </button>
              )}
              {r.status !== 'Belum Mulai' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Reset ujian "${r.siswa.nama_siswa}"?`)) return;
                    await resetPesertaUjian(activePaket, [r.siswa.id]);
                    await onRefresh();
                    onToast(`Ujian "${r.siswa.nama_siswa}" direset.`, 'ok');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
    ));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-[#0F172A]">
              {tab === 'pantau' ? 'Monitor Ujian Real-Time' : 'Live Score Peserta'}
            </h1>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Radio className="w-3.5 h-3.5" />
              Live
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {activePaket.nama_paket_soal} · {paketSoals.length} soal ·{' '}
            {tab === 'live'
              ? 'Nilai sama ditentukan oleh waktu kirim tercepat'
              : 'Pembaruan otomatis setiap 20 detik'}
          </p>
        </div>

        <select
          value={activePaket.id}
          onChange={(e) => setSelectedPaketId(e.target.value)}
          className="w-full sm:w-auto min-h-[42px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
        >
          {pakets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama_paket_soal}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Strip */}
      {tab === 'pantau' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Total Peserta',
              val: summary.total,
              color: 'text-slate-900',
              icon: Users,
              iconBg: 'bg-slate-100 text-slate-600 border-slate-200/70',
            },
            {
              label: 'Sedang Online',
              val: summary.online,
              color: 'text-sky-600',
              icon: Wifi,
              iconBg: 'bg-sky-50 text-sky-600 border-sky-200/80',
            },
            {
              label: 'Sedang Mengerjakan',
              val: summary.mengerjakan,
              color: 'text-amber-600',
              icon: Timer,
              iconBg: 'bg-amber-50 text-amber-600 border-amber-200/70',
            },
            {
              label: 'Sudah Selesai',
              val: summary.selesai,
              color: 'text-emerald-600',
              icon: CheckCircle2,
              iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200/70',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-slate-500">{item.label}</div>
                  <span
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${item.iconBg}`}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.9} />
                  </span>
                </div>
                <div className={`text-2xl font-bold font-mono tabular-nums mt-1.5 ${item.color}`}>
                  {item.val}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-500">Peserta Selesai</div>
              <span className="w-7 h-7 rounded-lg border bg-sky-50 text-sky-600 border-sky-200/80 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5" strokeWidth={1.9} />
              </span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums mt-1.5 text-slate-900">
              {liveScoreStats.selesaiCount}
              <span className="text-sm font-normal text-slate-400">
                /{liveScoreStats.totalCount}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {liveScoreStats.mengerjakanCount} sedang mengerjakan
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-500">Nilai Tertinggi</div>
              <span className="w-7 h-7 rounded-lg border bg-emerald-50 text-emerald-600 border-emerald-200/70 flex items-center justify-center shrink-0">
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.9} />
              </span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums mt-1.5 text-emerald-600">
              {liveScoreStats.hasScores ? liveScoreStats.tertinggi : '-'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {liveScoreStats.hasScores
                ? `${liveScoreStats.topName} (${liveScoreStats.topTime})`
                : 'Belum ada nilai masuk'}
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-500">Nilai Terendah</div>
              <span className="w-7 h-7 rounded-lg border bg-rose-50 text-rose-600 border-rose-200/70 flex items-center justify-center shrink-0">
                <ArrowDownRight className="w-3.5 h-3.5" strokeWidth={1.9} />
              </span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums mt-1.5 text-rose-600">
              {liveScoreStats.hasScores ? liveScoreStats.terendah : '-'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {liveScoreStats.hasScores ? liveScoreStats.lowName : 'Belum ada nilai masuk'}
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-500">Rata-rata Live</div>
              <span className="w-7 h-7 rounded-lg border bg-amber-50 text-amber-600 border-amber-200/70 flex items-center justify-center shrink-0">
                <Trophy className="w-3.5 h-3.5" strokeWidth={1.9} />
              </span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums mt-1.5 text-slate-900">
              {liveScoreStats.hasScores ? liveScoreStats.rataRata.toFixed(2) : '-'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {liveScoreStats.hasScores
                ? `Dari ${liveScoreStats.poolCount} peserta ${
                    liveScoreStats.fromFinished ? 'selesai' : 'aktif'
                  }`
                : 'Menunggu peserta'}
            </div>
          </div>
        </div>
      )}

      {/* Ringkasan Per Kelas (Monitor Ujian & Live Score) */}
      {perKelasSummary.length > 0 && (
        <div className="bg-white border border-sky-100 shadow-2xs rounded-2xl p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Award className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-bold text-[#0F172A]">
                {tab === 'pantau' ? 'Ringkasan Monitor Per Kelas' : 'Ringkasan Live Skor Per Kelas'}
              </span>
            </div>
            {filterKelas && (
              <button
                type="button"
                onClick={() => setFilterKelas('')}
                className="text-xs font-semibold text-sky-600 hover:underline cursor-pointer"
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
                  ? 'bg-sky-50/95 border-sky-400 ring-1 ring-sky-400/25'
                  : 'bg-[#F2F8FF] border-sky-200/70 hover:bg-[#E6F2FF]'
              }`}
            >
              <div className="text-xs font-bold text-[#0F172A]">Semua Kelas</div>
              <div className="text-[11px] font-mono tabular-nums text-slate-600 mt-0.5">
                {summary.total} peserta
              </div>
            </button>
            {perKelasSummary.map((item) => {
              const selected = filterKelas === item.kelas;
              return (
                <button
                  key={item.kelas}
                  type="button"
                  onClick={() => setFilterKelas((cur) => (cur === item.kelas ? '' : item.kelas))}
                  className={`text-left rounded-xl border p-2.5 transition-all cursor-pointer ${
                    selected
                      ? 'bg-sky-50/95 border-sky-400 ring-1 ring-sky-400/25'
                      : 'bg-[#F2F8FF] border-sky-200/70 hover:bg-[#E6F2FF]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-[#0F172A] truncate">
                      Kelas {item.kelas}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-sky-600 tabular-nums">
                      {item.total}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {tab === 'live'
                      ? item.maxNilai !== null
                        ? `Max ${item.maxNilai} · Min ${item.minNilai}`
                        : `${item.selesai} selesai`
                      : `${item.mengerjakan} ujian · ${item.selesai} selesai`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters & Mode Tampilan */}
      <div className="bg-white border border-sky-100 shadow-2xs rounded-2xl p-3 sm:p-3.5 flex flex-col lg:flex-row lg:items-center gap-2.5">
        <div className="grid grid-cols-2 sm:inline-flex bg-[#F2F8FF] p-1 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('per_kelas')}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'per_kelas'
                ? 'bg-white text-[#0F172A] shadow-2xs'
                : 'text-slate-600 hover:text-[#0F172A]'
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
                ? 'bg-white text-[#0F172A] shadow-2xs'
                : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Semua</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 flex-1 gap-2.5">
          <select
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
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
            className="min-h-[40px] px-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          >
            <option value="">Semua Status</option>
            <option value="Sedang Mengerjakan">Sedang Mengerjakan</option>
            <option value="Selesai">Selesai</option>
            <option value="Belum Mulai">Belum Mulai</option>
          </select>
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Cari nama siswa..."
              className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-sky-200/80 bg-[#F4F9FF] focus:bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Mode Per Kelas */}
      {isPerKelasMode ? (
        <div className="space-y-3.5">
          {groupedFilteredRows.map((grp) => {
            const isCollapsed = collapsedKelas.has(grp.kelasName);
            return (
              <div
                key={grp.kelasName}
                className="bg-white border border-sky-100 shadow-2xs rounded-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleKelasCollapse(grp.kelasName)}
                  className="w-full px-4 py-3 bg-[#F2F8FF] hover:bg-[#E6F2FF] border-b border-sky-100 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-sky-100/80 text-sky-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {grp.kelasName.slice(0, 3)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#0F172A]">Kelas {grp.kelasName}</div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-1.5">
                        <span>{grp.items.length} peserta</span>
                        {tab === 'pantau' ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-sky-600 font-semibold">{grp.online} online</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-600 font-semibold">
                              {grp.mengerjakan} mengerjakan
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-600 font-semibold">
                              {grp.selesai} selesai
                            </span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-600 font-semibold">
                              {grp.selesai} selesai
                            </span>
                            {grp.maxNilai !== null && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-slate-700 font-mono tabular-nums">
                                  Tertinggi {grp.maxNilai}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-slate-700 font-mono tabular-nums">
                                  Terendah {grp.minNilai}
                                </span>
                              </>
                            )}
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
                      {grp.items.map((r, idx) => renderMobileCard(r, idx))}
                    </div>

                    {/* Desktop Table per Class */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50/40 text-left text-xs text-slate-500 border-b border-slate-100">
                          <tr>
                            <th className="py-2.5 px-4 w-16">
                              {tab === 'live' ? 'Peringkat' : 'No'}
                            </th>
                            <th className="py-2.5 px-4">Nama Siswa</th>
                            <th className="py-2.5 px-4">Status</th>
                            {tab === 'live' && <th className="py-2.5 px-4">Waktu Kirim</th>}
                            <th className="py-2.5 px-4">Terjawab</th>
                            <th className="py-2.5 px-4">Sisa Waktu</th>
                            <th className="py-2.5 px-4">Skor B / S</th>
                            <th className="py-2.5 px-4">Nilai</th>
                            <th className="py-2.5 px-4">Tab</th>
                            {tab === 'pantau' && <th className="py-2.5 px-4 text-right">Aksi</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {renderTableRows(grp.items, false)}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {groupedFilteredRows.length === 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-sm text-slate-400">
              Tidak ada peserta yang cocok dengan filter.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Cards View (Semua) */}
          <div className="md:hidden space-y-2.5">
            {filteredRows.map((r, idx) => renderMobileCard(r, idx))}
            {filteredRows.length === 0 && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-sm text-slate-400">
                Tidak ada peserta yang cocok dengan filter.
              </div>
            )}
          </div>

          {/* Desktop Live Table (Semua) */}
          <div className="hidden md:block bg-white border border-slate-200/80 shadow-2xs rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 text-left text-xs text-slate-600 border-b border-slate-200/80">
                  <tr>
                    <th className="py-3 px-4 w-16">{tab === 'live' ? 'Peringkat' : 'No'}</th>
                    <th className="py-3 px-4">Nama Siswa</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4">Status</th>
                    {tab === 'live' && <th className="py-3 px-4">Waktu Kirim</th>}
                    <th className="py-3 px-4">Terjawab</th>
                    <th className="py-3 px-4">Sisa Waktu</th>
                    <th className="py-3 px-4">Skor B / S</th>
                    <th className="py-3 px-4">Nilai</th>
                    <th className="py-3 px-4">Tab</th>
                    {tab === 'pantau' && <th className="py-3 px-4 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {renderTableRows(filteredRows, true)}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={tab === 'pantau' ? 10 : 10}
                        className="py-8 text-center text-sm text-slate-400"
                      >
                        Tidak ada peserta yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
