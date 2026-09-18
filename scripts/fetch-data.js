import fs from 'fs';
import path from 'path';
import https from 'https';
import { pathToFileURL } from 'url';

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwRNHQT6i9OupMnQIA8th7IWF0sEfvnJcBY7NOx8gk-ssAHXWQtOFet3xB9ltQJcKsa/exec';
const OUTPUT_PATH = process.env.VPS_DEPLOY === 'true'
  ? '/var/www/wr.naelvi.com/html/rename/perhiasan.json'
  : path.join(process.cwd(), 'public/perhiasan.json');

// Standard retail barcode lengths (EAN-8, UPC-A, EAN-13).
const VALID_BARCODE_LENGTHS = new Set([8, 12, 13]);

// Column names used to detect spreadsheet header positions instead of
// relying on hardcoded indices that break when columns are reordered.
const COLUMN_KEYWORDS = {
  nama: ['nama barang', 'nama_barang', 'nama'],
  barcode: ['barcode', 'bar code', 'kode barang'],
  berat: ['berat', 'gramasi', 'gram', 'gr'],
  ukuran: ['ukuran', 'size', 'lingkar'],
  kadar: ['kadar'],
  nampan: ['nampan', 'baki', 'tray'],
};

function normalizeValue(value) {
  return String(value ?? '').trim();
}

function normalizeHeader(value) {
  return normalizeValue(value).toLowerCase();
}

function normalizeNampan(value) {
  const raw = normalizeValue(value);
  if (/^\d+$/.test(raw)) return `MP ${raw}`;

  const match = raw.match(/^(MP|VT)\s*[-_./]?\s*([A-Za-z0-9]+)$/i);
  if (!match) return raw.replace(/\s+/g, ' ');

  return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
}

function isValidBarcode(value) {
  const barcode = normalizeValue(value);
  if (!/^\d+$/.test(barcode)) return false;
  return VALID_BARCODE_LENGTHS.has(barcode.length);
}

function findColumnIndex(headerRow, keywords) {
  const headers = (headerRow || []).map(normalizeHeader);
  const index = headers.findIndex((header) =>
    Boolean(header) && keywords.some((keyword) => header.includes(keyword))
  );
  return index >= 0 ? index : null;
}

// Resolve column indices from the header row when present. Returns null when
// the required core columns (barcode, nama) cannot be identified by name.
function resolveColumnsFromHeader(rows) {
  if (!Array.isArray(rows)) return null;

  const headerRow = rows
    .slice(0, 3)
    .find((row) => Array.isArray(row) && findColumnIndex(row, COLUMN_KEYWORDS.barcode) != null
      && findColumnIndex(row, COLUMN_KEYWORDS.nama) != null);
  if (!headerRow) return null;

  const resolved = {};
  for (const key of Object.keys(COLUMN_KEYWORDS)) {
    resolved[key] = findColumnIndex(headerRow, COLUMN_KEYWORDS[key]);
  }

  const hasCoreColumns = resolved.barcode != null && resolved.nama != null;
  return hasCoreColumns ? resolved : null;
}

function findHeaderRowIndex(rows) {
  if (!Array.isArray(rows)) return -1;

  return rows.slice(0, 3).findIndex((row) => {
    if (!Array.isArray(row)) return false;
    return findColumnIndex(row, COLUMN_KEYWORDS.barcode) != null
      && findColumnIndex(row, COLUMN_KEYWORDS.nama) != null;
  });
}

// Fallback to the previous positional heuristics when no usable header exists.
function resolveColumnsByPosition(row) {
  let namaIdx = 2;
  let barIdx = 3;
  let beratIdx = 4;
  let ukuranIdx = 5;
  let kadarIdx = 7;
  let nampanIdx = 8;

  // Column layout shifts when the first column already holds an 8-digit barcode.
  if (String(row[2] || '').trim().match(/^\d{8}$/)) {
    namaIdx = 1; barIdx = 2; beratIdx = 3; ukuranIdx = 4; kadarIdx = 6; nampanIdx = 7;
  }

  return { nama: namaIdx, barcode: barIdx, berat: beratIdx, ukuran: ukuranIdx, kadar: kadarIdx, nampan: nampanIdx };
}

// ASCII control characters (0-31) plus DEL (127), built programmatically so no
// literal control characters appear in the source line (avoids regexp parsing
// issues across parsers/tooling).
const ASCII_CONTROL_CHARS = Array.from({ length: 32 }, (_, i) => i).concat([127]);

function sanitizeFilename(name) {
  // Strip characters that are illegal in filenames across common OSes.
  const controlCharPattern = new RegExp(`[${ASCII_CONTROL_CHARS.map((c) => String.fromCharCode(c)).join('')}]`, 'g');
  return normalizeValue(name)
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(controlCharPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function downloadJSON(url, retries = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return resolve(downloadJSON(res.headers.location, retries));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString();
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', err => {
        if (retries > 0) return resolve(downloadJSON(url, retries - 1));
        reject(err);
      });
    }).on('error', err => {
      if (retries > 0) return resolve(downloadJSON(url, retries - 1));
      reject(err);
    });
  });
}

const KEYWORDS = [
  'CINCIN', 'GELANG', 'KALUNG', 'LIONTIN', 'ANTING', 'TINDIK',
  'BROS', 'MAINAN', 'RANTAI', 'SET', 'GIWANG', 'BANGLE',
  'C/C', 'G/L', 'K/L', 'CC', 'GL', 'KL', 'LT', 'AT', 'GW'
];

function isNewItem(name) {
  const upper = String(name || '').trim().toUpperCase();
  for (const kw of KEYWORDS) {
    if (upper.startsWith(kw)) return true;
  }
  if (/^\d+/.test(upper)) return true;
  return false;
}

// Pure function: merges one sheet's rows into the provided `database` map.
// Kept separate from network I/O so it can be unit-tested deterministically.
function processSheet(rows, database, sheetName) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const headerBased = resolveColumnsFromHeader(rows);

  let currentBaseName = '';
  let currentNamaBarang = '';

  const headerRowIndex = findHeaderRowIndex(rows);
  const firstDataRowIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 1;

  for (let i = firstDataRowIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    // Skip stray rows that are actually repeated header/title rows.
    const joined = row.map((cell) => normalizeHeader(cell)).join(' ');
    if (joined.includes('barcode') && joined.includes('nama')) continue;

    const columns = headerBased || resolveColumnsByPosition(row);

    const namaBarang = normalizeValue(row[columns.nama]);
    const barcode = normalizeValue(row[columns.barcode]);
    const kadar = normalizeValue(row[columns.kadar]);
    const nampan = normalizeNampan(row[columns.nampan]);
    const berat = normalizeValue(row[columns.berat]);
    const ukuran = normalizeValue(row[columns.ukuran]);

    // Nomor baris asli di spreadsheet (row[0] biasanya membawa index dari Apps Script).
    const sheetRow = parseInt(String(row[0] ?? ''), 10) || i + 1;

    // Treat only real barcodes as valid data rows; skip header/junk rows.
    if (!isValidBarcode(barcode)) continue;

    if (namaBarang) {
      if (isNewItem(namaBarang)) {
        currentBaseName = namaBarang;
        currentNamaBarang = namaBarang;
      } else {
        currentNamaBarang = currentBaseName ? `${currentBaseName} ${namaBarang}` : namaBarang;
      }
    }

    if (!currentNamaBarang) currentNamaBarang = 'ITEM';

    // kadar/nampan are read per-row (never carried) to avoid contaminating
    // unrelated rows with stale values from a previous group.
    const parts = [currentNamaBarang, barcode];
    if (kadar) parts.push(kadar);
    if (nampan) parts.push(nampan);
    if (berat) parts.push(berat);
    const generatedName = sanitizeFilename(parts.join(' '));

    database[barcode] = {
      namaBarang: currentNamaBarang,
      barcode: barcode,
      kadar: kadar,
      nampan: nampan,
      berat: berat,
      ukuran: ukuran,
      generatedName: generatedName,
      sheet: sheetName,
      row: sheetRow
    };
  }
}

async function syncData() {
  console.log('Downloading Google Sheets JSON Data...');
  const jsonSheets = await downloadJSON(SHEET_URL);

  const database = {};

  for (const sheetName of Object.keys(jsonSheets)) {
    processSheet(jsonSheets[sheetName], database, sheetName);
  }

  const finalOutput = {
    lastUpdated: new Date().toISOString(),
    total: Object.keys(database).length,
    items: database
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalOutput, null, 2));
  console.log(`Sync complete! Saved ${finalOutput.total} items to ${OUTPUT_PATH}`);
  process.exit(0);
}

function isMainModule() {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isMainModule()) {
  syncData().catch((error) => {
    console.error('Sync failed:', error);
    process.exitCode = 1;
  });
}

export {
  sanitizeFilename,
  isValidBarcode,
  resolveColumnsFromHeader,
  resolveColumnsByPosition,
  normalizeValue,
  normalizeNampan,
  processSheet,
  isNewItem,
  syncData
};
