# Application de bureau (Electron)

L'administration de la boutique (commandes, caisse, stock, produits, paramètres) dans une fenêtre Windows, sans navigateur.
Ce sont les mêmes écrans que sur le site : le même code est embarqué dans l'application.

## Utiliser l'application

1. Installez `Administration-Boutique-Setup-1.0.0.exe` (fabriqué avec `npm run dist`, voir plus bas).
2. Au premier lancement, indiquez l'adresse du serveur de la boutique, par exemple `https://api.arena-cosmetique.com`. Elle est vérifiée, puis mémorisée.
3. Connectez-vous avec le même identifiant et le même mot de passe que sur le site.

Ce qu'il faut savoir :
- La connexion est mémorisée **30 jours**, chiffrée par Windows. « Se déconnecter » l'efface. Pour changer de serveur : menu Fichier, « Changer de serveur… ».
- L'impression des tickets de caisse et des bordereaux ouvre la fenêtre d'impression de Windows, comme sur le site.
- L'application fonctionne **même quand l'administration du site web est désactivée** (le réglage `web_admin` du fichier `backend/config/features.php`, `false` = application de bureau seulement).

## Fabriquer l'application (développeur)

Dans ce dossier :

```powershell
npm install        # une fois
npm start          # construit l'administration puis ouvre l'application
npm run dev        # ouvre l'application sans reconstruire l'administration
npm run dist       # fabrique l'installateur dans dist\
```

- `npm run web` (appelé par `start` et `dist`) construit le frontend et le copie dans `desktop\web`. À refaire après toute modification du frontend.
- `SHOP_API_URL=http://localhost:8000` présélectionne le serveur (utile en développement). `SHOP_DESKTOP_DATA=<dossier>` déplace les données de l'application (réglages, jeton).
- `app.config.json` : le nom du produit et, si vous le souhaitez, une adresse de serveur livrée avec l'application (`apiUrl`). Vide = l'application la demande.
- L'installateur n'est **pas signé** : Windows peut afficher « éditeur inconnu » (SmartScreen) à l'installation. Il faut un certificat de signature de code pour l'éviter.

## Sécurité

- La page n'a aucun accès à Node ni au disque (`contextIsolation`, `sandbox`). Elle ne peut demander que cinq choses à l'application (voir `src/preload.js`), et chaque demande est revérifiée.
- La page ne peut pas quitter l'application : tout lien web s'ouvre dans le navigateur de Windows.
- Le serveur doit être en `https://` (seul `http://localhost` est accepté, pour les essais).
- Le jeton de connexion est chiffré avec `safeStorage` (Windows DPAPI) et n'est jamais écrit en clair.
