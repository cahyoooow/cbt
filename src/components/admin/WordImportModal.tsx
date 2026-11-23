import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Upload,
  X,
} from 'lucide-react';
import { importSoalBatch } from '../../services/cbtService';
import type { PaketUjian } from '../../types/cbt';
import { parseOptionValue } from '../../utils/mathFormat';
import {
  downloadWordTemplate,
  mapWordSoalsForImport,
  parseWordDocxFile,
  type ParsedWordSoal,
} from '../../utils/wordUtils';
import { CbtImage, RichText } from '../RichText';

interface Props {
  open: boolean;
  paket: PaketUjian | null;
  existingCount: number;
  onClose: () => void;
  onImported: (count: number) => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function WordImportModal({
  open,
  paket,
  existingCount,
  onClose,
  onImported,
  onToast,
}: Props) {
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [defaultBobot, setDefaultBobot] = useState(10);
  const [renumberSequentially, setRenumberSequentially] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [extractedImages, setExtractedImages] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [items, setItems] = useState<ParsedWordSoal[]>([]);
  const [dragOver, setDragOver] = useState(false);

  if (!open) return null;

  const selectedItems = items.filter((i) => i.selected);
  const missingKeyCount = selectedItems.filter((i) => !i.kunci_jawaban.trim()).length;

  const processFile = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    setFileName(file.name);
    setWarnings([]);
    try {
      const res = await parseWordDocxFile(file, defaultBobot);
      setItems(res.questions);
      setExtractedImages(res.extractedImages);
      setWarnings(res.warnings);
      if (res.questions.length > 0) {
        onToast(
          `${res.questions.length} soal terbaca dari Word${
            res.extractedImages > 0 ? ` (${res.extractedImages} gambar diekstrak)` : ''
          }.`,
          'ok'
        );
      } else {
        onToast('Tidak ada soal yang terdeteksi di file Word tersebut.', 'err');
      }
    } catch (err) {
      setItems([]);
      setExtractedImages(0);
      onToast(err instanceof Error ? err.message : 'Gagal membaca file Word (.docx).', 'err');
    } finally {
      setParsing(false);
    }
  };

  const handleUpdateItem = (uid: string, patch: Partial<ParsedWordSoal>) => {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  };

  const handleApplyDefaultBobot = () => {
    const val = Math.max(0.5, Number(defaultBobot) || 10);
    setItems((prev) => prev.map((it) => ({ ...it, bobot: val })));
    onToast(`Bobot semua soal pratinjau diatur ke ${val}.`, 'ok');
  };

  const handleConfirmImport = async () => {
    if (!paket) {
      onToast('Pilih paket ujian terlebih dahulu.', 'err');
      return;
    }
    if (selectedItems.length === 0) {
      onToast('Pilih minimal 1 soal untuk diimpor.', 'err');
      return;
    }
    setImporting(true);
    try {
      const payload = mapWordSoalsForImport(items, existingCount, renumberSequentially);
      const count = await importSoalBatch(payload, paket);
      await onImported(count);
      setItems([]);
      setFileName('');
      setWarnings([]);
      setExtractedImages(0);
      onClose();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mengimpor soal ke database.', 'err');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (importing) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
              <span className="truncate">Impor Soal dari Microsoft Word (.docx)</span>
            </h3>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              Paket tujuan: <strong className="text-slate-700">{paket?.nama_paket_soal || '-'}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadWordTemplate()}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                Unduh Template Word (.docx)
              </button>
              <button
                type="button"
                onClick={() => setShowGuide((v) => !v)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                {showGuide ? 'Tutup Panduan' : 'Panduan Format Word'}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Bobot Default:</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={defaultBobot}
                onChange={(e) => setDefaultBobot(Number(e.target.value))}
                className="w-16 min-h-[34px] px-2 py-1 rounded-lg border border-slate-200 text-xs font-mono text-center"
              />
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleApplyDefaultBobot}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Terapkan
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Format Guide */}
          {showGuide && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-slate-700 space-y-2.5">
              <div className="font-bold text-indigo-950">
                2 Pola Penulisan Microsoft Word (.docx) yang Didukung Otomatis:
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-white rounded-xl p-3 border border-indigo-100 space-y-1">
                  <div className="font-bold text-slate-800">1. Naskah Bernomor (Paling Praktis)</div>
                  <pre className="text-[11px] font-mono text-slate-600 whitespace-pre-wrap leading-relaxed">
{`1. Hasil dari 5² + 10 adalah...
[Gambar boleh disisipkan di sini]
A. 20
B. 25
C. 35
D. 45
Kunci: C
Bobot: 10
Pembahasan: 25 + 10 = 35`}
                  </pre>
                  <p className="text-[11px] text-slate-500">
                    Mendukung penomoran otomatis Word, pangkat/indeks, <code>Jenis: PGK MCMA</code>,{' '}
                    <code>Jenis: PGK Kategori:Benar/Salah</code>, <code>Stimulus:</code>, dan gambar di soal maupun pilihan.
                  </p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-indigo-100 space-y-1">
                  <div className="font-bold text-slate-800">2. Format Tabel Word</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Buat tabel berisi kolom header:
                    <br />
                    <code className="text-indigo-700">
                      No | Jenis | Stimulus | Soal | A | B | C | D | Kunci | Pembahasan | Bobot
                    </code>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Gambar yang ditempel di dalam sel kolom <strong>Stimulus</strong>, <strong>Soal</strong>, atau <strong>A–D</strong> akan otomatis ikut diekstrak dan dikompresi.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Dropzone / File Picker */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void processFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex flex-col items-center justify-center gap-2 p-5 sm:p-6 rounded-2xl border-2 border-dashed transition-colors cursor-pointer ${
              dragOver
                ? 'border-indigo-500 bg-indigo-50/70'
                : 'border-slate-300 bg-slate-50/70 hover:border-indigo-400 hover:bg-indigo-50/30'
            }`}
          >
            <Upload className="w-7 h-7 text-indigo-600" />
            <div className="text-center">
              <div className="text-sm font-semibold text-slate-800">
                {parsing
                  ? 'Membaca dokumen Word...'
                  : fileName
                  ? `File dipilih: ${fileName} (klik untuk ganti)`
                  : 'Klik untuk pilih file Word (.docx) atau seret ke sini'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Teks, pangkat/indeks, tabel, serta gambar di dalam dokumen Word akan otomatis terbaca untuk ditinjau.
              </div>
            </div>
            <input
              type="file"
              accept=".docx,.doc"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                void processFile(f);
              }}
            />
          </label>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
              {warnings.map((w, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Preview List */}
          {items.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedItems.length === items.length}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setItems((prev) => prev.map((it) => ({ ...it, selected: checked })));
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Pilih Semua ({selectedItems.length}/{items.length} soal)
                  </label>
                  {extractedImages > 0 && (
                    <span className="inline-flex items-center gap-1 text-indigo-700 font-semibold">
                      <ImageIcon className="w-3.5 h-3.5" />
                      {extractedImages} gambar diekstrak
                    </span>
                  )}
                  {missingKeyCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {missingKeyCount} soal belum ada kunci
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Semua soal memiliki kunci
                    </span>
                  )}
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={renumberSequentially}
                    onChange={(e) => setRenumberSequentially(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Lanjutkan nomor setelah soal terakhir (mulai No. {existingCount + 1})
                </label>
              </div>

              <div className="space-y-3">
                {items.map((q, idx) => {
                  const previewNo = renumberSequentially
                    ? existingCount + items.slice(0, idx + 1).filter((x) => x.selected).length
                    : q.nomor_soal;
                  const optList = [
                    { key: 'A', val: q.pilihan_a },
                    { key: 'B', val: q.pilihan_b },
                    { key: 'C', val: q.pilihan_c },
                    { key: 'D', val: q.pilihan_d },
                  ].filter((o) => o.val.trim() !== '');

                  return (
                    <div
                      key={q.uid}
                      className={`border rounded-2xl p-3.5 sm:p-4 space-y-2.5 transition-colors ${
                        q.selected
                          ? 'bg-white border-slate-200 shadow-2xs'
                          : 'bg-slate-50/60 border-slate-200/60 opacity-60'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={q.selected}
                            onChange={(e) => handleUpdateItem(q.uid, { selected: e.target.checked })}
                            className="w-4 h-4 rounded border-slate-300"
                          />
                          <span className="font-mono text-xs font-bold text-slate-900">
                            Soal No. {q.selected ? previewNo : q.nomor_soal}
                          </span>
                        </label>

                        <div className="flex flex-wrap items-center gap-2">
                          {!renumberSequentially && (
                            <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                              No:
                              <input
                                type="number"
                                min={1}
                                value={q.nomor_soal}
                                onChange={(e) =>
                                  handleUpdateItem(q.uid, { nomor_soal: Number(e.target.value) || 1 })
                                }
                                className="w-12 px-1.5 py-1 rounded-lg border border-slate-200 text-xs font-mono"
                              />
                            </label>
                          )}

                          <select
                            value={
                              q.jenis_soal.startsWith('PGK Kategori')
                                ? q.jenis_soal
                                : q.jenis_soal === 'PGK MCMA'
                                ? 'PGK MCMA'
                                : 'PG'
                            }
                            onChange={(e) => handleUpdateItem(q.uid, { jenis_soal: e.target.value })}
                            className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs"
                          >
                            <option value="PG">PG</option>
                            <option value="PGK MCMA">PGK MCMA</option>
                            <option value="PGK Kategori:Benar/Salah">PGK Kategori:Benar/Salah</option>
                            <option value="PGK Kategori:Sesuai/Tidak Sesuai">
                              PGK Kategori:Sesuai/Tidak Sesuai
                            </option>
                          </select>

                          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                            Kunci:
                            <input
                              type="text"
                              value={q.kunci_jawaban}
                              onChange={(e) =>
                                handleUpdateItem(q.uid, { kunci_jawaban: e.target.value })
                              }
                              placeholder="Mis: C"
                              className={`w-24 sm:w-28 px-2 py-1 rounded-lg border text-xs font-mono ${
                                q.kunci_jawaban.trim()
                                  ? 'border-emerald-300 bg-emerald-50/40 text-emerald-800'
                                  : 'border-amber-300 bg-amber-50 text-amber-800'
                              }`}
                            />
                          </label>

                          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                            Bobot:
                            <input
                              type="number"
                              min={0.5}
                              step={0.5}
                              value={q.bobot}
                              onChange={(e) =>
                                handleUpdateItem(q.uid, { bobot: Number(e.target.value) || 1 })
                              }
                              className="w-14 px-1.5 py-1 rounded-lg border border-slate-200 text-xs font-mono"
                            />
                          </label>
                        </div>
                      </div>

                      {(q.teks_stimulus || q.gambar_stimulus_url) && (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1.5 text-xs text-slate-600">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Stimulus
                          </div>
                          {q.teks_stimulus && <RichText text={q.teks_stimulus} />}
                          {q.gambar_stimulus_url && (
                            <CbtImage
                              src={q.gambar_stimulus_url}
                              alt={`Stimulus ${q.nomor_soal}`}
                              className="max-h-36"
                            />
                          )}
                        </div>
                      )}

                      <div className="space-y-2">
                        <RichText text={q.teks_soal} className="text-sm font-medium text-slate-900" />
                        {q.gambar_soal_url && (
                          <CbtImage
                            src={q.gambar_soal_url}
                            alt={`Soal ${q.nomor_soal}`}
                            className="max-h-40"
                          />
                        )}
                      </div>

                      {optList.length > 0 && (
                        <div className="grid sm:grid-cols-2 gap-1.5 pt-1">
                          {optList.map((o) => {
                            const parsed = parseOptionValue(o.val);
                            return (
                              <div
                                key={o.key}
                                className="px-2.5 py-1.5 rounded-xl border border-slate-200/80 bg-slate-50/50 text-xs flex gap-2"
                              >
                                <span className="font-mono font-bold text-slate-500">{o.key}.</span>
                                <div className="min-w-0 space-y-1">
                                  {parsed.text && <RichText text={parsed.text} />}
                                  {parsed.imageUrl && (
                                    <CbtImage
                                      src={parsed.imageUrl}
                                      alt={`Opsi ${o.key}`}
                                      className="max-h-20"
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.pembahasan && (
                        <div className="text-xs text-emerald-700 bg-emerald-50/60 px-2.5 py-1.5 rounded-lg">
                          <strong>Pembahasan:</strong> <RichText text={q.pembahasan} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={importing}
            onClick={handleClose}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={importing || selectedItems.length === 0}
            onClick={() => void handleConfirmImport()}
            className="min-h-[42px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer shadow-xs shadow-indigo-600/20"
          >
            {importing
              ? 'Mengimpor ke Bank Soal...'
              : `Impor ${selectedItems.length} Soal ke Bank Soal`}
          </button>
        </div>
      </div>
    </div>
  );
}
