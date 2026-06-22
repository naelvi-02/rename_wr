import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

const server = http.createServer((req, res) => {
  // Add CORS headers so web app can call it
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/sync') {
    console.log('Sync requested...');
    const syncProcess = spawn('node', [path.join(__dirname, 'fetch-data.js')], {
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    let output = '';
    syncProcess.stdout.on('data', (data) => output += data.toString());
    syncProcess.stderr.on('data', (data) => output += data.toString());
    
    syncProcess.on('close', (code) => {
      if (code === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Sync complete', log: output }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Sync failed', log: output }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Sync server running on http://127.0.0.1:${PORT}`);
});
