import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT || 8080);
const ROOT = process.cwd();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function safePath(urlPath) {
  const trimmed = urlPath.split('?')[0].split('#')[0];
  const decoded = decodeURIComponent(trimmed === '/' ? '/index.html' : trimmed);
  const normalized = normalize(decoded).replace(/^\\+|^\/+/g, '');
  return join(ROOT, normalized);
}

createServer(async (req, res) => {
  const path = safePath(req.url || '/');

  try {
    const fileStat = await stat(path);
    const finalPath = fileStat.isDirectory() ? join(path, 'index.html') : path;
    const ext = extname(finalPath);

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });

    createReadStream(finalPath).pipe(res);
  } catch {
    try {
      const notFound = await readFile(join(ROOT, 'index.html'), 'utf8');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(notFound);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  }
}).listen(PORT, () => {
  console.log(`Static server running at http://localhost:${PORT}`);
});
