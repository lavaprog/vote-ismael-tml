const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'votes.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const COOLDOWN_MS = 90 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ voters: {}, votes: [] }, null, 2));

function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.voters || !Array.isArray(db.votes)) throw new Error('bad database');
    return db;
  } catch {
    return { voters: {}, votes: [] };
  }
}
function writeDb(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}
function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function cleanUsername(value) {
  if (typeof value !== 'string') return null;
  const username = value.trim().replace(/\s+/g, ' ');
  if (username.length < 2 || username.length > 24 || /[<>]/.test(username)) return null;
  return username;
}
function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
    const db = readDb();
    const counts = new Map();
    for (const vote of db.votes) counts.set(vote.usernameKey, (counts.get(vote.usernameKey) || 0) + 1);
    const result = [...counts.entries()].map(([key, votes]) => ({
      username: db.voters[key]?.username || key,
      votes
    })).sort((a, b) => b.votes - a.votes || a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' })).slice(0, 100);
    return send(res, 200, result);
  }

  if (req.method === 'POST' && url.pathname === '/api/vote') {
    let body;
    try { body = await readBody(req); }
    catch { return send(res, 400, { error: 'Données invalides.' }); }

    const username = cleanUsername(body.username);
    if (!username) return send(res, 400, { error: 'Pseudo invalide : 2 à 24 caractères, sans < ni >.' });

    const usernameKey = username.normalize('NFKC').toLocaleLowerCase('fr-FR');
    const now = Date.now();
    const db = readDb();
    const existing = db.voters[usernameKey];
    if (existing && now - existing.lastVoteAt < COOLDOWN_MS) {
      return send(res, 429, { error: 'Tu as déjà voté récemment.', retryAfterMs: COOLDOWN_MS - (now - existing.lastVoteAt) });
    }

    db.voters[usernameKey] = { username, lastVoteAt: now };
    db.votes.push({ usernameKey, createdAt: now });
    writeDb(db);
    return send(res, 200, { ok: true, username });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'Méthode non autorisée.' });
  }

  let requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(PUBLIC_DIR, '.' + requested);
  if (!file.startsWith(path.resolve(PUBLIC_DIR) + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) {
    return send(res, 403, { error: 'Accès interdit.' });
  }
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Fichier introuvable.', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'Content-Type': contentType(file), 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Vote Ismael TML disponible sur http://localhost:${PORT}`));
