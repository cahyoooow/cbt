import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  getAdminAuthStatus,
  loginAdminWithPassword,
  setupInitialAdminPassword,
  verifyStudentLogin,
} from '../services/cbtService';
import type { ActiveStudentSession, Pengaturan } from '../types/cbt';

interface LoginViewProps {
  settings: Pengaturan;
  onStudentSuccess: (session: ActiveStudentSession) => void;
  onAdminSuccess: () => void;
}

export function LoginView({ settings, onStudentSuccess, onAdminSuccess }: LoginViewProps) {
  const [role, setRole] = useState<'siswa' | 'admin'>('siswa');
  const [nama, setNama] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cbt_last_login') || '{}');
      return saved.nama || '';
    } catch {
      return '';
    }
  });
  const [token, setToken] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cbt_last_login') || '{}');
      return saved.token || '';
    } catch {
      return '';
    }
  });
  const [adminPw, setAdminPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [adminInitialized, setAdminInitialized] = useState<boolean | null>(null);
  const [adminStatusError, setAdminStatusError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoFailed, setLogoFailed] = useState(false);

  const checkAdminStatus = async () => {
    setAdminInitialized(null);
    setAdminStatusError('');
    const st = await getAdminAuthStatus();
    setAdminInitialized(st.initialized);
    if (st.error) setAdminStatusError(st.error);
  };

  useEffect(() => {
    if (role !== 'admin') return;
    let active = true;
    void (async () => {
      const st = await getAdminAuthStatus();
      if (!active) return;
      setAdminInitialized(st.initialized);
      setAdminStatusError(st.error || '');
    })();
    return () => {
      active = false;
    };
  }, [role]);

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await verifyStudentLogin(nama, token);
      if (!res.ok) {
        setError(res.msg);
        return;
      }
      try {
        localStorage.setItem(
          'cbt_last_login',
          JSON.stringify({ nama: res.session.siswa.nama_siswa, token: res.session.paket.token_paket_soal })
        );
      } catch {
        // ignore storage quota errors
      }
      onStudentSuccess(res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem ujian.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (adminInitialized === false) {
        if (adminPw.trim().length < 3) {
          setError('Password admin minimal 3 karakter.');
          return;
        }
        if (adminPw !== confirmPw) {
          setError('Konfirmasi password tidak cocok.');
          return;
        }
        await setupInitialAdminPassword(adminPw);
        setAdminInitialized(true);
      } else {
        await loginAdminWithPassword(adminPw);
      }
      onAdminSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk sebagai admin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F7FF] bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.16),_transparent_65%)] flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-[0_4px_16px_rgba(14,165,233,0.08)] w-full max-w-[440px] p-6 sm:p-7 border border-sky-100">
        <div className="flex flex-col items-center text-center mb-6">
          {settings.logo && !logoFailed ? (
            <img
              src={settings.logo}
              alt={`Logo ${settings.judul}`}
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="h-16 max-w-[55%] object-contain mb-3"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-sky-50 border border-sky-200/80 text-sky-500 flex items-center justify-center mb-3">
              <GraduationCap className="w-7 h-7" strokeWidth={1.75} />
            </div>
          )}

          <h1 className="text-lg sm:text-xl font-bold text-[#0F172A] text-balance leading-snug">
            {settings.judul}
          </h1>
          {settings.subjudul && (
            <p className="text-xs sm:text-sm text-slate-500 mt-1">{settings.subjudul}</p>
          )}
        </div>

        {/* Clean Role Switcher */}
        <div className="grid grid-cols-2 gap-1 mb-5 rounded-xl border border-sky-100 bg-[#F2F8FF] p-1">
          <button
            type="button"
            onClick={() => {
              setRole('siswa');
              setError('');
            }}
            className={`min-h-[42px] py-2 px-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer whitespace-nowrap ${
              role === 'siswa'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            <GraduationCap className="w-4 h-4 shrink-0" strokeWidth={1.9} />
            <span>Peserta Ujian</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRole('admin');
              setError('');
            }}
            className={`min-h-[42px] py-2 px-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer whitespace-nowrap ${
              role === 'admin'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={1.9} />
            <span>Admin</span>
          </button>
        </div>

        {role === 'siswa' ? (
          <form onSubmit={handleStudentSubmit} className="space-y-4">
            <div>
              <label htmlFor="cbt-nama" className="block text-xs font-semibold text-[#475569] mb-1.5">
                Nama Lengkap Siswa
              </label>
              <div className="relative">
                <User
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  strokeWidth={1.85}
                />
                <input
                  id="cbt-nama"
                  type="text"
                  required
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Ketik nama sesuai daftar hadir"
                  className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 rounded-xl border border-sky-200/80 bg-[#F4F9FF] text-sm text-[#0F172A] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="cbt-token" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Token Paket Ujian
              </label>
              <div className="relative">
                <KeyRound
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  strokeWidth={1.85}
                />
                <input
                  id="cbt-token"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  placeholder="Contoh: MTK123"
                  className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 rounded-xl border border-sky-200/80 bg-[#F4F9FF] font-mono text-sm text-[#0F172A] uppercase tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="text-rose-800 bg-rose-50 border border-rose-200/80 rounded-xl px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" strokeWidth={2} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white py-2.5 px-4 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs shadow-sky-500/20"
            >
              <span>{loading ? 'Memeriksa Data...' : 'Masuk Ruang Ujian'}</span>
              {!loading && <ArrowRight className="w-4 h-4" strokeWidth={2} />}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAdminSubmit} className="space-y-4">
            {adminInitialized === null ? (
              <div className="py-5 text-center text-xs text-slate-500">
                Memeriksa status akses admin...
              </div>
            ) : adminInitialized === false ? (
              <>
                <div className="rounded-xl bg-sky-50/90 border border-sky-200/80 px-3.5 py-2.5 text-xs text-sky-900 leading-relaxed">
                  Pengaturan awal: buat password admin pertama untuk mengunci dan mengelola portal CBT.
                </div>
                <div>
                  <label htmlFor="cbt-admin-pw-new" className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Buat Password Admin
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.85} />
                    <input
                      id="cbt-admin-pw-new"
                      type={showPw ? 'text' : 'password'}
                      required
                      value={adminPw}
                      onChange={(e) => setAdminPw(e.target.value)}
                      placeholder="Minimal 3 karakter"
                      className="w-full min-h-[46px] pl-10 pr-10 py-2.5 rounded-xl border border-sky-200/80 bg-[#F4F9FF] text-sm text-[#0F172A] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="cbt-admin-pw-confirm" className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Ulangi Password Admin
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.85} />
                    <input
                      id="cbt-admin-pw-confirm"
                      type={showPw ? 'text' : 'password'}
                      required
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      placeholder="Ketik ulang password"
                      className="w-full min-h-[46px] pl-10 pr-10 py-2.5 rounded-xl border border-sky-200/80 bg-[#F4F9FF] text-sm text-[#0F172A] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {adminStatusError && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200/80 px-3.5 py-2.5 text-xs text-amber-900 space-y-1.5">
                    <p className="leading-relaxed">{adminStatusError}</p>
                    <button
                      type="button"
                      onClick={() => void checkAdminStatus()}
                      className="font-semibold text-amber-800 underline hover:text-amber-950 cursor-pointer"
                    >
                      Coba periksa lagi
                    </button>
                  </div>
                )}
                <div>
                  <label htmlFor="cbt-admin-pw" className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Password Panel Admin
                  </label>
                  <div className="relative">
                    <Lock
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      strokeWidth={1.85}
                    />
                    <input
                      id="cbt-admin-pw"
                      type={showPw ? 'text' : 'password'}
                      required
                      value={adminPw}
                      onChange={(e) => setAdminPw(e.target.value)}
                      placeholder="Masukkan password admin"
                      className="w-full min-h-[46px] pl-10 pr-11 py-2.5 rounded-xl border border-sky-200/80 bg-[#F4F9FF] text-sm text-[#0F172A] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                    />
                    <button
                      type="button"
                      aria-label={showPw ? 'Sembunyikan password' : 'Lihat password'}
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="text-rose-800 bg-rose-50 border border-rose-200/80 rounded-xl px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" strokeWidth={2} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || adminInitialized === null}
              className="w-full min-h-[46px] bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white py-2.5 px-4 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs shadow-sky-500/20"
            >
              <span>
                {loading
                  ? 'Memverifikasi...'
                  : adminInitialized === false
                  ? 'Simpan Password & Masuk'
                  : 'Masuk Panel Admin'}
              </span>
              {!loading && <ArrowRight className="w-4 h-4" strokeWidth={2} />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
