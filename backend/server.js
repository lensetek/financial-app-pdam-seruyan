const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { initDatabase } = require('./database');

async function main() {
  const db = await initDatabase();
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.use('/api/akun', require('./routes/akun')(db));
  app.use('/api/transaksi', require('./routes/transaksi')(db));
  app.use('/api/laporan', require('./routes/laporan')(db));
  app.use('/api/process', require('./routes/process')(db));
  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/admin/mcp-tokens', require('./routes/admin-mcp-tokens')(db));

  // MCP Streamable HTTP (auth via bearer token MCP). Mount sebelum static catch-all.
  app.all('/mcp', require('./mcp/mount')(db));

  if (!process.env.VERCEL) {
    const distPath = path.join(__dirname, '..', 'frontend', 'dist');
    const fs = require('fs');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath, {
        setHeaders: (res, path) => {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }));
      app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) {
          return res.status(404).json({ error: 'API route not found' });
        }
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

module.exports = { main };

function showErrorPage(errorMsg) {
  const setupExpress = require('express');
  const setupApp = setupExpress();

  setupApp.get('*', (req, res) => {
    res.status(500).send(
      '<!DOCTYPE html>' +
      '<html lang="id">' +
      '<head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>Database Error</title>' +
      '<style>' +
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f3f4f6; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }' +
      '.card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); width: 100%; max-width: 500px; }' +
      'h1 { margin-top: 0; color: #dc2626; font-size: 1.5rem; }' +
      'p { color: #374151; font-size: 0.875rem; }' +
      '.error { color: #dc2626; background: #fef2f2; padding: 1rem; border-radius: 6px; font-size: 0.875rem; border: 1px solid #f87171; overflow-wrap: break-word; }' +
      '</style>' +
      '</head>' +
      '<body>' +
      '<div class="card">' +
      '<h1>Gagal Terhubung ke Database</h1>' +
      '<p>Periksa file <strong>.env</strong> di root project dan pastikan DATABASE_URL, SUPABASE_URL, dan SUPABASE_KEY sudah benar.</p>' +
      '<div class="error"><strong>Error:</strong> ' + errorMsg + '</div>' +
      '</div>' +
      '</body>' +
      '</html>'
    );
  });

  var setupPort = process.env.PORT || 3000;
  setupApp.listen(setupPort, '0.0.0.0', function() {
    console.error('\n  ERROR: Gagal koneksi database.');
    console.error('  Periksa file .env di root project.');
    console.error('  Detail: ' + errorMsg + '\n');
  });
}

if (!process.env.VERCEL) {
  main().then(function(app) {
    var PORT = process.env.PORT || 3000;
    var server = http.createServer(app);

    server.listen(PORT, '0.0.0.0', function() {
      var os = require('os');
      var nets = os.networkInterfaces();
      var localIPs = [];
      for (var name of Object.keys(nets)) {
        for (var net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            localIPs.push(net.address);
          }
        }
      }

      console.log('\n====================================================');
      console.log('  SERVER KEUANGAN PDAM SERUYAN AKTIF');
      console.log('====================================================');
      console.log('  Lokal     : http://localhost:' + PORT);
      for (var i = 0; i < localIPs.length; i++) {
        console.log('  Jaringan  : http://' + localIPs[i] + ':' + PORT);
      }
      console.log('====================================================\n');
    });
  }).catch(function(err) {
    console.error('Gagal menjalankan server:', err.message);
    showErrorPage(err.message);
  });
}
