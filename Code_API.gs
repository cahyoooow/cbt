/**
 * TAMBAHKAN file ini ke proyek Apps Script Anda (jangan hapus Code.gs lama).
 * File ini membuka fungsi-fungsi yang dulu dipanggil google.script.run
 * sebagai API JSON agar frontend bisa di-hosting di GitHub Pages.
 *
 * Jika Code.gs lama sudah punya doGet/doPost, ganti/gabungkan dengan ini.
 */
var API_WHITELIST = [
  'verifyAdminLogin', 'verifyStudentLogin', 'getQuestionsForStudent',
  'saveProgress', 'logViolation', 'submitStudentExam',
  'admin', 'uploadImage', 'getImg', 'getSettings'
];

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, msg: 'CBT API aktif' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    if (API_WHITELIST.indexOf(req.fn) < 0) throw new Error('Fungsi tidak diizinkan: ' + req.fn);
    var f = this[req.fn];
    if (typeof f !== 'function') throw new Error('Fungsi tidak ditemukan: ' + req.fn);
    var data = f.apply(null, req.args || []);
    out = { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
