/* Local preview only: stands in for google.script.run using the local fixture files. Never shipped to Apps Script. */
const QC_MODEL = new URLSearchParams(location.search).get('model') || 'model';
window.google = { script: { get run() { return runner(); } } };
function runner() {
  let ok = () => {}, fail = (e) => console.error(e);
  const r = {
    withSuccessHandler(f) { ok = f; return r; },
    withFailureHandler(f) { fail = f; return r; },
    getModel() { fetch('/data/fixtures/' + QC_MODEL + '.json?t=' + Date.now()).then((x) => x.text()).then((t) => { const m = JSON.parse(t); m.refreshed_at = new Date().toISOString(); ok(JSON.stringify(m)); }, fail); },
    getReview() { fetch('/data/fixtures/review.json?t=' + Date.now()).then((x) => x.text()).then(ok, fail); },
    whoAmI() { setTimeout(() => ok({ email: 'preview@this-computer', canUpload: true }), 10); },
    uploadExports(files) { setTimeout(() => ok(files.map((f) => ({ name: f.name, kind: 'unknown', rows: 0, note: 'preview only: nothing was uploaded' }))), 200); },
    refreshNow() { setTimeout(() => ok({ ok: true, at: new Date().toISOString() }), 300); },
  };
  return r;
}
