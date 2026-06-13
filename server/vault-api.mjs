// Local file-storage API, mounted into Vite's dev/preview server as middleware.
// Everything lives under vault-data/ in the project root:
//
//   vault-data/
//     state.json            — full app state (single source of truth)
//     MASTER-DOSSIER.md     — every contribution across all raids
//     raids/<slug>/
//       dossier.md          — per-protocol contribution record
//       media/              — uploaded proof screenshots
//
// Routes:
//   GET  /api/health        → { ok, root }
//   GET  /api/state         → saved state.json (404 if none yet)
//   PUT  /api/state         → { state, dossiers } — writes state + all dossiers
//   POST /api/upload        → { raidSlug, name, dataUrl } → saves file, returns url
//   GET  /vault-media/*     → serves files from vault-data/

import fs from 'node:fs';
import path from 'node:path';

const MAX_BODY = 64 * 1024 * 1024; // screenshots travel as base64 JSON

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
};

const sanitizeSlug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'raid';
const sanitizeName = (s) => path.basename(String(s ?? 'file')).replace(/[^\w.\- ()]+/g, '_') || 'file';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

export function createVaultApi(rootDir) {
  const root = path.resolve(rootDir);
  fs.mkdirSync(root, { recursive: true });

  // resolve a path inside vault-data, refusing anything that escapes it
  const safe = (...parts) => {
    const p = path.resolve(root, ...parts);
    if (p !== root && !p.startsWith(root + path.sep)) throw new Error('bad path');
    return p;
  };

  return async function vaultApi(req, res, next) {
    const url = (req.url || '').split('?')[0];
    try {
      if (url === '/api/health' && req.method === 'GET') {
        return json(res, 200, { ok: true, root });
      }

      if (url === '/api/state' && req.method === 'GET') {
        const file = safe('state.json');
        if (!fs.existsSync(file)) return json(res, 404, { none: true });
        res.setHeader('Content-Type', 'application/json');
        return res.end(fs.readFileSync(file, 'utf8'));
      }

      if (url === '/api/state' && req.method === 'PUT') {
        const { state, dossiers } = JSON.parse(await readBody(req));
        if (!state || state.version !== 1) return json(res, 400, { error: 'bad state' });
        fs.writeFileSync(safe('state.json'), JSON.stringify(state, null, 2));
        if (dossiers) {
          fs.writeFileSync(safe('MASTER-DOSSIER.md'), dossiers.master ?? '');
          for (const d of dossiers.raids ?? []) {
            const dir = safe('raids', sanitizeSlug(d.slug));
            fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
            fs.writeFileSync(path.join(dir, 'dossier.md'), String(d.md ?? ''));
          }
        }
        return json(res, 200, { ok: true });
      }

      // full reset: removes state, dossiers, and every protocol folder
      // (screenshots included) — the client writes a blank state right after
      if (url === '/api/wipe' && req.method === 'POST') {
        for (const f of ['state.json', 'MASTER-DOSSIER.md', 'raids']) {
          fs.rmSync(safe(f), { recursive: true, force: true });
        }
        return json(res, 200, { ok: true });
      }

      if (url === '/api/upload' && req.method === 'POST') {
        const { raidSlug, name, dataUrl } = JSON.parse(await readBody(req));
        const m = /^data:[^;,]*;base64,(.+)$/s.exec(String(dataUrl ?? ''));
        if (!m) return json(res, 400, { error: 'expected base64 data URL' });
        const buf = Buffer.from(m[1], 'base64');
        const slug = sanitizeSlug(raidSlug);
        const dir = safe('raids', slug, 'media');
        fs.mkdirSync(dir, { recursive: true });
        // keep existing files — dedupe with -1, -2, …
        let file = sanitizeName(name);
        const ext = path.extname(file);
        const base = file.slice(0, file.length - ext.length);
        for (let i = 1; fs.existsSync(path.join(dir, file)); i++) file = `${base}-${i}${ext}`;
        fs.writeFileSync(path.join(dir, file), buf);
        return json(res, 200, { ok: true, name: file, url: `/vault-media/raids/${slug}/media/${encodeURIComponent(file)}` });
      }

      if (url.startsWith('/vault-media/') && req.method === 'GET') {
        const rel = decodeURIComponent(url.slice('/vault-media/'.length));
        const file = safe(rel);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'not found' });
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
        return fs.createReadStream(file).pipe(res);
      }

      next();
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : 'server error' });
    }
  };
}
