const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'votes.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const IP_HASH_SECRET = process.env.IP_HASH_SECRET || '';

if (!ADMIN_TOKEN) console.warn('ATTENTION: ADMIN_TOKEN absent : les commandes admin seront refusées.');
if (!IP_HASH_SECRET) console.warn('ATTENTION: IP_HASH_SECRET absent : les votes publics seront désactivés.');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ voters: {}, votes: [], votedIps: {}, votingOpen: true }, null, 2));

function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.voters || !Array.isArray(db.votes)) throw new Error('bad database');
    if (!db.votedIps) db.votedIps = {};
    if (typeof db.votingOpen !== 'boolean') db.votingOpen = true;
    return db;
  } catch { return { voters: {}, votes: [], votedIps: {}, votingOpen: true }; }
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
      if (body.length > 100_000) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}
function cleanUsername(value) {
  if (typeof value !== 'string') return null;
  const username = value.trim().replace(/\s+/g, ' ');
  if (username.length < 2 || username.length > 24 || /[<>]/.test(username)) return null;
  return username;
}
function usernameKey(value) { return value.normalize('NFKC').toLocaleLowerCase('fr-FR'); }
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}
function hashIp(ip) { return IP_HASH_SECRET ? crypto.createHmac('sha256', IP_HASH_SECRET).update(ip).digest('hex') : null; }
function getLeaderboard(db) {
  const counts = new Map();
  for (const vote of db.votes) counts.set(vote.usernameKey, (counts.get(vote.usernameKey) || 0) + 1);
  return [...counts.entries()].map(([key, votes]) => ({ username: db.voters[key]?.username || key, votes }))
    .sort((a, b) => b.votes - a.votes || a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' })).slice(0, 100);
}
function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}
function authorized(req) { return !!ADMIN_TOKEN && req.headers.authorization === `Bearer ${ADMIN_TOKEN}`; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });

  if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
    const db = readDb();
    return send(res, 200, { leaderboard: getLeaderboard(db), votingOpen: db.votingOpen });
  }

  if (req.method === 'POST' && url.pathname === '/api/vote') {
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: 'Données invalides.' }); }
    const username = cleanUsername(body.username);
    if (!username) return send(res, 400, { error: 'Pseudo invalide : 2 à 24 caractères, sans < ni >.' });
    const ipHash = hashIp(clientIp(req));
    if (!ipHash) return send(res, 503, { error: 'Le site doit être configuré par l’administrateur avant de recevoir des votes.' });
    const db = readDb();
    if (!db.votingOpen) return send(res, 403, { error: 'Les votes sont actuellement fermés par l’administrateur.' });
    if (db.votedIps[ipHash]) return send(res, 409, { error: 'Cette adresse IP a déjà voté. Un seul vote est autorisé par IP.' });
    const key = usernameKey(username);
    const now = Date.now();
    db.voters[key] = { username };
    db.votes.push({ usernameKey: key, createdAt: now, ipHash, source: 'public' });
    db.votedIps[ipHash] = { createdAt: now };
    writeDb(db);
    return send(res, 200, { ok: true, username });
  }

  if (req.method.startsWith('POST') && url.pathname.startsWith('/api/admin/')) {
    if (!authorized(req)) return send(res, 401, { error: 'Non autorisé. Vérifie ADMIN_TOKEN.' });
    const action = url.pathname.slice('/api/admin/'.length);
    if (action === 'reset-votes') {
      writeDb({ voters: {}, votes: [], votedIps: {}, votingOpen: true });
      console.log('Admin : votes réinitialisés et vote rouvert.');
      return send(res, 200, { ok: true, message: 'Votes réinitialisés et vote rouvert.' });
    }
    if (action === 'close-voting' || action === 'open-voting') {
      const db = readDb(); db.votingOpen = action === 'open-voting'; writeDb(db);
      return send(res, 200, { ok: true, message: db.votingOpen ? 'Votes ouverts.' : 'Votes fermés.' });
    }
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: 'Données invalides.' }); }
    if (action === 'add-vote') {
      const username = cleanUsername(body.username);
      if (!username) return send(res, 400, { error: 'Pseudo invalide : 2 à 24 caractères.' });
      const db = readDb(); const key = usernameKey(username); const now = Date.now();
      db.voters[key] = { username };
      db.votes.push({ usernameKey: key, createdAt: now, source: 'admin' });
      writeDb(db);
      console.log(`Admin : +1 vote pour ${username}.`);
      return send(res, 200, { ok: true, message: `1 vote admin ajouté pour ${username}.` });
    }
    if (action === 'remove-user') {
      const username = cleanUsername(body.username);
      if (!username) return send(res, 400, { error: 'Pseudo invalide : 2 à 24 caractères.' });
      const db = readDb(); const key = usernameKey(username);
      const before = db.votes.length;
      const removed = db.votes.filter(v => v.usernameKey === key);
      db.votes = db.votes.filter(v => v.usernameKey !== key);
      delete db.voters[key];
      // Libère les IP connues associées aux votes supprimés pour leur permettre de revoter.
      for (const vote of removed) if (vote.ipHash) delete db.votedIps[vote.ipHash];
      writeDb(db);
      return send(res, 200, { ok: true, message: `${before - db.votes.length} vote(s) retiré(s) pour ${username}.` });
    }
    if (action === 'stats') {
      const db = readDb();
      return send(res, 200, { ok: true, totalVotes: db.votes.length, uniqueIpCount: Object.keys(db.votedIps).length, participants: getLeaderboard(db).length, votingOpen: db.votingOpen });
    }
    if (action === 'export') {
      const db = readDb();
      const exported = { exportedAt: new Date().toISOString(), votingOpen: db.votingOpen, totalVotes: db.votes.length, leaderboard: getLeaderboard(db), votes: db.votes };
      return send(res, 200, exported);
    }
    if (action === 'leaderboard') return send(res, 200, { ok: true, leaderboard: getLeaderboard(readDb()) });
    return send(res, 404, { error: 'Commande admin inconnue.' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Méthode non autorisée.' });
  let requested;
  try { requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
  catch { return send(res, 400, 'Chemin invalide.', 'text/plain; charset=utf-8'); }
  const file = path.resolve(PUBLIC_DIR, '.' + requested);
  if (!file.startsWith(path.resolve(PUBLIC_DIR) + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) return send(res, 403, { error: 'Accès interdit.' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Fichier introuvable.', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'Content-Type': contentType(file), 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  });
});
server.listen(PORT, () => console.log(`Vote Ismael TML disponible sur le port ${PORT}`));
