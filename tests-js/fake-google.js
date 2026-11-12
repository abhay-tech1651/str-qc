/**
 * A strict stand-in for the Apps Script services the server code uses (SpreadsheetApp, PropertiesService, ScriptApp,
 * LockService, Utilities, Session, HtmlService). It behaves like Google Sheets where it matters for safety:
 * text typed into a cell is parsed (numbers, dates, percentages, booleans), a leading apostrophe keeps text as text,
 * a leading = becomes a formula and a leading + or - that is not a number becomes #ERROR!. Tests then fail if
 * anything the code writes would be mangled or turned into a formula in the real spreadsheet.
 */
const fs = require('fs');
const path = require('path');

const CELL_MAX = 50000;

function makeDateClass(fixedMs) {
  return class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  };
}

function parseCell(v, DateC, sheetName, r, c) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  const s = String(v);
  if (s.length > CELL_MAX) throw new Error(`${sheetName}!R${r}C${c}: more than 50000 characters in a single cell`);
  if (s === '') return '';
  if (s[0] === "'") return s.slice(1);
  if (s[0] === '=') return { formula: s };
  const t = s.trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(t) || /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) || /^[+-]?\d{1,2}(,\d{2})*,\d{3}(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  if (/^[+-]?\d+(\.\d+)?%$/.test(t)) return Number(t.slice(0, -1)) / 100;
  if (/^(true|false)$/i.test(t)) return /^true$/i.test(t);
  if (/^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/.test(t)) return new DateC(t.replace(' ', 'T'));
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return new DateC('1899-12-30T' + (t.length === 4 ? '0' + t : t));
  if (s[0] === '+' || s[0] === '-') return { error: '#ERROR!', text: s };
  return s;
}
const shown = (x) => (x && typeof x === 'object' && !(x instanceof Date) ? (x.formula ? '#FORMULA:' + x.formula : x.error) : x);

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(shown(this.sheet.cell(this.r + i, this.c + j)));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    if (!Array.isArray(values) || values.length !== this.nr) throw new Error(`setValues: ${values.length} rows for a range of ${this.nr}`);
    values.forEach((row, i) => {
      if (row.length !== this.nc) throw new Error(`setValues: row ${i} has ${row.length} cells for a range of ${this.nc}`);
      row.forEach((v, j) => this.sheet.set(this.r + i, this.c + j, parseCell(v, this.sheet.ss.env.Date, this.sheet.name, this.r + i, this.c + j)));
    });
    this.sheet.ss.env.calls.setValues++;
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setFontSize() { return this; }
  setWrap() { return this; }
  setBackground() { return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.set(this.r + i, this.c + j, ''); return this; }
}

class FakeSheet {
  constructor(ss, name, values) { this.ss = ss; this.name = name; this.grid = []; this.hidden = false; (values || []).forEach((row, i) => row.forEach((v, j) => this.set(i + 1, j + 1, v))); }
  cell(r, c) { return (this.grid[r - 1] && this.grid[r - 1][c - 1] !== undefined) ? this.grid[r - 1][c - 1] : ''; }
  set(r, c, v) { while (this.grid.length < r) this.grid.push([]); const row = this.grid[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getName() { return this.name; }
  getLastRow() { for (let i = this.grid.length; i > 0; i--) if (this.grid[i - 1].some((v) => v !== '' && v !== undefined)) return i; return 0; }
  getLastColumn() { return this.grid.reduce((m, row) => { for (let j = row.length; j > 0; j--) if (row[j - 1] !== '' && row[j - 1] !== undefined) return Math.max(m, j); return m; }, 0); }
  getMaxRows() { return Math.max(1000, this.grid.length); }
  getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') throw new Error('A1 ranges are not supported by the fake');
    if (r < 1 || c < 1 || (nr !== undefined && nr < 1) || (nc !== undefined && nc < 1)) throw new Error(`getRange(${r}, ${c}, ${nr}, ${nc}): the coordinates or dimensions of the range are invalid`);
    return new FakeRange(this, r, c, nr || 1, nc || 1);
  }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  clear() { this.grid = []; return this; }
  clearContents() { return this.clear(); }
  hideSheet() { this.hidden = true; return this; }
  showSheet() { this.hidden = false; return this; }
  isSheetHidden() { return this.hidden; }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
  setColumnWidths() { return this; }
  autoResizeColumns() { return this; }
  getSheetId() { return this.ss.sheets.indexOf(this); }
  appendRow(row) { const r = this.getLastRow() + 1; this.getRange(r, 1, 1, row.length).setValues([row]); return this; }
  deleteRow(r) { this.grid.splice(r - 1, 1); return this; }
  deleteRows(r, n) { this.grid.splice(r - 1, n); return this; }
  activate() { return this; }
}

class FakeSpreadsheet {
  constructor(env, id, tabs) { this.env = env; this.id = id; this.sheets = (tabs || []).map((t) => new FakeSheet(this, t.title, t.values)); }
  getId() { return this.id; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getName() { return 'County Search QC'; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { if (this.getSheetByName(n)) throw new Error(`A sheet with the name "${n}" already exists`); const s = new FakeSheet(this, n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
  setActiveSheet(s) { this.active = s; return s; }
  getActiveSheet() { return this.active || this.sheets[0]; }
  moveActiveSheet(pos) { const s = this.getActiveSheet(); this.sheets = this.sheets.filter((x) => x !== s); this.sheets.splice(pos - 1, 0, s); }
  getSpreadsheetTimeZone() { return 'Asia/Kolkata'; }
  setSpreadsheetTimeZone() {}
  rename() {}
}

/** Build the fake services. users: {owner, current}; agencyTabs: [{title, values}] for the agency sheet. */
function makeGoogle({ owner = 'owner@example.com', agencyId, agencyTabs = [], now = Date.UTC(2026, 10, 6, 3, 30, 0), root }) {
  const DateC = makeDateClass(now);
  const env = { Date: DateC, calls: { setValues: 0 }, user: owner, triggers: [], props: {}, logs: [], htmlFiles: {} };
  const ss = new FakeSpreadsheet(env, 'FAKE-SPREADSHEET-ID', [{ title: 'Sheet1', values: [] }]);
  const agency = new FakeSpreadsheet(env, agencyId, agencyTabs);
  env.ss = ss;
  env.agency = agency;
  const userObj = () => ({ getEmail: () => env.user });
  const ui = { createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; }, showModelessDialog: () => {}, showModalDialog: () => {}, alert: () => {} };
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const G = {
    Date: DateC,
    console: { log: (...a) => env.logs.push(a.join(' ')), warn: (...a) => env.logs.push(a.join(' ')), error: (...a) => env.logs.push(a.join(' ')), info: (...a) => env.logs.push(a.join(' ')) },
    Logger: { log: (...a) => env.logs.push(a.join(' ')) },
    SpreadsheetApp: {
      getActive: () => ss, getActiveSpreadsheet: () => ss, getUi: () => ui,
      openById: (id) => { if (id === ss.id) return ss; if (id === agency.id) return agency; throw new Error(`No item with the given ID could be found (${id})`); },
      flush: () => {},
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in env.props ? env.props[k] : null), setProperty: (k, v) => { env.props[k] = String(v); return this; },
      getProperties: () => Object.assign({}, env.props), setProperties: (o) => Object.assign(env.props, o), deleteProperty: (k) => { delete env.props[k]; },
    }) },
    ScriptApp: {
      EventType: { CLOCK: 'CLOCK' },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAKE/exec' }),
      getProjectTriggers: () => env.triggers.slice(),
      newTrigger: (fn) => { const t = { fn, getHandlerFunction: () => fn, getEventType: () => 'CLOCK' }; const b = { timeBased: () => b, atHour: (h) => { t.hour = h; return b; }, everyDays: (d) => { t.days = d; return b; }, inTimezone: (z) => { t.tz = z; return b; }, nearMinute: () => b, create: () => { env.triggers.push(t); return t; } }; return b; },
      deleteTrigger: (t) => { env.triggers = env.triggers.filter((x) => x !== t); },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true }) },
    Session: { getActiveUser: userObj, getEffectiveUser: userObj, getScriptTimeZone: () => 'Asia/Kolkata' },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const off = tz === 'Asia/Kolkata' ? 330 : 0;
        const x = new Date(d.getTime() + off * 60000);
        const map = { yyyy: x.getUTCFullYear(), MM: pad(x.getUTCMonth() + 1), dd: pad(x.getUTCDate()), HH: pad(x.getUTCHours()), mm: pad(x.getUTCMinutes()), ss: pad(x.getUTCSeconds()), XXX: off ? '+05:30' : 'Z' };
        return fmt.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss|XXX/g, (m, lit) => (lit !== undefined ? lit : String(map[m])));
      },
      sleep: () => {},
    },
    HtmlService: {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
      SandboxMode: { IFRAME: 'IFRAME' },
      createHtmlOutput: (html) => fakeHtml(String(html || '')),
      createHtmlOutputFromFile: (name) => fakeHtml(fs.readFileSync(path.join(root, 'apps-script', name + '.html'), 'utf8'), name),
      createTemplateFromFile: () => { throw new Error('templates are not used'); },
    },
  };
  return { G, env, ss, agency };
}

function fakeHtml(content, file) {
  const o = { content, file, title: '', meta: {}, setTitle(t) { o.title = t; return o; }, addMetaTag(n, c) { o.meta[n] = c; return o; },
    setXFrameOptionsMode() { return o; }, setSandboxMode() { return o; }, setWidth() { return o; }, setHeight() { return o; }, getContent: () => content, append(s) { o.content += s; return o; } };
  return o;
}

/** Every cell of every sheet that Sheets would have turned into a formula or an error. */
function unsafeCells(ss) {
  const bad = [];
  ss.sheets.forEach((s) => s.grid.forEach((row, i) => row.forEach((v, j) => { if (v && typeof v === 'object' && !(v instanceof Date)) bad.push(`${s.name}!R${i + 1}C${j + 1}: ${v.formula || v.error} ${v.text || ''}`); })));
  return bad;
}

module.exports = { makeGoogle, unsafeCells };
