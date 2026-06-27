import fs from 'fs';
import path from 'path';
import https from 'https';

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwRNHQT6i9OupMnQIA8th7IWF0sEfvnJcBY7NOx8gk-ssAHXWQtOFet3xB9ltQJcKsa/exec';
const OUTPUT_PATH = process.env.VPS_DEPLOY === 'true'
  ? '/var/www/wr.naelvi.com/html/rename/perhiasan.json' 
  : path.join(process.cwd(), 'public/perhiasan.json');

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

async function syncData() {
  console.log('Downloading Google Sheets JSON Data...');
  const jsonSheets = await downloadJSON(SHEET_URL);
  
  const database = {};
  
  const keywords = [
    'CINCIN', 'GELANG', 'KALUNG', 'LIONTIN', 'ANTING', 'TINDIK', 
    'BROS', 'MAINAN', 'RANTAI', 'SET', 'GIWANG', 'BANGLE', 
    'C/C', 'G/L', 'K/L', 'CC', 'GL', 'KL', 'LT', 'AT', 'GW'
  ];
	  function isNewItem(name) {

	const upper = String(name || '').trim().toUpperCase();
		for (const kw of keywords) {
		  if (upper.startsWith(kw)) return true;
		}
		if (/^\d+/.test(upper)) return true;
		return false;
	}
  
  for (const sheetName of Object.keys(jsonSheets)) {
    const rows = jsonSheets[sheetName];
    
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

      if (String(row[2] || '').trim().match(/^\d{8}$/)) {
        namaIdx = 1; barIdx = 2; beratIdx = 3; ukuranIdx = 4; kadarIdx = 6; nampanIdx = 7;
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
          currentNamaBarang = currentBaseName ? currentBaseName + ' ' + namaBarang : namaBarang;
        }
      }
      
      if (kadar) currentKadar = kadar;
      if (nampan) currentNampan = nampan;
      
      if (!barcode || !currentNamaBarang || barcode.toLowerCase().includes('barcode')) continue;
      
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