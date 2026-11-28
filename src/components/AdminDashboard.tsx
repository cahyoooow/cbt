import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ChevronRight,
  ClipboardList,
  FileBarChart2,
  Gauge,
  KeyRound,
  Layers,
  ListChecks,
  LogOut,
  Menu,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  Table2,
  Trophy,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import {
  invalidateAdminCaches,
  listAdminPassLabels,
  listHasil,
  listPaket,
  listPelanggaran,
  listSiswa,
  listSoalLengkap,
  getTataTertib,
} from '../services/cbtService';
import type {
  AdminPassLabel,
  AdminTab,
  HasilUjian,
  LogPelanggaran,
  PaketUjian,
  Pengaturan,
  Siswa,
  SoalLengkap,
  TataTertib,
} from '../types/cbt';
import { AdminAnalisisAndLaporan } from './admin/AdminAnalisisAndLaporan';
import { AdminAnalisisTka } from './admin/AdminAnalisisTka';
import { AdminBankSoal } from './admin/AdminBankSoal';
import { AdminMonitorAndLive } from './admin/AdminMonitorAndLive';
import { AdminOverviewAndPakets } from './admin/AdminOverviewAndPakets';
import { AdminSettingsAndMigration } from './admin/AdminSettingsAndMigration';
import { AdminSiswaAndUjian } from './admin/AdminSiswaAndUjian';

interface AdminDashboardProps {
  adminLabel: string;
  settings: Pengaturan;
  onSettingsUpdated: (cfg: Pengaturan) => void;
  onLogout: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

interface MenuItem {
  id: AdminTab;
  label: string;
  group: 'Utama' | 'Peserta & Pantau' | 'Laporan & TKA' | 'Sistem';
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'dash', label: 'Dashboard', group: 'Utama', icon: Gauge },
  { id: 'paket', label: 'Daftar Ujian', group: 'Utama', icon: ListChecks },
  { id: 'soal', label: 'Bank Soal', group: 'Utama', icon: BookOpen },
  { id: 'siswa', label: 'Kelola Siswa', group: 'Peserta & Pantau', icon: Users },
  { id: 'ujian', label: 'Kelola Ujian', group: 'Peserta & Pantau', icon: UserCog },
  { id: 'pantau', label: 'Monitor Ujian', group: 'Peserta & Pantau', icon: Radio },
  { id: 'live', label: 'Live Score', group: 'Peserta & Pantau', icon: Trophy },
  { id: 'jwb', label: 'Kelola Jawaban', group: 'Laporan & TKA', icon: ClipboardList },
  { id: 'hasil', label: 'Rekap Nilai', group: 'Laporan & TKA', icon: FileBarChart2 },
  { id: 'matriks', label: 'Matriks Jawaban', group: 'Laporan & TKA', icon: Table2 },
  { id: 'butir', label: 'Analisis Butir', group: 'Laporan & TKA', icon: BarChart3 },
  { id: 'tka', label: 'Analisis Materi TKA', group: 'Laporan & TKA', icon: Layers },
  { id: 'pelanggaran', label: 'Pelanggaran', group: 'Laporan & TKA', icon: AlertTriangle },
  { id: 'akun', label: 'Password & Tata Tertib', group: 'Sistem', icon: KeyRound },
  { id: 'set', label: 'Pengaturan & Koneksi', group: 'Sistem', icon: Settings },
];

const MENU_GROUPS: MenuItem['group'][] = [
  'Utama',
  'Peserta & Pantau',
  'Laporan & TKA',
  'Sistem',
];

export function AdminDashboard({
  adminLabel,
  settings,
  onSettingsUpdated,
  onLogout,
  onToast,
}: AdminDashboardProps) {
  const [tab, setTab] = useState<AdminTab>('dash');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [pakets, setPakets] = useState<PaketUjian[]>([]);
  const [soals, setSoals] = useState<SoalLengkap[]>([]);
  const [siswas, setSiswas] = useState<Siswa[]>([]);
  const [hasils, setHasils] = useState<HasilUjian[]>([]);
  const [pelanggarans, setPelanggarans] = useState<LogPelanggaran[]>([]);
  const [passLabels, setPassLabels] = useState<AdminPassLabel[]>([]);
  const [tibs, setTibs] = useState<TataTertib[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    invalidateAdminCaches();
    try {
      const [pk, sl, sw, hs, pl, passes, tb] = await Promise.all([
        listPaket(),
        listSoalLengkap(),
        listSiswa(),
        listHasil(),
        listPelanggaran(),
        listAdminPassLabels(),
        getTataTertib(),
      ]);
      setPakets(pk);
      setSoals(sl);
      setSiswas(sw);
      setHasils(hs);
      setPelanggarans(pl);
      setPassLabels(passes);
      setTibs(tb);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat data admin.', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeItem = useMemo(
    () => MENU_ITEMS.find((m) => m.id === tab) || MENU_ITEMS[0],
    [tab]
  );
  const ActiveIcon = activeItem.icon;

  const selectTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    setMobileMenuOpen(false);
  };

  const renderMenuList = (isMobile: boolean) => (
    <div className="space-y-4 py-1">
      {MENU_GROUPS.map((group) => {
        const items = MENU_ITEMS.filter((m) => m.group === group);
        return (
          <div key={group} className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold text-[#64748B] tracking-wide">
              {group}
            </div>
            {items.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`w-full px-2.5 ${
                    isMobile ? 'min-h-[44px]' : 'py-2'
                  } rounded-xl text-[13px] font-medium flex items-center justify-between gap-2.5 transition-all duration-150 cursor-pointer group ${
                    active
                      ? 'bg-sky-50/95 text-sky-900 font-semibold ring-1 ring-sky-400/25'
                      : 'text-[#475569] hover:bg-[#F2F8FF] hover:text-[#0F172A]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        active
                          ? 'bg-sky-500 text-white shadow-2xs'
                          : 'bg-[#F2F8FF] text-slate-500 group-hover:bg-sky-100/80 group-hover:text-sky-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.75} />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {active && <ChevronRight className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F7FF] flex flex-col md:flex-row">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex md:w-64 lg:w-[264px] md:h-screen md:sticky md:top-0 bg-white text-[#0F172A] shrink-0 flex-col border-r border-sky-100 no-print">
        <div className="px-4 py-4 border-b border-sky-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-500 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-[#0F172A] truncate">
              {settings.judul_admin || 'Admin CBT'}
            </div>
            <div className="text-[11px] text-[#64748B] truncate mt-0.5">{adminLabel}</div>
          </div>
        </div>

        <nav className="px-3 py-3 overflow-y-auto flex-1 scrollbar-smooth">
          {renderMenuList(false)}
        </nav>

        <div className="p-3 border-t border-sky-100">
          <button
            type="button"
            onClick={onLogout}
            className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <span className="w-7 h-7 rounded-lg bg-[#F2F8FF] flex items-center justify-center shrink-0">
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
            </span>
            <span>Keluar Admin</span>
          </button>
        </div>
      </aside>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden bg-slate-900/35 backdrop-blur-[2px] flex no-print"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            className="w-[290px] max-w-[85vw] h-full bg-white text-[#0F172A] flex flex-col shadow-xl border-r border-sky-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3.5 border-b border-sky-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-500 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[#0F172A] truncate">
                    {settings.judul_admin || 'Admin CBT'}
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate">{adminLabel}</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={() => setMobileMenuOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-[#F2F8FF] hover:text-[#0F172A] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="px-3 py-3 overflow-y-auto flex-1 scrollbar-smooth">
              {renderMenuList(true)}
            </nav>

            <div className="p-3 border-t border-slate-200/70">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full min-h-[44px] px-3 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100/80 flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.8} />
                <span>Keluar Panel Admin</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-sky-100 px-3 sm:px-5 flex items-center justify-between gap-2 sm:gap-4 no-print">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              aria-label="Buka menu navigasi"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden min-w-[44px] min-h-[44px] -ml-1 rounded-xl flex items-center justify-center text-[#475569] hover:bg-[#F2F8FF] active:bg-sky-100 transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" strokeWidth={2} />
            </button>

            {settings.logo && (
              <img
                src={settings.logo}
                alt="Logo"
                referrerPolicy="no-referrer"
                className="hidden sm:block h-8 object-contain max-w-[100px] shrink-0"
              />
            )}

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="hidden sm:flex w-8 h-8 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-500 items-center justify-center shrink-0">
                <ActiveIcon className="w-4 h-4" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-[#0F172A] truncate leading-tight">
                  <span className="md:hidden">{activeItem.label}</span>
                  <span className="hidden md:inline">{settings.judul}</span>
                </div>
                <div className="text-[11px] text-[#64748B] truncate">
                  <span className="md:hidden">{settings.judul}</span>
                  <span className="hidden md:inline">
                    {settings.subjudul_admin || activeItem.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadAll()}
              aria-label="Segarkan data"
              className="min-h-[40px] sm:min-h-[36px] min-w-[40px] sm:min-w-0 px-2.5 sm:px-3.5 rounded-xl border border-sky-200/80 bg-white hover:bg-[#F0F7FF] active:scale-[0.98] text-xs font-semibold text-[#334155] inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-4 h-4 text-sky-500 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.85} />
              <span className="hidden sm:inline">Segarkan</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-3.5 sm:p-6 max-w-[1360px] w-full mx-auto">
          {loading && pakets.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#64748B]">
              Memuat data CBT dari Spreadsheet...
            </div>
          ) : (
            <>
              {(tab === 'dash' || tab === 'paket') && (
                <AdminOverviewAndPakets
                  tab={tab}
                  pakets={pakets}
                  soals={soals}
                  siswas={siswas}
                  hasils={hasils}
                  pelanggarans={pelanggarans}
                  onRefresh={loadAll}
                  onNavigate={setTab}
                  onToast={onToast}
                />
              )}

              {tab === 'soal' && (
                <AdminBankSoal
                  settings={settings}
                  pakets={pakets}
                  soals={soals}
                  onRefresh={loadAll}
                  onToast={onToast}
                />
              )}

              {(tab === 'siswa' || tab === 'ujian') && (
                <AdminSiswaAndUjian
                  tab={tab}
                  siswas={siswas}
                  pakets={pakets}
                  hasils={hasils}
                  onRefresh={loadAll}
                  onToast={onToast}
                />
              )}

              {(tab === 'pantau' || tab === 'live') && (
                <AdminMonitorAndLive
                  tab={tab}
                  pakets={pakets}
                  soals={soals}
                  onRefresh={loadAll}
                  onToast={onToast}
                />
              )}

              {(tab === 'jwb' ||
                tab === 'hasil' ||
                tab === 'matriks' ||
                tab === 'butir' ||
                tab === 'pelanggaran') && (
                <AdminAnalisisAndLaporan
                  tab={tab}
                  settings={settings}
                  pakets={pakets}
                  soals={soals}
                  hasils={hasils}
                  pelanggarans={pelanggarans}
                  onRefresh={loadAll}
                  onToast={onToast}
                />
              )}

              {tab === 'tka' && (
                <AdminAnalisisTka
                  settings={settings}
                  pakets={pakets}
                  soals={soals}
                  hasils={hasils}
                  onRefresh={loadAll}
                  onToast={onToast}
                />
              )}

              {(tab === 'akun' || tab === 'set') && (
                <AdminSettingsAndMigration
                  tab={tab}
                  settings={settings}
                  passLabels={passLabels}
                  tibs={tibs}
                  onRefresh={loadAll}
                  onSettingsUpdated={onSettingsUpdated}
                  onToast={onToast}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
