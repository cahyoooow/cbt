/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, testConnection } from './firebase';
import {
  checkIsCurrentAdminSession,
  DEFAULT_PENGATURAN,
  getPengaturan,
  logoutAdminSession,
} from './services/cbtService';
import type { ActiveStudentSession, Pengaturan } from './types/cbt';
import { AdminDashboard } from './components/AdminDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { StudentExamFlow } from './components/StudentExamFlow';

export default function App() {
  const [settings, setSettings] = useState<Pengaturan>(DEFAULT_PENGATURAN);
  const [booting, setBooting] = useState(true);
  const [studentSession, setStudentSession] = useState<ActiveStudentSession | null>(null);
  const [adminActive, setAdminActive] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    window.setTimeout(() => {
      setToast((cur) => (cur?.msg === msg ? null : cur));
    }, type === 'ok' ? 3500 : 6000);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await testConnection();
      const cfg = await getPengaturan();
      if (mounted) {
        setSettings(cfg);
        document.title = cfg.judul || DEFAULT_PENGATURAN.judul;
      }
    })();

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;
      if (user) {
        const isAdm = await checkIsCurrentAdminSession(user);
        if (mounted) {
          setAdminActive(isAdm);
        }
      } else {
        setAdminActive(false);
      }
      if (mounted) setBooting(false);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const handleLogoutAdmin = async () => {
    await logoutAdminSession();
    setAdminActive(false);
  };

  return (
    <ErrorBoundary>
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl shadow-md text-white text-xs font-semibold flex items-center gap-2 max-w-[92vw] transition-all ${
            toast.type === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {toast.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {booting ? (
        <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-6 text-sm text-slate-500">
          Menghubungkan ke server CBT Firebase...
        </div>
      ) : adminActive ? (
        <AdminDashboard
          adminLabel="Administrator CBT"
          settings={settings}
          onSettingsUpdated={(cfg) => {
            setSettings(cfg);
            document.title = cfg.judul || DEFAULT_PENGATURAN.judul;
          }}
          onLogout={() => void handleLogoutAdmin()}
          onToast={showToast}
        />
      ) : studentSession ? (
        <StudentExamFlow
          session={studentSession}
          settings={settings}
          onExitToHome={() => setStudentSession(null)}
        />
      ) : (
        <LoginView
          settings={settings}
          onStudentSuccess={(sess) => setStudentSession(sess)}
          onAdminSuccess={() => setAdminActive(true)}
        />
      )}
    </ErrorBoundary>
  );
}
