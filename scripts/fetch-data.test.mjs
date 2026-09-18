// Test utility for scripts/fetch-data.js pure functions.
// Run: node scripts/fetch-data.test.mjs
import assert from 'assert';
import {
  sanitizeFilename,
  isValidBarcode,
  resolveColumnsFromHeader,
  resolveColumnsByPosition,
  processSheet,
  isNewItem,
  normalizeNampan
} from './fetch-data.js';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL - ${name}\n  ${err.message}`);
  }
}

// --- Barcode validation ---
check('barcode validation accepts EAN-8', () => {
  assert.strictEqual(isValidBarcode('12345678'), true);
});
check('barcode validation accepts EAN-13', () => {
  assert.strictEqual(isValidBarcode('8999999000001'), true);
});
check('barcode validation rejects short number', () => {
  assert.strictEqual(isValidBarcode('123'), false);
});
check('barcode validation rejects non-digit', () => {
  assert.strictEqual(isValidBarcode('ABC123'), false);
});
check('barcode validation rejects empty', () => {
  assert.strictEqual(isValidBarcode(''), false);
});

// --- Header-based column detection ---
check('header detection maps columns by name', () => {
  const headerRow = ['Nama Barang', 'Barcode', 'Kadar', 'Berat/Gramasi', 'Ukuran', 'Nampan'];
  const cols = resolveColumnsFromHeader([headerRow]);
  assert.deepStrictEqual(cols, {
    nama: 0, barcode: 1, kadar: 2, berat: 3, ukuran: 4, nampan: 5
  });
});
check('header detection is case/whitespace insensitive', () => {
  const headerRow = ['  BARCODE ', 'NAMA', 'BERAT', 'NAMPAN'];
  const cols = resolveColumnsFromHeader([headerRow]);
  assert.strictEqual(cols.barcode, 0);
  assert.strictEqual(cols.nama, 1);
  assert.strictEqual(cols.berat, 2);
  assert.strictEqual(cols.nampan, 3);
});
check('header detection returns null when core columns missing', () => {
  const headerRow = ['Foo', 'Bar'];
  assert.strictEqual(resolveColumnsFromHeader([headerRow]), null);
});
check('header detection finds header after a title row', () => {
  const rows = [
    ['LAPORAN HARIAN PERHIASAN'],
    ['Nama Barang', 'Barcode', 'Kadar']
  ];
  const cols = resolveColumnsFromHeader(rows);
  assert.strictEqual(cols.nama, 0);
  assert.strictEqual(cols.barcode, 1);
});

// --- Position fallback ---
check('position fallback keeps default layout', () => {
  const cols = resolveColumnsByPosition(['', '', 'nama', 'barcode', 'berat', 'ukuran', '', 'kadar', 'nampan']);
  assert.deepStrictEqual(cols, { nama: 2, barcode: 3, berat: 4, ukuran: 5, kadar: 7, nampan: 8 });
});
check('position fallback shifts when col2 is 8-digit barcode', () => {
  // Heuristic keys off row[2] containing an 8-digit barcode.
  const cols = resolveColumnsByPosition(['', 'nama', '12345678', 'berat', 'ukuran', '', 'kadar', 'nampan']);
  assert.deepStrictEqual(cols, { nama: 1, barcode: 2, berat: 3, ukuran: 4, kadar: 6, nampan: 7 });
});

// --- Filename sanitization ---
check('sanitizeFilename strips illegal chars', () => {
  assert.strictEqual(sanitizeFilename('A/B:C*D?'), 'A B C D');
});
check('sanitizeFilename collapses whitespace and trims', () => {
  assert.strictEqual(sanitizeFilename('  CINCIN    ABC  '), 'CINCIN ABC');
});
check('sanitizeFilename removes control characters', () => {
  assert.strictEqual(sanitizeFilename('CINCIN\u0007ABC'), 'CINCIN ABC');
});

// --- Nampan source labels ---
check('normalizeNampan preserves MP and VT labels', () => {
  assert.strictEqual(normalizeNampan('MP 8'), 'MP 8');
  assert.strictEqual(normalizeNampan('VT 8'), 'VT 8');
  assert.strictEqual(normalizeNampan('mp8'), 'MP 8');
  assert.strictEqual(normalizeNampan('vt-8'), 'VT 8');
  assert.strictEqual(normalizeNampan('8'), 'MP 8');
});

// --- Integration: contamination + berat + skip invalid rows ---
check('processSheet avoids kadar/nampan contamination and skips invalid rows', () => {
  // Header row + data rows. Header detection by name.
  const rows = [
    ['Nama Barang', 'Barcode', 'Kadar', 'Nampan', 'Berat/Gramasi', 'Ukuran'],
    ['CINCIN EMAS', '1234567890123', '17', '5', '2,5', '18CM'],   // valid, all fields
    ['', '1234567890124', '', '', '', ''],                        // valid kont, NO kadar/nampan -> must not inherit
    ['invalid', '12', '99', '9', 'x', 'y']                        // invalid barcode -> skipped
  ];
  const db = {};
  processSheet(rows, db);

  const keys = Object.keys(db);
  assert.strictEqual(keys.length, 2, 'only valid barcode rows are stored');

  const first = db['1234567890123'];
  assert.strictEqual(first.kadar, '17');
  assert.strictEqual(first.nampan, 'MP 5');
  assert.strictEqual(first.berat, '2,5');
  // generatedName includes nama + barcode + kadar + nampan + berat
  assert.ok(first.generatedName.includes('CINCIN EMAS'));
  assert.ok(first.generatedName.includes('1234567890123'));
  assert.ok(first.generatedName.includes('17'));
  assert.ok(first.generatedName.includes('5'));
  assert.ok(first.generatedName.includes('2,5'), 'berat/gramasi included in generatedName');

  const second = db['1234567890124'];
  assert.strictEqual(second.kadar, '', 'kadar must NOT leak from previous row');
  assert.strictEqual(second.nampan, '', 'nampan must NOT leak from previous row');
});

check('processSheet keeps valid barcode without an item name', () => {
  const rows = [
    ['Nama Barang', 'Barcode', 'Kadar', 'Nampan', 'Berat/Gramasi', 'Ukuran'],
    ['', '33567956', '', '', '', '']
  ];
  const db = {};
  processSheet(rows, db);
  assert.strictEqual(db['33567956'].barcode, '33567956');
  assert.strictEqual(db['33567956'].namaBarang, 'ITEM');
});

check('processSheet keeps source MP or VT in generatedName', () => {
  const rows = [
    ['Nama Barang', 'Barcode', 'Kadar', 'Nampan', 'Berat/Gramasi', 'Ukuran'],
    ['CINCIN MP', '8999000000011', '17', '8', '2', ''],
    ['CINCIN VT', '8999000000012', '17', 'VT 8', '2', '']
  ];
  const db = {};
  processSheet(rows, db);
  assert.strictEqual(db['8999000000011'].nampan, 'MP 8');
  assert.ok(db['8999000000011'].generatedName.includes('MP 8'));
  assert.ok(db['8999000000012'].generatedName.includes('VT 8'));
});

// --- Integration: berat absent -> not appended, no trailing gap ---
check('processSheet omits berat when absent', () => {
  const rows = [
    ['Nama Barang', 'Barcode', 'Kadar', 'Nampan', 'Berat/Gramasi', 'Ukuran'],
    ['GELANG A', '8999000000010', '18', '2', '', '']
  ];
  const db = {};
  processSheet(rows, db);
  const item = db['8999000000010'];
  assert.strictEqual(item.generatedName, 'GELANG A 8999000000010 18 MP 2');
});

// --- isNewItem ---
check('isNewItem detects keyword prefix', () => {
  assert.strictEqual(isNewItem('CINCIN ANTIQUE'), true);
});
check('isNewItem detects leading digit', () => {
  assert.strictEqual(isNewItem('12345ABC'), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
