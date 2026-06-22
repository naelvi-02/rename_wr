import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import https from 'https';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1WpKvUqaUrSJJ9qwG89guCElbv93ukgMR4QEsql7Z4Og/export?format=csv&gid=1590828332';
const OUTPUT_PATH = path.join(process.cwd(), 'src/data/perhiasan.json');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return resolve(download(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function syncData() {
  console.log('Downloading Google Sheets data...');
  const csvText = await download(SHEET_URL);
  
  const records = parse(csvText, {
    skip_empty_lines: true,
  });
  
  let currentNamaBarang = '';
  let currentKadar = '';
  let currentNampan = '';
  
  const database = {};

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    
    // row[2] = Nama Barang
    // row[3] = Barcode
    // row[7] = Kadar
    // row[8] = Nampan
    
    if (i < 10) continue; // skip headers
    
    const namaBarang = row[2]?.trim();
    const barcode = row[3]?.trim();
    const kadar = row[7]?.trim();
    const nampan = row[8]?.trim();
    
    if (namaBarang) currentNamaBarang = namaBarang;
    if (kadar) currentKadar = kadar;
    if (nampan) currentNampan = nampan;
    
    if (!barcode || !currentNamaBarang) continue; // skip rows without barcode
    
    const genName = `${currentNamaBarang} ${barcode} ${currentKadar} ${currentNampan}`.trim().replace(/\s+/g, ' ');
    
    database[barcode] = {
      namaBarang: currentNamaBarang,
      barcode: barcode,
      kadar: currentKadar,
      nampan: currentNampan,
      generatedName: genName
    };
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(database, null, 2));
  console.log(`Sync complete! Saved ${Object.keys(database).length} items to src/data/perhiasan.json`);
}

syncData().catch(console.error);
