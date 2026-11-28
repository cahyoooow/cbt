export const DEFAULT_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwCLsMHzKd_wqwLX-5w71sKtmubFHSxAgcr1Bdlcr-IESMcl21QBlKyBoI3L0df3a1X/exec';

const LS_GAS_URL_KEY = 'cbt_gas_url';
const LS_LEGACY_GAS_URL_KEY = 'cbt_legacy_gas_url';
const SS_ADMIN_PW_KEY = 'cbt_admin_pw';

const RETRY_FN = new Set([
  'verifyAdminLogin',
  'verifyStudentLogin',
  'getQuestionsForStudent',
  'saveProgress',
  'submitStudentExam',
  'getSettings',
  'getImg',
  'logViolation',
]);

const ADMIN_READ_ACTIONS = new Set(['dash', 'list', 'monitor', 'pantau', 'jawaban']);

const TRANSIENT_MSG =
  /too many|simultaneous|timed? ?out|lock|try again|service|server error|temporar|rate|quota|exceeded|unavailable|busy|failed to fetch|network/i;

const MAX_TRY_DEFAULT = 5;
const MAX_TRY_SUBMIT = 8;
const MAX_TRY_SAVE_PROGRESS = 2;

export interface CallGasOptions {
  maxTry?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, maxTry: number) => void;
}

export function getGasUrl(): string {
  try {
    const primary = localStorage.getItem(LS_GAS_URL_KEY)?.trim();
    if (primary) return primary;
    const legacy = localStorage.getItem(LS_LEGACY_GAS_URL_KEY)?.trim();
    if (legacy) return legacy;
  } catch {
    // ignore storage errors
  }
  return DEFAULT_GAS_URL;
}

export function setGasUrl(url: string): void {
  const clean = url.trim() || DEFAULT_GAS_URL;
  try {
    localStorage.setItem(LS_GAS_URL_KEY, clean);
    localStorage.setItem(LS_LEGACY_GAS_URL_KEY, clean);
  } catch {
    // ignore storage errors
  }
}

export function getAdminSessionPw(): string {
  try {
    return sessionStorage.getItem(SS_ADMIN_PW_KEY) || '';
  } catch {
    return '';
  }
}

export function setAdminSessionPw(pw: string): void {
  try {
    sessionStorage.setItem(SS_ADMIN_PW_KEY, pw);
  } catch {
    // ignore storage errors
  }
}

export function clearAdminSessionPw(): void {
  try {
    sessionStorage.removeItem(SS_ADMIN_PW_KEY);
  } catch {
    // ignore storage errors
  }
}

interface GasError extends Error {
  transient?: boolean;
}

function makeGasError(msg: string, transient: boolean): GasError {
  const err = new Error(msg) as GasError;
  err.transient = transient;
  return err;
}

function canRetry(fn: string, args: unknown[]): boolean {
  if (RETRY_FN.has(fn)) return true;
  if (fn === 'admin' && typeof args[1] === 'string') {
    return ADMIN_READ_ACTIONS.has(args[1]);
  }
  return false;
}

async function callOnce<T>(
  url: string,
  fn: string,
  args: unknown[],
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      // Simple text/plain POST avoids CORS preflight which Apps Script Web Apps reject.
      // Avoid keepalive: Chrome enforces a strict 64KB keepalive limit and throws "Failed to fetch".
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn, args }),
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw makeGasError('Koneksi ke server lambat (timeout), mencoba ulang...', true);
    }
    throw makeGasError(
      err instanceof Error ? err.message : 'Gagal terhubung ke Google Apps Script.',
      true
    );
  } finally {
    window.clearTimeout(timerId);
  }

  const text = await res.text();
  let parsed: { ok?: boolean; data?: T; error?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw makeGasError(
      'Server Google Apps Script sedang sibuk atau respons tidak valid. Mencoba ulang...',
      true
    );
  }

  if (!parsed.ok) {
    const msg = parsed.error || 'Terjadi kesalahan pada server Apps Script.';
    throw makeGasError(msg, TRANSIENT_MSG.test(msg));
  }

  return parsed.data as T;
}

export async function callGas<T = unknown>(
  fn: string,
  args: unknown[] = [],
  overrideUrl?: string,
  options?: CallGasOptions
): Promise<T> {
  const url = (overrideUrl || getGasUrl()).trim();
  if (!url) {
    throw new Error('URL Web App Google Apps Script belum diatur.');
  }

  const defaultMaxTry =
    fn === 'submitStudentExam'
      ? MAX_TRY_SUBMIT
      : fn === 'saveProgress'
      ? MAX_TRY_SAVE_PROGRESS
      : MAX_TRY_DEFAULT;
  const maxTry = options?.maxTry ?? defaultMaxTry;
  const timeoutMs =
    options?.timeoutMs ?? (fn === 'submitStudentExam' ? 25000 : fn === 'saveProgress' ? 12000 : 18000);

  let attempt = 0;
  while (true) {
    try {
      return await callOnce<T>(url, fn, args, timeoutMs);
    } catch (err) {
      const gasErr = err as GasError;
      if (attempt < maxTry - 1 && gasErr.transient && canRetry(fn, args)) {
        attempt++;
        options?.onRetry?.(attempt, maxTry);
        const baseWait = fn === 'submitStudentExam' ? 1200 : 900;
        const capWait = fn === 'submitStudentExam' ? 15000 : 12000;
        const waitMs =
          Math.min(capWait, baseWait * Math.pow(1.7, attempt - 1)) + Math.random() * 1400;
        await new Promise((resolve) => window.setTimeout(resolve, waitMs));
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

export async function callGasAdmin<T = unknown>(
  action: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const pw = getAdminSessionPw();
  if (!pw) {
    throw new Error('Sesi admin telah berakhir. Silakan login admin kembali.');
  }
  const args: unknown[] = payload !== undefined ? [pw, action, payload] : [pw, action];
  return callGas<T>('admin', args);
}

export async function testGasConnection(customUrl?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await callGas('getSettings', [], customUrl);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal terhubung ke Google Apps Script.',
    };
  }
}

const uploadedDataUrlCache = new Map<string, string>();

/**
 * If a field contains `data:image/...` (either alone or on the last line after option text),
 * uploads each base64 image to Google Drive via `uploadImage(pw, name, mimeType, base64)`
 * so Google Sheets cell limits (50k chars) are never exceeded.
 */
export async function uploadDataUrlFieldToGas(
  rawValue: string,
  filenamePrefix = 'cbt_img'
): Promise<string> {
  const val = String(rawValue || '').trim();
  if (!val || !val.includes('data:image/')) return rawValue || '';

  const lines = val.split('\n');
  let changed = false;
  const pw = getAdminSessionPw();
  if (!pw) return val;

  const processedLines = await Promise.all(
    lines.map(async (line, idx) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
      if (!match) return line;

      const cached = uploadedDataUrlCache.get(trimmed);
      if (cached) {
        changed = true;
        return cached;
      }

      const mimeType = match[1].toLowerCase();
      const base64Body = match[2];
      const ext = mimeType.includes('png')
        ? 'png'
        : mimeType.includes('webp')
        ? 'webp'
        : 'jpg';
      const filename = `${filenamePrefix}_${Date.now()}_${idx}.${ext}`;

      const driveUrl = await callGas<string>('uploadImage', [pw, filename, mimeType, base64Body]);
      if (driveUrl && typeof driveUrl === 'string') {
        uploadedDataUrlCache.set(trimmed, driveUrl);
        changed = true;
        return driveUrl;
      }
      return line;
    })
  );

  return changed ? processedLines.join('\n') : rawValue;
}
