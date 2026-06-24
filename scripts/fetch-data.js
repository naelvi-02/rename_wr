import fs from 'fs';
import path from 'path';
import https from 'https';
import * as xlsx from 'xlsx';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1WpKvUqaUrSJJ9qwG89guCElbv93ukgMR4QEsql7Z4Og/export?format=xlsx';
const OUTPUT_PATH = process.env.NODE_ENV === 'production' 
  ? '/var/www/wr.naelvi.com/html/rename/perhiasan.json' 
  : path.join(process.cwd(), 'public/perhiasan.json');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return resolve(download(res.headers.location));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function syncData() {
  console.log('Downloading Google Sheets data (.xlsx)...');
  const buffer = await download(SHEET_URL);
  
  console.log('Parsing xlsx...');
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  
  const database = {};
  
  // Keywords for detecting new jewelry items
  const keywords = [
    'CINCIN', 'GELANG', 'KALUNG', 'LIONTIN', 'ANTING', 'TINDIK', 
    'BROS', 'MAINAN', 'RANTAI', 'SET', 'GIWANG', 'BANGLE', 
    'C/C', 'G/L', 'K/L', 'CC', 'GL', 'KL', 'LT', 'AT', 'GW'
  ];

  function isNewItem(name) {
    const upper = name.toUpperCase();
    for (const kw of keywords) {
      if (upper.startsWith(kw)) return true;
    }
    if (/^\d+/.test(name)) return true;
    return false;
  }
  
  // Iterate all sheets
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Convert to array of arrays
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    let currentBaseName = '';
    let currentNamaBarang = '';
    let currentKadar = '';
    let currentNampan = '';
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      
      let namaIdx = 2;
      let barIdx = 3;
      let beratIdx = 4;
      let ukuranIdx = 5;
      let kadarIdx = 7;
      let nampanIdx = 8;

      // Auto-detect missing Foto column (which shifts everything left by 1)
      if (String(row[2] || '').trim().match(/^\d{8}$/)) {
        namaIdx = 1;
        barIdx = 2;
        beratIdx = 3;
        ukuranIdx = 4;
        kadarIdx = 6;
        nampanIdx = 7;
      }

      const namaBarang = String(row[namaIdx] || '').trim();
      const barcode = String(row[barIdx] || '').trim();
      const kadar = String(row[kadarIdx] || '').trim();
      const nampan = String(row[nampanIdx] || '').trim();
      const berat = String(row[beratIdx] || '').trim();
      const ukuran = String(row[ukuranIdx] || '').trim();
      
      if (namaBarang) {
        if (isNewItem(namaBarang)) {
          currentBaseName = namaBarang;
          currentNamaBarang = namaBarang;
        } else {
          // Continuation of the previous base name
          currentNamaBarang = currentBaseName ? currentBaseName + ' ' + namaBarang : namaBarang;
        }
      }
      
      if (kadar) currentKadar = kadar;
      if (nampan) currentNampan = nampan;
      
      if (!barcode || !currentNamaBarang || barcode.toLowerCase().includes('barcode')) continue;
      
      // Clean multiple spaces
      const genName = `${currentNamaBarang} ${barcode} ${currentKadar} ${currentNampan}`.trim().replace(/\s+/g, ' ');
      
      database[barcode] = {
        namaBarang: currentNamaBarang,
        barcode: barcode,
        kadar: currentKadar,
        nampan: currentNampan,
        berat: berat,
        ukuran: ukuran,
        generatedName: genName
      };
    }
  }

  const finalOutput = {
    lastUpdated: new Date().toISOString(),
    total: Object.keys(database).length,
    items: database
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalOutput, null, 2));
  console.log(`Sync complete! Saved ${finalOutput.total} items to public/perhiasan.json`);
  process.exit(0);
}

syncData().catch(console.error);
