/* Adaptor google.script.run -> Apps Script Web App (JSON API).
   Ganti API_URL dengan URL deployment Web App Anda (berakhiran /exec).
   v2: otomatis mengulang (retry + jeda acak) bila server sibuk / "Failed to fetch",
       supaya ±90 siswa yang mengakses bersamaan tetap aman. */
window.CBT_API_URL = 'https://script.google.com/macros/s/AKfycbwCLsMHzKd_wqwLX-5w71sKtmubFHSxAgcr1Bdlcr-IESMcl21QBlKyBoI3L0df3a1X/exec';

(function () {
  // Hanya fungsi yang aman diulang (hasilnya sama bila terkirim dua kali)
  var RETRY_FN = { verifyAdminLogin: 1, verifyStudentLogin: 1, getQuestionsForStudent: 1, saveProgress: 1,
                   submitStudentExam: 1, getSettings: 1, getImg: 1, logViolation: 1 };
  var ADMIN_READ = { dash: 1, list: 1, monitor: 1, pantau: 1, jawaban: 1 };
  var MAX_TRY = 6;

  function canRetry(fn, args) {
    if (RETRY_FN[fn]) return true;
    return fn === 'admin' && !!ADMIN_READ[args && args[1]];
  }
  function mkErr(msg, transient) { var e = new Error(msg); e.transient = transient; return e; }
  // Pesan error server yang sifatnya sementara (kuota/kelebihan beban)
  var TRANSIENT_MSG = /too many|simultaneous|timed? ?out|lock|try again|service|server error|temporar|rate|quota|exceeded|unavailable|busy/i;

  function once(fn, args) {
    var big = fn !== 'saveProgress' && fn !== 'logViolation';
    return fetch(window.CBT_API_URL, {
      method: 'POST',
      // text/plain = "simple request": tidak memicu preflight CORS yang tidak didukung Apps Script
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args }),
      redirect: 'follow',
      keepalive: !big // agar saveProgress tetap terkirim saat tab ditutup
    }).then(function (r) { return r.text(); })
      .then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (e) { throw mkErr('Respons server tidak valid. Pastikan Web App di-deploy sebagai "Anyone".', true); }
        if (!j.ok) throw mkErr(j.error || 'Terjadi kesalahan di server', TRANSIENT_MSG.test(j.error || ''));
        return j.data;
      }, function (e) { throw mkErr(String(e && e.message || e), true); }); // jaringan gagal / Failed to fetch
  }

  function call(fn, args, ok, fail, n) {
    n = n || 0;
    once(fn, args).then(function (d) { if (ok) ok(d); }, function (e) {
      if (n < MAX_TRY - 1 && e.transient && canRetry(fn, args)) {
        // jeda naik bertahap + acak (±1 dtk) agar permintaan puluhan siswa tidak menumpuk serempak
        var wait = Math.min(20000, 1000 * Math.pow(2, n)) + Math.random() * 1000;
        setTimeout(function () { call(fn, args, ok, fail, n + 1); }, wait);
        return;
      }
      if (fail) fail(e instanceof Error ? e : new Error(String(e)));
    });
  }
  function mk(ok, fail) {
    return new Proxy({}, {
      get: function (_, k) {
        if (k === 'withSuccessHandler') return function (f) { return mk(f, fail); };
        if (k === 'withFailureHandler') return function (f) { return mk(ok, f); };
        if (k === 'withUserObject') return function () { return mk(ok, fail); };
        return function () { call(String(k), Array.prototype.slice.call(arguments), ok, fail, 0); };
      }
    });
  }
  window.google = { script: { run: mk(null, null) } };
})();
