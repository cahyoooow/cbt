import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  Flag,
  GraduationCap,
  Grid2X2,
  Home,
  KeyRound,
  Loader2,
  ScrollText,
  Send,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import {
  getQuestionsForStudent,
  logStudentViolation,
  markStudentExamStarted,
  saveStudentProgress,
  submitStudentExam,
} from '../services/cbtService';
import type {
  ActiveStudentSession,
  AnswerValue,
  ExamSubmitResult,
  Pengaturan,
  SoalPublik,
} from '../types/cbt';
import {
  formatSeconds,
  getActiveOptions,
  isQuestionAnswered,
  parseKategoriLabels,
  parseOptionValue,
} from '../utils/mathFormat';
import { CbtImage, ImageLightbox, RichText } from './RichText';

interface StudentExamFlowProps {
  session: ActiveStudentSession;
  settings: Pengaturan;
  onExitToHome: () => void;
}

type Stage = 'confirm' | 'tib' | 'exam' | 'done';

export function StudentExamFlow({ session, settings, onExitToHome }: StudentExamFlowProps) {
  const { siswa, paket, tib } = session;
  const storageKey = `cbt_prog_${paket.id}_${siswa.id}`;

  const [stage, setStage] = useState<Stage>('confirm');
  const [questions, setQuestions] = useState<SoalPublik[]>([]);
  const [loadingQs, setLoadingQs] = useState<boolean>(false);
  const [loadErr, setLoadErr] = useState('');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [ragu, setRagu] = useState<Record<string, boolean>>({});
  const [violCount, setViolCount] = useState(0);
  const [sisaDetik, setSisaDetik] = useState(paket.durasi_menit * 60);
  const [saveStatus, setSaveStatus] = useState<'Tersimpan' | 'Menyimpan...' | 'Offline'>('Tersimpan');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [violModal, setViolModal] = useState<number | null>(null);
  const [adminEndedMsg, setAdminEndedMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitRetryInfo, setSubmitRetryInfo] = useState('');
  const [submitResult, setSubmitResult] = useState<ExamSubmitResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState<{ url: string; alt: string } | null>(null);

  // Refs for latest state inside timers/event listeners
  const stateRef = useRef({
    answers,
    ragu,
    currentIndex,
    sisaDetik,
    violCount,
    active: false,
    submitting: false,
  });
  stateRef.current = {
    answers,
    ragu,
    currentIndex,
    sisaDetik,
    violCount,
    active: stage === 'exam' && !loadingQs && !adminEndedMsg,
    submitting,
  };

  const saveDebounceRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const savingInFlightRef = useRef(false);
  const lastSyncedDigestRef = useRef('');

  const persistLocal = useCallback(
    (nextAns: Record<string, AnswerValue>, nextRagu: Record<string, boolean>, idx: number, sisa: number, viol: number) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            answers: nextAns,
            ragu: nextRagu,
            currentIndex: idx,
            sisaDetik: sisa,
            violCount: viol,
            ts: Date.now(),
          })
        );
      } catch {
        // ignore quota errors
      }
    },
    [storageKey]
  );

  const flushSaveToServer = useCallback(
    async (force = false) => {
      const s = stateRef.current;
      if (!s.active || s.submitting || savingInFlightRef.current) return;
      const digest = JSON.stringify({
        a: s.answers,
        r: s.ragu,
        i: s.currentIndex,
        v: s.violCount,
      });
      if (!force && digest === lastSyncedDigestRef.current) return;

      savingInFlightRef.current = true;
      setSaveStatus('Menyimpan...');
      try {
        const ok = await saveStudentProgress({
          paket,
          siswa,
          jawaban: s.answers,
          ragu: s.ragu,
          currentIndex: s.currentIndex,
          sisaDetik: s.sisaDetik,
          pelanggaran: s.violCount,
        });
        if (!ok) {
          setAdminEndedMsg('Sesi ujian Anda telah dihentikan atau direset oleh pengawas/admin.');
          return;
        }
        lastSyncedDigestRef.current = digest;
        setSaveStatus('Tersimpan');
      } catch {
        setSaveStatus('Offline');
      } finally {
        savingInFlightRef.current = false;
      }
    },
    [paket, siswa]
  );

  const scheduleSave = useCallback(
    (
      nextAns: Record<string, AnswerValue>,
      nextRagu: Record<string, boolean>,
      idx: number,
      sisa: number,
      viol: number
    ) => {
      persistLocal(nextAns, nextRagu, idx, sisa, viol);
      if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
      const jitter = Math.floor(Math.random() * 800);
      saveDebounceRef.current = window.setTimeout(() => {
        void flushSaveToServer(false);
      }, 2500 + jitter);
    },
    [flushSaveToServer, persistLocal]
  );

  const beginExam = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setLoadingQs(true);
    setLoadErr('');
    try {
      await markStudentExamStarted(paket, siswa);
      const qs = await getQuestionsForStudent(paket, siswa.nama_key);
      setQuestions(qs);

      let initialAns: Record<string, AnswerValue> = {};
      let initialRagu: Record<string, boolean> = {};
      let initialIdx = 0;
      let initialSisa = paket.durasi_menit * 60;
      let initialViol = 0;

      if (session.resume) {
        let localData: {
          answers?: Record<string, AnswerValue>;
          ragu?: Record<string, boolean>;
          currentIndex?: number;
          sisaDetik?: number;
          violCount?: number;
          ts?: number;
        } | null = null;
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) localData = JSON.parse(raw);
        } catch {
          localData = null;
        }

        const srv = session.progres;
        if (srv && (!localData || !localData.ts || (srv.sisa_detik <= (localData.sisaDetik ?? Infinity)))) {
          initialAns = srv.jawaban || {};
          initialRagu = srv.ragu || {};
          initialIdx = Math.min(qs.length - 1, Math.max(0, srv.current_index || 0));
          initialSisa = srv.sisa_detik > 0 ? srv.sisa_detik : paket.durasi_menit * 60;
          initialViol = srv.pelanggaran || 0;
        } else if (localData) {
          initialAns = localData.answers || {};
          initialRagu = localData.ragu || {};
          initialIdx = Math.min(qs.length - 1, Math.max(0, localData.currentIndex || 0));
          initialSisa = localData.sisaDetik && localData.sisaDetik > 0 ? localData.sisaDetik : paket.durasi_menit * 60;
          initialViol = localData.violCount || 0;
        }
      } else {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
      }

      setAnswers(initialAns);
      setRagu(initialRagu);
      setCurrentIndex(initialIdx);
      setSisaDetik(initialSisa);
      setViolCount(initialViol);
      setStage('exam');

      // Initial progress record so admin Monitor sees student immediately
      await saveStudentProgress({
        paket,
        siswa: { ...siswa, status_ujian: `Sedang Ujian: ${paket.nama_paket_soal}` },
        jawaban: initialAns,
        ragu: initialRagu,
        currentIndex: initialIdx,
        sisaDetik: initialSisa,
        pelanggaran: initialViol,
      });
    } catch (err) {
      startedRef.current = false;
      setLoadErr(err instanceof Error ? err.message : 'Gagal memuat soal ujian.');
      setStage('tib');
    } finally {
      setLoadingQs(false);
    }
  }, [paket, session.progres, session.resume, siswa, storageKey]);

  const handleSubmitExam = useCallback(
    async (autoTimeOut = false) => {
      if (stateRef.current.submitting) return;
      setSubmitting(true);
      setLoadErr('');
      setSubmitRetryInfo('');
      setConfirmOpen(true);
      if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);

      try {
        // When timer expires for all students simultaneously, stagger requests across ~3.5s
        // so 85 submissions don't collide at the exact same millisecond.
        if (autoTimeOut) {
          const staggerMs = 400 + Math.floor(Math.random() * 3200);
          await new Promise((resolve) => window.setTimeout(resolve, staggerMs));
        }

        const result = await submitStudentExam({
          paket,
          siswa,
          questions,
          jawaban: stateRef.current.answers,
          pelanggaran: stateRef.current.violCount,
          onRetry: (attempt, maxTry) => {
            setSubmitRetryInfo(
              `Jaringan/server sedang padat, otomatis mencoba mengirim ulang (${attempt}/${maxTry - 1})...`
            );
          },
        });
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
        setConfirmOpen(false);
        setSubmitRetryInfo('');
        setSubmitResult(result);
        setStage('done');
      } catch (err) {
        setSubmitting(false);
        setSubmitRetryInfo('');
        setConfirmOpen(true);
        setLoadErr(
          err instanceof Error
            ? `${err.message} Jawaban Anda tetap tersimpan aman di perangkat ini—silakan klik Kirim Ulang.`
            : 'Gagal mengirim jawaban karena koneksi sibuk. Jawaban tetap aman di perangkat, silakan klik Kirim Ulang.'
        );
      }
    },
    [paket, questions, siswa, storageKey]
  );

  // Countdown Timer (1s) + Periodic Heartbeat Sync (~40-48s with jitter)
  useEffect(() => {
    if (stage !== 'exam' || loadingQs || adminEndedMsg) return;

    const timerId = window.setInterval(() => {
      setSisaDetik((prev) => {
        if (prev <= 1) {
          window.clearInterval(timerId);
          void handleSubmitExam(true);
          return 0;
        }
        const next = prev - 1;
        if (next % 5 === 0) {
          persistLocal(
            stateRef.current.answers,
            stateRef.current.ragu,
            stateRef.current.currentIndex,
            next,
            stateRef.current.violCount
          );
        }
        return next;
      });
    }, 1000);

    const syncIntervalMs = 40000 + Math.floor(Math.random() * 8000);
    const syncId = window.setInterval(() => {
      void flushSaveToServer(true);
    }, syncIntervalMs);

    return () => {
      window.clearInterval(timerId);
      window.clearInterval(syncId);
    };
  }, [adminEndedMsg, flushSaveToServer, handleSubmitExam, loadingQs, persistLocal, stage]);

  // Anti-Cheat: Visibility Change + Context Menu + Copy/Paste + DevTools Keys
  useEffect(() => {
    if (stage !== 'exam' || loadingQs || adminEndedMsg) return;

    const onVisChange = () => {
      if (document.hidden && stateRef.current.active && !stateRef.current.submitting) {
        const nextViol = stateRef.current.violCount + 1;
        setViolCount(nextViol);
        setViolModal(nextViol);
        persistLocal(
          stateRef.current.answers,
          stateRef.current.ragu,
          stateRef.current.currentIndex,
          stateRef.current.sisaDetik,
          nextViol
        );
        void flushSaveToServer();
        void logStudentViolation({
          siswa,
          paket,
          jenis: 'Pindah Tab/Window',
        });
      }
    };

    const preventEvent = (e: Event) => {
      if (stateRef.current.active) e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!stateRef.current.active) return;
      const k = e.key.toLowerCase();
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
        (e.ctrlKey && ['u', 's', 'p', 'c', 'v', 'x'].includes(k))
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('visibilitychange', onVisChange);
    document.addEventListener('contextmenu', preventEvent);
    document.addEventListener('copy', preventEvent);
    document.addEventListener('cut', preventEvent);
    document.addEventListener('paste', preventEvent);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      document.removeEventListener('contextmenu', preventEvent);
      document.removeEventListener('copy', preventEvent);
      document.removeEventListener('cut', preventEvent);
      document.removeEventListener('paste', preventEvent);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [adminEndedMsg, flushSaveToServer, loadingQs, paket, persistLocal, siswa, stage]);

  const currentQuestion = questions[currentIndex];
  const answeredCount = useMemo(
    () => questions.filter((q) => isQuestionAnswered(q, answers[q.id_soal])).length,
    [answers, questions]
  );
  const raguCount = useMemo(
    () => questions.filter((q) => ragu[q.id_soal]).length,
    [questions, ragu]
  );

  const updateAnswer = (qId: string, val: AnswerValue) => {
    const next = { ...answers, [qId]: val };
    setAnswers(next);
    scheduleSave(next, ragu, currentIndex, sisaDetik, violCount);
  };

  const toggleRagu = () => {
    if (!currentQuestion) return;
    const next = { ...ragu, [currentQuestion.id_soal]: !ragu[currentQuestion.id_soal] };
    setRagu(next);
    scheduleSave(answers, next, currentIndex, sisaDetik, violCount);
  };

  const goToIndex = (idx: number) => {
    if (idx < 0 || idx >= questions.length) return;
    setCurrentIndex(idx);
    setDrawerOpen(false);
    persistLocal(answers, ragu, idx, sisaDetik, violCount);
  };

  // ===== STAGE 0: KONFIRMASI IDENTITAS UJIAN =====
  if (stage === 'confirm') {
    return (
      <div className="min-h-screen bg-[#F0F7FF] flex items-center justify-center p-4 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.16),transparent_70%)]"
        />
        <div className="relative bg-white border border-sky-100 rounded-2xl shadow-[0_4px_16px_rgba(14,165,233,0.08)] w-full max-w-md p-6 sm:p-7">
          {settings.logo ? (
            <img
              src={settings.logo}
              alt="Logo Sekolah"
              referrerPolicy="no-referrer"
              className="mx-auto h-16 max-w-[50%] object-contain mb-3"
            />
          ) : (
            <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-50 border border-sky-200/80 text-sky-600 flex items-center justify-center mb-3">
              <GraduationCap className="w-6 h-6" strokeWidth={1.75} />
            </div>
          )}
          <h1 className="text-lg font-bold text-center text-[#0F172A]">Konfirmasi Identitas Ujian</h1>
          <p className="text-center text-xs text-slate-500 mt-1 mb-5">
            Periksa kembali data peserta dan paket ujian sebelum melanjutkan.
          </p>

          <div className="border border-sky-100 rounded-xl divide-y divide-sky-100/70 text-sm mb-5 bg-[#F2F8FF]/80">
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-slate-500 inline-flex items-center gap-2 shrink-0">
                <User className="w-3.5 h-3.5 text-sky-600" strokeWidth={1.75} />
                Nama Peserta
              </span>
              <span className="font-semibold text-[#0F172A] text-right truncate">{siswa.nama_siswa}</span>
            </div>
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-slate-500 inline-flex items-center gap-2 shrink-0">
                <GraduationCap className="w-3.5 h-3.5 text-sky-600" strokeWidth={1.75} />
                Kelas
              </span>
              <span className="font-semibold text-[#0F172A] text-right">{siswa.kelas}</span>
            </div>
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-slate-500 inline-flex items-center gap-2 shrink-0">
                <BookOpen className="w-3.5 h-3.5 text-sky-600" strokeWidth={1.75} />
                Paket Soal
              </span>
              <span className="font-semibold text-[#0F172A] text-right truncate">{paket.nama_paket_soal}</span>
            </div>
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-slate-500 inline-flex items-center gap-2 shrink-0">
                <BookOpenCheck className="w-3.5 h-3.5 text-sky-600" strokeWidth={1.75} />
                Mata Pelajaran
              </span>
              <span className="font-medium text-slate-700 text-right truncate">{paket.mata_pelajaran}</span>
            </div>
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-slate-500 inline-flex items-center gap-2 shrink-0">
                <KeyRound className="w-3.5 h-3.5 text-sky-600" strokeWidth={1.75} />
                Token
              </span>
              <span className="font-mono font-bold text-sky-600 tracking-wider text-right">
                {paket.token_paket_soal}
              </span>
            </div>
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-slate-500 inline-flex items-center gap-2 shrink-0">
                <Clock className="w-3.5 h-3.5 text-sky-600" strokeWidth={1.75} />
                Durasi Ujian
              </span>
              <span className="font-mono tabular-nums font-medium text-slate-700 text-right">
                {paket.durasi_menit} Menit
              </span>
            </div>
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-slate-500 inline-flex items-center gap-2 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-600" strokeWidth={1.75} />
                Status Sesi
              </span>
              <span className="font-medium text-slate-700 text-right">
                {session.resume ? 'Melanjutkan sesi tersimpan' : 'Ujian baru'}
              </span>
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onExitToHome}
              className="flex-1 min-h-[44px] bg-slate-100 hover:bg-slate-200/80 text-slate-700 py-2 rounded-xl font-semibold text-sm transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => setStage('tib')}
              className="flex-1 min-h-[44px] bg-sky-500 hover:bg-sky-600 text-white py-2 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs shadow-sky-500/20"
            >
              <span>Lanjut</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== STAGE 1: TATA TERTIB =====
  if (stage === 'tib') {
    return (
      <div className="min-h-screen bg-[#F0F7FF] flex items-center justify-center p-4 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.16),transparent_70%)]"
        />
        <div className="relative bg-white border border-sky-100 rounded-2xl shadow-[0_4px_16px_rgba(14,165,233,0.08)] w-full max-w-xl p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-sky-100 pb-4 mb-5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-600 flex items-center justify-center shrink-0">
                <ScrollText className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-[#0F172A]">Tata Tertib Ujian</h1>
                <p className="text-xs sm:text-sm text-slate-500 truncate">
                  {paket.nama_paket_soal} · {paket.mata_pelajaran} ·{' '}
                  <span className="font-mono tabular-nums">{paket.durasi_menit} menit</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStage('confirm')}
              className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-[#0F172A] hover:bg-sky-50 whitespace-nowrap transition-colors cursor-pointer"
            >
              Kembali
            </button>
          </div>

          <ol className="space-y-2.5 text-sm text-slate-700 mb-6 leading-relaxed">
            {tib.map((item, idx) => (
              <li key={item.id} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-50 border border-sky-200/80 text-sky-700 text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                  {idx + 1}
                </span>
                <span className="pt-0.5">{item.teks}</span>
              </li>
            ))}
          </ol>

          {loadErr && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{loadErr}</span>
            </div>
          )}

          <button
            type="button"
            disabled={loadingQs}
            onClick={() => void beginExam()}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs shadow-sky-500/20"
          >
            {loadingQs ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyiapkan Soal...</span>
              </>
            ) : (
              <>
                <BookOpenCheck className="w-4 h-4" />
                <span>{session.resume ? 'Lanjutkan Mengerjakan' : 'Mulai Mengerjakan'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ===== STAGE 3: SELESAI & PEMBAHASAN =====
  if (stage === 'done' && submitResult) {
    return (
      <div className="min-h-screen bg-[#F0F7FF] flex items-center justify-center p-4 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.16),transparent_70%)]"
        />
        <div className="relative bg-white border border-sky-100 rounded-2xl shadow-[0_4px_16px_rgba(14,165,233,0.08)] w-full max-w-md p-6 sm:p-7 text-center">
          {settings.logo && (
            <img
              src={settings.logo}
              alt="Logo Sekolah"
              referrerPolicy="no-referrer"
              className="mx-auto h-14 max-w-[50%] object-contain mb-3"
            />
          )}
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200/70 text-emerald-700 flex items-center justify-center mb-3">
            {submitResult.tampilkan_nilai ? (
              <Award className="w-7 h-7" strokeWidth={1.75} />
            ) : (
              <CheckCircle2 className="w-7 h-7" strokeWidth={1.75} />
            )}
          </div>
          <h1 className="text-lg font-bold text-[#0F172A]">Ujian Selesai</h1>
          <p className="text-sm text-slate-500 mt-1">
            Jawaban Anda untuk <strong className="text-[#0F172A]">{paket.nama_paket_soal}</strong> telah tersimpan.
          </p>

          <div className="mt-4 py-4 px-5 rounded-xl bg-[#F2F8FF] border border-[#CDE3F9]">
            <div className="text-xs text-slate-500">
              {siswa.nama_siswa} · Kelas {siswa.kelas}
            </div>
            {submitResult.tampilkan_nilai ? (
              <>
                <div className="text-5xl font-bold text-emerald-700 font-mono tabular-nums my-3">
                  {submitResult.nilai}
                </div>
                <div className="text-xs text-slate-600 font-mono tabular-nums">
                  Skor Benar: {submitResult.benar} · Skor Salah: {submitResult.salah}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-700 mt-3 font-medium">
                Nilai akan diumumkan dan direkap oleh guru mata pelajaran.
              </p>
            )}
          </div>

          <div className="flex gap-2.5 mt-6">
            {submitResult.tampilkan_nilai && submitResult.rev.length > 0 && (
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <BookOpenCheck className="w-4 h-4" />
                <span>Lihat Pembahasan</span>
              </button>
            )}
            <button
              type="button"
              onClick={onExitToHome}
              className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl border border-sky-200/80 bg-white hover:bg-[#F2F8FF] text-slate-700 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Beranda</span>
            </button>
          </div>
        </div>

        {/* Pembahasan Modal */}
        {reviewOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
            <div className="bg-white border border-sky-100 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-xl">
              <div className="px-5 py-4 border-b border-sky-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0F172A]">Pembahasan Soal</h2>
                  <p className="text-xs text-slate-500">
                    {paket.nama_paket_soal} · Nilai: {submitResult.nilai}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-sky-50 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto space-y-3">
                {submitResult.rev.map((r) => (
                  <div
                    key={r.id_soal}
                    className={`rounded-xl border p-4 ${
                      r.benar
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : r.skor > 0
                        ? 'bg-amber-50/60 border-amber-200'
                        : 'bg-rose-50/60 border-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                      <span className="text-[#0F172A]">
                        Soal No. {r.no} · {r.benar ? 'Benar' : r.skor > 0 ? 'Sebagian Benar' : 'Salah'}
                      </span>
                      <span className="font-mono tabular-nums text-slate-700">
                        Skor {r.skor} / {r.maks}
                      </span>
                    </div>
                    <RichText text={r.soal} className="text-sm text-slate-800 mb-2" />
                    <div className="text-xs text-slate-700 space-y-1">
                      <div>
                        Jawabanmu: <strong>{r.jawab || '-'}</strong> · Kunci: <strong>{r.kunci}</strong>
                      </div>
                      {r.pembahasan && (
                        <div className="pt-1 text-slate-600">
                          <span className="font-semibold text-slate-700">Pembahasan: </span>
                          <RichText text={r.pembahasan} className="inline text-xs" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-slate-200/80 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== STAGE 2: ACTIVE EXAM WORKSPACE =====
  const baseType = currentQuestion ? String(currentQuestion.jenis_soal || 'PG').split(':')[0] : 'PG';
  const activeOptions = currentQuestion ? getActiveOptions(currentQuestion) : [];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id_soal] : undefined;
  const kategoriLabels = currentQuestion ? parseKategoriLabels(currentQuestion.jenis_soal) : ['Benar', 'Salah'];

  const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#F0F7FF] flex flex-col exam-nosel">
      {/* Compact Sticky Exam Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-sky-100 relative">
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-sm sm:text-base text-[#0F172A] truncate">
              {paket.nama_paket_soal}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {siswa.nama_siswa} · Kelas {siswa.kelas}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium ${
                saveStatus === 'Offline'
                  ? 'text-rose-700'
                  : saveStatus === 'Menyimpan...'
                  ? 'text-sky-600'
                  : 'text-slate-500'
              }`}
            >
              {saveStatus === 'Menyimpan...' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saveStatus === 'Offline' ? (
                <CloudOff className="w-3.5 h-3.5" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-sky-500" />
              )}
              <span>{saveStatus}</span>
            </span>

            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              className="lg:hidden px-3 py-1.5 rounded-xl border border-sky-200/80 bg-white hover:bg-[#F2F8FF] text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Grid2X2 className="w-3.5 h-3.5 text-sky-600" />
              <span>
                Soal ({answeredCount}/{questions.length})
              </span>
            </button>

            <div
              className={`px-3 py-1.5 rounded-xl font-mono tabular-nums text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                sisaDetik <= 300 ? 'bg-rose-600 text-white' : 'bg-sky-600 text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatSeconds(sisaDetik)}</span>
            </div>
          </div>
        </div>
        <div className="h-[3px] w-full bg-sky-100" aria-hidden="true">
          <div
            className="h-full bg-sky-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {loadingQs ? (
        <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-500 gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
          <span>Memuat butir soal ujian...</span>
        </div>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 grid lg:grid-cols-12 gap-5 items-start">
          {/* Question Stage */}
          <section className="lg:col-span-8 xl:col-span-9 bg-white border border-sky-100 rounded-2xl shadow-2xs flex flex-col">
            {currentQuestion && (
              <>
                <div className="px-5 py-3.5 border-b border-sky-100/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-[#0F172A] font-mono tabular-nums">
                      Soal {currentIndex + 1} / {questions.length}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs text-slate-500">
                      {baseType === 'PGK MCMA'
                        ? 'Pilihan Ganda Kompleks (Pilih lebih dari satu)'
                        : baseType === 'PGK Kategori'
                        ? `Kategori (${kategoriLabels[0]} / ${kategoriLabels[1]})`
                        : 'Pilihan Ganda'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    Bobot {currentQuestion.bobot}
                  </span>
                </div>

                <div className="p-5 sm:p-6 space-y-5">
                  {/* Stimulus */}
                  {(currentQuestion.teks_stimulus || currentQuestion.gambar_stimulus_url) && (
                    <div className="p-4 rounded-xl bg-[#F2F8FF] border border-[#CDE3F9] space-y-2">
                      {currentQuestion.teks_stimulus && (
                        <RichText
                          text={currentQuestion.teks_stimulus}
                          className="text-sm sm:text-[15px] text-slate-700 leading-relaxed"
                        />
                      )}
                      {currentQuestion.gambar_stimulus_url && (
                        <CbtImage
                          src={currentQuestion.gambar_stimulus_url}
                          alt={`Ilustrasi stimulus soal ${currentIndex + 1}`}
                          onZoom={(url, alt) => setZoomImage({ url, alt })}
                        />
                      )}
                    </div>
                  )}

                  {/* Pertanyaan */}
                  <div className="space-y-2">
                    <RichText
                      text={currentQuestion.teks_soal}
                      className="text-base sm:text-[17px] font-medium text-[#0F172A] leading-relaxed"
                    />
                    {currentQuestion.gambar_soal_url && (
                      <CbtImage
                        src={currentQuestion.gambar_soal_url}
                        alt={`Gambar soal ${currentIndex + 1}`}
                        onZoom={(url, alt) => setZoomImage({ url, alt })}
                      />
                    )}
                  </div>

                  {/* Interactive Answer Area */}
                  {baseType === 'PG' && (
                    <div className="space-y-2.5 pt-1">
                      {activeOptions.map((op) => {
                        const selected = String(currentAnswer || '') === op.key;
                        const parsed = parseOptionValue(op.value);
                        return (
                          <button
                            key={op.key}
                            type="button"
                            onClick={() => updateAnswer(currentQuestion.id_soal, op.key)}
                            className={`w-full text-left p-3.5 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                              selected
                                ? 'bg-sky-50/90 border-sky-500 text-[#0F172A]'
                                : 'bg-white border-slate-200 hover:border-sky-300 hover:bg-[#F2F8FF] text-slate-800'
                            }`}
                          >
                            <span
                              className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                selected
                                  ? 'bg-sky-500 text-white'
                                  : 'bg-[#F2F8FF] text-slate-700 border border-sky-200/80'
                              }`}
                            >
                              {op.key}
                            </span>
                            <div className="flex-1 min-w-0">
                              {parsed.text && <RichText text={parsed.text} className="text-sm sm:text-[15px]" />}
                              {parsed.imageUrl && (
                                <CbtImage
                                  src={parsed.imageUrl}
                                  alt={`Pilihan ${op.key}`}
                                  className="max-h-48"
                                  onZoom={(url, alt) => setZoomImage({ url, alt })}
                                />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {baseType === 'PGK MCMA' && (
                    <div className="space-y-2.5 pt-1">
                      {activeOptions.map((op) => {
                        const arr = Array.isArray(currentAnswer)
                          ? currentAnswer
                          : String(currentAnswer || '')
                              .split(',')
                              .filter(Boolean);
                        const checked = arr.includes(op.key);
                        const parsed = parseOptionValue(op.value);
                        const toggle = () => {
                          const nextSet = new Set(arr);
                          if (checked) nextSet.delete(op.key);
                          else nextSet.add(op.key);
                          updateAnswer(currentQuestion.id_soal, Array.from(nextSet).sort());
                        };
                        return (
                          <button
                            key={op.key}
                            type="button"
                            onClick={toggle}
                            className={`w-full text-left p-3.5 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                              checked
                                ? 'bg-sky-50/90 border-sky-500 text-[#0F172A]'
                                : 'bg-white border-slate-200 hover:border-sky-300 hover:bg-[#F2F8FF] text-slate-800'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                checked
                                  ? 'bg-sky-500 border-sky-500 text-white'
                                  : 'bg-white border-slate-300 text-transparent'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-500 mt-1 shrink-0">
                              {op.key}.
                            </span>
                            <div className="flex-1 min-w-0">
                              {parsed.text && <RichText text={parsed.text} className="text-sm sm:text-[15px]" />}
                              {parsed.imageUrl && (
                                <CbtImage
                                  src={parsed.imageUrl}
                                  alt={`Pilihan ${op.key}`}
                                  className="max-h-48"
                                  onZoom={(url, alt) => setZoomImage({ url, alt })}
                                />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {baseType === 'PGK Kategori' && (
                    <>
                      {/* Mobile Stacked Statements */}
                      <div className="sm:hidden space-y-3">
                        {activeOptions.map((op, idx) => {
                          const arr = Array.isArray(currentAnswer)
                            ? [...currentAnswer]
                            : activeOptions.map((_, i) => String(currentAnswer || '').split(',')[i] || '');
                          const val = arr[idx] || '';
                          const parsed = parseOptionValue(op.value);
                          const pickKategori = (choice: string) => {
                            const nextArr = activeOptions.map((_, i) => arr[i] || '');
                            nextArr[idx] = choice;
                            updateAnswer(currentQuestion.id_soal, nextArr);
                          };
                          return (
                            <div
                              key={op.key}
                              className="p-3.5 rounded-xl border border-sky-100 bg-[#F2F8FF]/70 space-y-2.5"
                            >
                              <div>
                                {parsed.text && <RichText text={parsed.text} className="text-sm text-[#0F172A]" />}
                                {parsed.imageUrl && (
                                  <CbtImage
                                    src={parsed.imageUrl}
                                    alt={`Pernyataan ${idx + 1}`}
                                    className="max-h-36 mt-1.5"
                                    onZoom={(url, alt) => setZoomImage({ url, alt })}
                                  />
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {kategoriLabels.map((lbl) => {
                                  const active = val === lbl;
                                  return (
                                    <button
                                      key={lbl}
                                      type="button"
                                      onClick={() => pickKategori(lbl)}
                                      className={`min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                                        active
                                          ? 'bg-sky-500 border-sky-500 text-white'
                                          : 'bg-white border-slate-200 text-slate-700 hover:bg-[#F2F8FF]'
                                      }`}
                                    >
                                      {lbl}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden sm:block border border-sky-100 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F2F8FF] border-b border-sky-100 text-left text-xs font-semibold text-slate-600">
                            <tr>
                              <th className="py-2.5 px-4">Pernyataan</th>
                              <th className="py-2.5 px-3 text-center w-28">{kategoriLabels[0]}</th>
                              <th className="py-2.5 px-3 text-center w-28">{kategoriLabels[1]}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-sky-100/70">
                            {activeOptions.map((op, idx) => {
                              const arr = Array.isArray(currentAnswer)
                                ? [...currentAnswer]
                                : activeOptions.map((_, i) => String(currentAnswer || '').split(',')[i] || '');
                              const val = arr[idx] || '';
                              const parsed = parseOptionValue(op.value);
                              const pickKategori = (choice: string) => {
                                const nextArr = activeOptions.map((_, i) => arr[i] || '');
                                nextArr[idx] = choice;
                                updateAnswer(currentQuestion.id_soal, nextArr);
                              };
                              return (
                                <tr key={op.key} className="bg-white">
                                  <td className="py-3 px-4">
                                    {parsed.text && <RichText text={parsed.text} className="text-sm" />}
                                    {parsed.imageUrl && (
                                      <CbtImage
                                        src={parsed.imageUrl}
                                        alt={`Pernyataan ${idx + 1}`}
                                        className="max-h-36"
                                        onZoom={(url, alt) => setZoomImage({ url, alt })}
                                      />
                                    )}
                                  </td>
                                  {kategoriLabels.map((lbl) => {
                                    const active = val === lbl;
                                    return (
                                      <td key={lbl} className="py-3 px-2 text-center">
                                        <button
                                          type="button"
                                          onClick={() => pickKategori(lbl)}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                                            active
                                              ? 'bg-sky-500 border-sky-500 text-white'
                                              : 'bg-white border-slate-200 text-slate-600 hover:bg-[#F2F8FF]'
                                          }`}
                                        >
                                          {lbl}
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>

                {/* Bottom Action Bar */}
                <div className="px-3.5 sm:px-5 py-3.5 border-t border-sky-100/80 grid grid-cols-3 sm:flex items-center justify-between gap-2 bg-[#F2F8FF]/70 rounded-b-2xl">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => goToIndex(currentIndex - 1)}
                    className="min-h-[44px] px-2.5 sm:px-4 py-2 rounded-xl border border-sky-200/80 bg-white text-slate-700 text-xs sm:text-sm font-semibold hover:bg-[#E6F2FF] disabled:opacity-40 inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 shrink-0" />
                    <span className="truncate">Sebelumnya</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleRagu}
                    className={`min-h-[44px] px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer border transition-colors ${
                      ragu[currentQuestion.id_soal]
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'bg-white border-amber-400 text-amber-700 hover:bg-amber-50'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="truncate">
                      {ragu[currentQuestion.id_soal] ? 'Ragu' : 'Ragu-Ragu'}
                    </span>
                  </button>

                  {currentIndex < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => goToIndex(currentIndex + 1)}
                      className="min-h-[44px] px-2.5 sm:px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                    >
                      <span className="truncate">Selanjutnya</span>
                      <ChevronRight className="w-4 h-4 shrink-0" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      className="min-h-[44px] px-2.5 sm:px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                    >
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                      <span className="truncate">Selesai</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Question Navigator Sidebar (Desktop & Mobile Drawer) */}
          <aside
            className={`${
              drawerOpen ? 'fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] flex justify-end lg:static lg:bg-transparent' : 'hidden lg:block'
            } lg:col-span-4 xl:col-span-3`}
            onClick={() => setDrawerOpen(false)}
          >
            <div
              className="w-80 max-w-full lg:w-full bg-white border border-sky-100 rounded-none lg:rounded-2xl shadow-2xs p-5 h-full lg:h-auto overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-sm text-[#0F172A] inline-flex items-center gap-2">
                  <Grid2X2 className="w-4 h-4 text-sky-600" strokeWidth={1.75} />
                  <span>Penjelajah Soal</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="lg:hidden p-1 text-slate-500 hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-500 mb-3 font-mono tabular-nums">
                Terjawab {answeredCount} / {questions.length} · Ragu {raguCount}
              </div>

              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isRagu = !!ragu[q.id_soal];
                  const isDone = isQuestionAnswered(q, answers[q.id_soal]);
                  let cls = 'bg-[#F2F8FF] text-slate-700 border-sky-200/80 hover:bg-[#E6F2FF]';
                  if (isRagu) cls = 'bg-amber-400 text-slate-950 border-amber-500';
                  else if (isDone) cls = 'bg-sky-500 text-white border-sky-500';

                  return (
                    <button
                      key={q.id_soal}
                      type="button"
                      onClick={() => goToIndex(idx)}
                      className={`h-10 rounded-xl border font-mono tabular-nums text-xs font-bold transition-colors cursor-pointer ${cls} ${
                        isCurrent ? 'ring-2 ring-[#0F172A] ring-offset-1' : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-sky-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded bg-[#F2F8FF] border border-sky-200 inline-block" />
                  <span>Belum dijawab</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded bg-sky-500 inline-block" />
                  <span>Sudah dijawab</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded bg-amber-400 inline-block" />
                  <span>Ragu-ragu</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="w-full mt-5 min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Kirim &amp; Selesai
              </button>
            </div>
          </aside>
        </main>
      )}

      {/* Confirm Submit Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-sky-100 rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#0F172A]">
              {submitting ? 'Mengirim Jawaban Ujian...' : 'Kirim Jawaban Ujian?'}
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              Terjawab <strong className="font-mono tabular-nums">{answeredCount}</strong> dari{' '}
              <strong className="font-mono tabular-nums">{questions.length}</strong> soal. Ditandai ragu-ragu:{' '}
              <strong className="font-mono tabular-nums">{raguCount}</strong>.
            </p>
            {submitRetryInfo && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">
                {submitRetryInfo}
              </p>
            )}
            {loadErr && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mt-3">
                {loadErr}
              </p>
            )}
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                disabled={submitting || sisaDetik <= 0}
                onClick={() => {
                  setLoadErr('');
                  setConfirmOpen(false);
                }}
                className="flex-1 min-h-[42px] py-2 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmitExam(false)}
                className="flex-1 min-h-[42px] py-2 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                {submitting ? 'Mengirim...' : loadErr ? 'Kirim Ulang' : 'Ya, Kirim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Switch Violation Warning */}
      {violModal !== null && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-rose-200 rounded-2xl w-full max-w-md p-6 text-center shadow-xl">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-rose-700">Peringatan Pelanggaran</h3>
            <p className="text-sm text-slate-600 mt-2">
              Anda terdeteksi berpindah tab atau jendela browser. Pelanggaran ke-
              <strong className="font-mono tabular-nums">{violModal}</strong> telah dicatat dan
              dilaporkan ke pengawas.
            </p>
            <button
              type="button"
              onClick={() => setViolModal(null)}
              className="mt-5 min-h-[42px] px-6 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-semibold cursor-pointer transition-colors"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

      {/* Ended / Reset by Admin Modal */}
      {adminEndedMsg && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-sky-100 rounded-2xl w-full max-w-md p-6 text-center shadow-xl">
            <h3 className="text-lg font-bold text-[#0F172A]">Sesi Ujian Dihentikan</h3>
            <p className="text-sm text-slate-600 mt-2">{adminEndedMsg}</p>
            <button
              type="button"
              onClick={onExitToHome}
              className="mt-5 min-h-[42px] px-6 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      )}

      <ImageLightbox image={zoomImage} onClose={() => setZoomImage(null)} />
    </div>
  );
}
