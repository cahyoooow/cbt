/* Adaptor google.script.run -> Apps Script Web App (JSON API).
   Ganti API_URL dengan URL deployment Web App Anda (berakhiran /exec). */
window.CBT_API_URL = 'https://script.google.com/macros/s/AKfycbyr1IT8lcj62TZal0K_g2A04vyH6UMewCk26pEFnk4Dk4Kspdzx_O_cRX_DFVK73B-8/exec';

(function () {
  function call(fn, args, ok, fail) {
    var big = fn !== 'saveProgress' && fn !== 'logViolation';
    fetch(window.CBT_API_URL, {
      method: 'POST',
      // text/plain = "simple request": tidak memicu preflight CORS yang tidak didukung Apps Script
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args }),
      redirect: 'follow',
      keepalive: !big // agar saveProgress tetap terkirim saat tab ditutup
    })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('Respons server tidak valid. Pastikan Web App di-deploy sebagai "Anyone".'); }
        if (!j.ok) throw new Error(j.error || 'Terjadi kesalahan di server');
        if (ok) ok(j.data);
      })
      .catch(function (e) {
        if (fail) fail(e instanceof Error ? e : new Error(String(e)));
      });
  }
  function mk(ok, fail) {
    return new Proxy({}, {
      get: function (_, k) {
        if (k === 'withSuccessHandler') return function (f) { return mk(f, fail); };
        if (k === 'withFailureHandler') return function (f) { return mk(ok, f); };
        if (k === 'withUserObject') return function () { return mk(ok, fail); };
        return function () { call(String(k), Array.prototype.slice.call(arguments), ok, fail); };
      }
    });
  }
  window.google = { script: { run: mk(null, null) } };
})();
