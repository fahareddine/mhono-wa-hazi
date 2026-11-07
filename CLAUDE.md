# mhono-wa-hazi

Application web statique (PWA : `manifest.json`, `sw.js`) sans étape de build. Firebase (`firebase-config.js`) pour les comptes et données, Cloudinary pour les images, fonctions serverless Vercel dans `api/`, espace admin dans `admin/`.

## Commandes
- Pas de `package.json` : tester via un serveur local (`npx serve .`).
- Déploiement : Vercel (`vercel.json`).

## Pièges
- Mode invité : compte auto-créé + numéro `MWH-2026-XXXXXX` avec anti-doublon — retester ce parcours après toute modif du formulaire.
- `seed.html` / `seed-suivi.html` écrivent des données de test : ne jamais les lancer contre la production.
- Après une modif de fichiers mis en cache, monter la version du service worker (`sw.js`).

## Règles communes
- Répondre et commenter en français.
- `main` = production (Vercel déploie automatiquement). Travailler sur une branche, vérifier l'aperçu Vercel de la PR, puis fusionner.
- Auteur Git : `fahareddine <179648486+fahareddine@users.noreply.github.com>`, sinon Vercel bloque le déploiement en production.
- Ne jamais commiter `.env*` (sauf `.env.example`). Les secrets vivent dans Vercel (`vercel env pull`).
