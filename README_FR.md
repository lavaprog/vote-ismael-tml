# Vote Ismael TML — version simplifiée

Cette version utilise uniquement les modules intégrés à Node.js : pas besoin de `npm install`, Express ou de compilation C++.

## Démarrer sur Windows
1. Ouvre ce dossier dans l'Explorateur.
2. Clique dans la barre d'adresse, tape `cmd`, puis Entrée.
3. Lance `npm.cmd start` (ou `node server.js`).
4. Ouvre http://localhost:3000.

Le serveur crée automatiquement `data/votes.json` pour enregistrer les votes. Garde la fenêtre du terminal ouverte pendant le test.

## Mise en ligne
Il faut héberger ce serveur Node.js sur un service qui accepte les applications Node et configurer un disque/volume persistant pour conserver le dossier de données. Sur un hébergeur Linux, définis par exemple `DATA_DIR=/var/data` et attache un disque persistant à cet emplacement. Le simple fait de mettre les fichiers HTML en ligne ne suffit pas : les routes `/api/vote` et `/api/leaderboard` doivent aussi être hébergées.

Le délai de 90 minutes est appliqué par pseudo, pas par identité vérifiée : une personne peut le contourner en changeant de pseudo.
