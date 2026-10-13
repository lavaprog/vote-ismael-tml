const fs = require('fs');
const path = require('path');
const url = (process.env.VOTE_SITE_URL || '').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN || '';
const [command, ...args] = process.argv.slice(2);
const usage = `Commandes admin :
  node admin.js classement
  node admin.js stats
  node admin.js export
  node admin.js fermer
  node admin.js ouvrir
  node admin.js reset
  node admin.js ajouter-vote "Pseudo"
  node admin.js supprimer "Pseudo"
`;
if (!url || !token) {
  console.error('Configure VOTE_SITE_URL et ADMIN_TOKEN dans PowerShell.');
  console.error('$env:VOTE_SITE_URL="https://vote-ismael-tml.onrender.com"');
  console.error('$env:ADMIN_TOKEN="LA_MEME_CLE_QUE_DANS_RENDER"');
  process.exit(1);
}
const routes = {
  reset: ['/api/admin/reset-votes', {}],
  fermer: ['/api/admin/close-voting', {}],
  ouvrir: ['/api/admin/open-voting', {}],
  stats: ['/api/admin/stats', {}],
  classement: ['/api/admin/leaderboard', {}],
  export: ['/api/admin/export', {}],
  'ajouter-vote': ['/api/admin/add-vote', { username: args.join(' ') }],
  supprimer: ['/api/admin/remove-user', { username: args.join(' ') }]
};
if (!routes[command]) { console.log(usage); process.exit(command ? 1 : 0); }
(async () => {
  const [route, body] = routes[command];
  if (['ajouter-vote', 'supprimer'].includes(command) && (!body.username || body.username.length < 2)) {
    console.error(`Indique un pseudo. Exemple : node admin.js ${command} "Pseudo"`); process.exit(1);
  }
  const response = await fetch(`${url}${route}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { console.error(`Échec (${response.status}) : ${result.error || 'erreur inconnue'}`); process.exit(1); }
  if (command === 'export') {
    const file = path.join(process.cwd(), `export-votes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Export enregistré dans : ${file}`);
    console.log(`Total des votes : ${result.totalVotes}`);
  } else if (command === 'classement') {
    const rows = result.leaderboard || [];
    if (!rows.length) console.log('Aucun vote pour le moment.');
    rows.forEach((p, i) => console.log(`${String(i + 1).padStart(2, ' ')}. ${p.username} — ${p.votes} vote(s)`));
  } else if (command === 'stats') {
    console.log(`Votes au total : ${result.totalVotes}\nIP distinctes ayant voté : ${result.uniqueIpCount}\nParticipants au classement : ${result.participants}\nVotes ouverts : ${result.votingOpen ? 'oui' : 'non'}`);
  } else console.log(result.message || 'Commande terminée.');
})().catch(error => { console.error('Impossible de joindre le site :', error.message); process.exit(1); });
