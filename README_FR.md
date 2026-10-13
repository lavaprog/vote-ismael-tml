# Vote Ismael TML — version admin complète

## Protection des votes
- Une seule IP publique peut voter une fois jusqu’à la prochaine réinitialisation. L’IP est stockée sous forme de HMAC, pas en clair.
- Les votes admin ajoutés avec `ajouter-vote` augmentent le score mais ne simulent pas une nouvelle IP.
- Les commandes admin exigent `ADMIN_TOKEN`. Les votes publics exigent `IP_HASH_SECRET`. Garde les deux secrets privés et distincts.

## Commandes PowerShell
Dans le dossier contenant `admin.js`, configure une fois par nouvelle fenêtre PowerShell :

```powershell
$env:VOTE_SITE_URL="https://vote-ismael-tml.onrender.com"
$env:ADMIN_TOKEN="COLLE_ICI_LA_MEME_CLE_QUE_DANS_RENDER"
```

Puis utilise :

```powershell
node admin.js classement
node admin.js stats
node admin.js export
node admin.js fermer
node admin.js ouvrir
node admin.js reset
node admin.js ajouter-vote "Pseudo"
node admin.js supprimer "Pseudo"
```

- `classement` : affiche le classement actuel.
- `stats` : affiche le nombre de votes, IP distinctes, participants et état des votes.
- `export` : enregistre un export JSON dans le dossier courant.
- `fermer` / `ouvrir` : bloque ou autorise les nouveaux votes publics.
- `reset` : supprime tous les votes et rouvre les votes.
- `ajouter-vote "Pseudo"` : ajoute manuellement un vote au pseudo indiqué.
- `supprimer "Pseudo"` : retire tous ses votes et libère les IP connues associées aux votes publics supprimés.

## Déploiement sur Render
- Build Command : `npm install` (aucune dépendance externe nécessaire).
- Start Command : `npm start` ou `node server.js`.
- Variables Environment : `ADMIN_TOKEN` et `IP_HASH_SECRET`, chacune longue, aléatoire et différente.

## Conservation des données
Cette version stocke les données dans `data/votes.json`. Render Free n’offre pas de disque persistant garanti : les votes peuvent être perdus lors d’un redémarrage ou redéploiement. Pour un vote réel avec classement durable, configure une base de données persistante avant de partager largement le site.

## Limite du vote par IP
Plusieurs personnes peuvent partager une IP (Wi-Fi commun), et une même personne peut changer d’IP. Le vote par IP réduit les doublons mais ne garantit pas une personne unique.
