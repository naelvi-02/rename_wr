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
  
  // Iterate all sheets
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Convert to array of arrays
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    let currentNamaBarang = '';
    let currentKadar = '';
    let currentNampan = '';
    
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 4) continue;
      
      const namaBarang = String(row[2] || '').trim();
      const barcode = String(row[3] || '').trim();
      const kadar = String(row[7] || '').trim();
      const nampan = String(row[8] || '').trim();
      
      if (namaBarang) currentNamaBarang = namaBarang;
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
