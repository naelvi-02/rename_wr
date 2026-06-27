import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3009;

const OUTPUT_PATH = process.env.NODE_ENV === 'production' 
  ? '/var/www/wr.naelvi.com/html/rename/dist/perhiasan.json' 
  : path.join(process.cwd(), 'public/perhiasan.json');

const server = http.createServer((req, res) => {
  // Add CORS headers so web app can call it
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data && data.item && data.item.barcode) {
          const item = data.item;
          console.log('Webhook received update for barcode:', item.barcode);
          
          let db = { items: {}, total: 0, lastUpdated: new Date().toISOString() };
          if (fs.existsSync(OUTPUT_PATH)) {
            db = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
          }
          
          db.items[item.barcode] = item;
          db.total = Object.keys(db.items).length;
          db.lastUpdated = new Date().toISOString();
          
          fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
          fs.writeFileSync(OUTPUT_PATH, JSON.stringify(db, null, 2));
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Webhook processed' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Invalid payload' }));
        }
      } catch (e) {
        console.error('Webhook error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Internal error' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/sync') {
    console.log('Sync requested...');
    const syncProcess = spawn('node', [path.join(__dirname, 'fetch-data.js')], {
      env: { ...process.env, NODE_ENV: 'production' },
      detached: true,
      stdio: 'ignore'
    });
    
    syncProcess.unref(); // Allow server to continue without waiting
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Sync started in background' }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Sync server running on http://127.0.0.1:${PORT}`);
});
