// Servidor HTTP simples para servir PWA com suporte WASM correto
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const DIST_DIR = path.join(__dirname, 'dist');

// MIME types simples
const getMimeType = (ext) => {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.ico': 'image/x-icon',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

const server = http.createServer((req, res) => {
  // Ignorar requisições do DevTools e outras ferramentas
  if (req.url && (
    req.url.includes('.well-known') ||
    req.url.includes('devtools') ||
    req.url.includes('chrome-extension')
  )) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  
  let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Remover query string
  filePath = filePath.split('?')[0];
  
  const ext = path.extname(filePath);
  const isWasm = ext === '.wasm';
  const isJs = ext === '.js' || ext === '.mjs';
  const isCss = ext === '.css';
  const isAsset = ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.svg' || ext === '.ico' || ext === '.json';
  
  // Verificar se arquivo existe
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // IMPORTANTE: Para arquivos WASM, tentar também em assets/ antes de dar 404
    if (isWasm) {
      // Tentar em assets/ se não encontrou na raiz
      const wasmInAssets = path.join(DIST_DIR, 'assets', path.basename(filePath));
      if (fs.existsSync(wasmInAssets) && fs.statSync(wasmInAssets).isFile()) {
        filePath = wasmInAssets;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('WASM file not found: ' + req.url);
        console.error('❌ WASM file not found:', req.url, 'Tried:', filePath, 'and', wasmInAssets);
        return;
      }
    } else if (isJs || isCss || isAsset) {
      // Para arquivos JS, CSS e assets, retornar 404 se não existir
      // NÃO redirecionar para index.html para evitar "Unexpected token '<'"
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found: ' + req.url);
      console.error('❌ File not found:', req.url);
      return;
    } else {
      // Para outros arquivos (HTML, rotas SPA), tentar index.html (SPA routing)
      filePath = path.join(DIST_DIR, 'index.html');
    }
  }

  const contentType = getMimeType(ext);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ Servidor PWA rodando em http://localhost:${PORT}`);
  console.log(`📁 Servindo arquivos de: ${DIST_DIR}\n`);
  console.log('⚠️  IMPORTANTE: Use Chrome ou Edge para impressão USB\n');
});
