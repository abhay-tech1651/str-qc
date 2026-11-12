/**
 * Build the dashboard page from ui/ into one self-contained file:
 *   apps-script/Dashboard.html  (served by doGet in Apps Script)
 *   dev/preview.html            (same page + a local stand-in for google.script.run; git-ignored)
 * Usage: node dev/build-ui.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const tpl = read('ui/index.html');
const fill = (preview) => tpl
  .replace('/*STYLES*/', () => read('ui/styles.css'))
  .replace('/*APP*/', () => read('ui/app.js'))
  .replace('<!--PREVIEW-->', () => (preview ? `<script>\n${read('dev/preview-stub.js')}\n</script>` : ''));

fs.writeFileSync(path.join(ROOT, 'apps-script', 'Dashboard.html'), fill(false));
fs.writeFileSync(path.join(ROOT, 'dev', 'preview.html'), fill(true));
console.log('built apps-script/Dashboard.html and dev/preview.html');
