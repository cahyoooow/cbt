import React, { useEffect, useState } from 'react';
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
  const [adminInitialized, setAdminInitialized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    if (role !== 'admin') return;
    let active = true;
    void (async () => {
      const st = await getAdminAuthStatus();
      if (active) setAdminInitialized(st.initialized);
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
    <div className="min-h-screen bg-[#f3f6fa] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm w-full max-w-md p-5 sm:p-6 border border-slate-200/80">
        {settings.logo && !logoFailed && (
          <img
            src={settings.logo}
            alt="Logo"
            referrerPolicy="no-referrer"
            onError={() => setLogoFailed(true)}
            className="mx-auto h-16 max-w-[50%] object-contain mb-2.5"
          />
        )}

        <h1 className="text-lg sm:text-xl font-bold text-center text-slate-800">{settings.judul}</h1>
        <p className="text-center text-xs sm:text-sm text-slate-500 mb-5">{settings.subjudul}</p>

        <div className="flex mb-4 rounded-xl overflow-hidden border border-slate-200/90 bg-slate-100/90 p-1">
          <button
            type="button"
            onClick={() => {
              setRole('siswa');
              setError('');
            }}
            className={`flex-1 min-h-[40px] py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              role === 'siswa'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Siswa
          </button>
          <button
            type="button"
            onClick={() => {
              setRole('admin');
              setError('');
            }}
            className={`flex-1 min-h-[40px] py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              role === 'admin'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Admin
          </button>
        </div>

        {role === 'siswa' ? (
          <form onSubmit={handleStudentSubmit} className="space-y-3">
            <input
              id="cbt-nama"
              type="text"
              required
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama lengkap"
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-colors"
            />
            <input
              id="cbt-token"
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="Token paket soal"
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-800 uppercase placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-colors"
            />

            {error && (
              <p className="text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-3 py-2 text-xs font-medium">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors cursor-pointer shadow-xs"
            >
              {loading ? 'Memeriksa...' : 'Masuk'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAdminSubmit} className="space-y-3">
            {adminInitialized === null ? (
              <div className="py-4 text-center text-xs text-slate-400">
                Memeriksa status akses admin...
              </div>
            ) : adminInitialized === false ? (
              <>
                <div className="rounded-xl bg-sky-50/80 border border-sky-200/70 px-3.5 py-2.5 text-xs text-sky-900">
                  Pengaturan awal: buat password admin pertama untuk mengunci dan mengelola portal CBT.
                </div>
                <input
                  id="cbt-admin-pw-new"
                  type="password"
                  required
                  value={adminPw}
                  onChange={(e) => setAdminPw(e.target.value)}
                  placeholder="Buat password admin (min. 3 karakter)"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-colors"
                />
                <input
                  id="cbt-admin-pw-confirm"
                  type="password"
                  required
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Ulangi password admin"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-colors"
                />
              </>
            ) : (
              <input
                id="cbt-admin-pw"
                type="password"
                required
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                placeholder="Password admin"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-colors"
              />
            )}

            {error && (
              <p className="text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-3 py-2 text-xs font-medium leading-relaxed">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || adminInitialized === null}
              className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors cursor-pointer shadow-xs"
            >
              {loading
                ? 'Memverifikasi...'
                : adminInitialized === false
                ? 'Simpan Password & Masuk'
                : 'Masuk'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
