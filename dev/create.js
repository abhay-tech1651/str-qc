/**
 * One-time: create the County Search QC Google Sheet with its bound Apps Script (clasp create-script --type sheets),
 * keeping our own appsscript.json (clasp may write a default manifest into the folder when it creates the project).
 * Runs clasp's own JavaScript entry with Node, so no shell is involved and the title is passed as one argument.
 * Usage: npm run create   (after `npx clasp login` and turning on the Apps Script API)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const manifest = path.join(ROOT, 'apps-script', 'appsscript.json');
const claspJson = path.join(ROOT, '.clasp.json');
if (fs.existsSync(claspJson)) {
  console.log('.clasp.json already exists: the project was created before. Use npm run push.');
  process.exit(0);
}
const clasp = path.join(ROOT, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
const keep = fs.readFileSync(manifest, 'utf8');
try {
  execFileSync(process.execPath, [clasp, 'create-script', '--type', 'sheets', '--title', 'County Search QC', '--rootDir', 'apps-script'],
    { cwd: ROOT, stdio: 'inherit' });
} finally {
  fs.writeFileSync(manifest, keep); // our manifest (scopes, time zone, web app settings) always wins
}
if (!fs.existsSync(claspJson)) {
  console.error('clasp did not create the project (see the message above).');
  process.exit(1);
}
console.log('Created. Next: npm run push');
