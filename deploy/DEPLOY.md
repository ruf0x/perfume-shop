# Mise en ligne d'Roze Sham (cPanel)

Hébergement : plan Starter-20 (cPanel 138, en anglais, LiteSpeed), compte `<compte-cpanel>`, domaine `votre-domaine.com`.
Les noms de menus ci-dessous sont ceux de **votre** cPanel (anglais). Utilisez la barre **Search Tools** en haut pour les retrouver.

| Adresse | Contenu | Dossier sur le serveur |
|---|---|---|
| `https://votre-domaine.com` | la boutique et `/admin` | `public_html/` |
| `https://api.votre-domaine.com` | l'API Laravel | `laravel/public/` (le code est **hors** de `public_html`) |

Les mots de passe ne sont écrits nulle part dans ce dépôt. Ne les mettez jamais dans Git.

---

## 0. Sur votre PC : fabriquer les deux paquets

À la racine du projet, dans PowerShell :

```powershell
.\deploy\build-frontend.ps1 -ApiUrl https://api.votre-domaine.com
.\deploy\package-backend.ps1 -WithVendor
```

Cela crée dans `deploy\out\` :
- `frontend-AAAA-MM-JJ-HHMM.zip` (la boutique, avec son `.htaccess`)
- `backend-AAAA-MM-JJ-HHMM-with-vendor.zip` (l'API avec ses bibliothèques de production)

Aucun des deux ne contient votre `.env`, vos tests ni vos photos de test.

## 1. Sécuriser le compte

1. **Password & Security** (en bas de la page d'accueil, section Preferences) : changez le mot de passe du compte. Il a été partagé dans une conversation, considérez-le comme compromis.
2. **File Manager → Settings** (en haut à droite) : cochez **Show Hidden Files (dotfiles)**. Sans cela, vous ne verrez pas `.htaccess` ni `.env`.

## 2. PHP 8.4 : « Select PHP Version »

1. **Software → Select PHP Version** : choisissez **8.4** puis **Set as current**.
2. Onglet **Extensions** : cochez `gd`, `mbstring`, `pdo_mysql`, `mysqli`, `fileinfo`, `xml`, `dom`, `zip`, `curl`, `openssl`, `tokenizer`, `ctype`, `iconv`, `intl`.
3. Onglet **Options** : `upload_max_filesize = 20M`, `post_max_size = 25M`, `memory_limit = 256M`.

## 3. Sous-domaine de l'API : « Domains »

**Domains → Create A New Domain** :
- Domain : `api.votre-domaine.com`
- **Décochez** « Share document root » si la case existe.
- Document Root : `laravel/public`

Si cPanel ajoute `public_html/` devant, ouvrez **Manage** sur ce domaine et corrigez la racine : elle doit être `/home/<compte-cpanel>/laravel/public` (et non `public_html/api`). Le dossier `laravel` sera créé à l'étape 6.

## 4. Certificats SSL

Votre domaine principal montre déjà **SSL : Active**. Pour `api` et `www` : **Security → SSL/TLS Certificates** (ou cherchez « SSL/TLS Status ») → lancez **Run AutoSSL**, puis vérifiez que `api.votre-domaine.com` a un cadenas. Le `.htaccess` de la boutique force le HTTPS : sans certificat, le site serait inaccessible.

## 5. Base de données : « Database Wizard »

**Databases → Database Wizard** :
1. Nom de la base : `arena` (devient `<compte>_roze`).
2. Utilisateur : `arena` (devient `<compte>_roze`), mot de passe long (notez-le pour le `.env`).
3. Privilèges : **ALL PRIVILEGES**.

## 6. Envoyer l'API : « File Manager »

1. Racine `/home/<compte-cpanel>` → **+ Folder** : `laravel`, puis `backups`.
2. Dans `laravel/` : **Upload** `backend-...-with-vendor.zip`, clic droit → **Extract**, puis supprimez le zip.
3. Vérifiez que `laravel/artisan`, `laravel/vendor/` et `laravel/public/index.php` existent (pas de dossier `backend` en trop).
4. Dans `laravel/` : **+ File** `.env`, puis **Edit** : collez `deploy/env.production.example` en remplaçant les `<...>` (mot de passe de la base, mot de passe admin).
5. Permissions : `laravel/storage` et `laravel/bootstrap/cache` en **755** (clic droit → Change Permissions, récursif).

## 7. Lancer les commandes `artisan`

Votre cPanel **n'a pas d'icône « Terminal »**. Deux solutions :

### Solution A (recommandée) : SSH depuis votre PC

1. **Security → SSH Access** : regardez l'adresse et le **port** SSH indiqués (souvent 22). Si une clé est demandée : **Manage SSH Keys → Generate a New Key**, puis **Authorize**.
2. Dans le terminal de votre PC (ce mot de passe, vous le tapez vous-même) :

```bash
ssh <compte-cpanel>@157.90.66.113
```
(ajoutez `-p PORT` si le port n'est pas 22)

3. Trouvez PHP 8.4 (CloudLinux le met dans `/opt/alt`) :

```bash
PHP=$(ls /opt/alt/php84/usr/bin/php /opt/cpanel/ea-php84/root/usr/bin/php 2>/dev/null | head -1); echo "$PHP"; $PHP -v
cd ~/laravel
```

4. Puis :

```bash
$PHP artisan key:generate --force
$PHP artisan migrate --force
$PHP artisan db:seed --force
$PHP artisan storage:link
```

### Solution B (si SSH est désactivé) : via « Cron Jobs »

**Advanced → Cron Jobs → Add New Cron Job**, réglée pour s'exécuter dans 2 minutes (mettez l'heure et la minute à venir, le reste en `*`) :

```
cd /home/<compte-cpanel>/laravel && /opt/alt/php84/usr/bin/php artisan migrate --force > /home/<compte-cpanel>/setup.log 2>&1
```

Ouvrez ensuite `setup.log` dans File Manager pour lire le résultat, puis **supprimez** cette ligne cron. Recommencez pour chaque commande de la liste ci-dessus (`key:generate --force`, `migrate --force`, `db:seed --force`, `storage:link`). Si `/opt/alt/php84/usr/bin/php` n'existe pas, `setup.log` le dira : envoyez-moi le message.

`db:seed` crée les 69 wilayas, les familles de parfums et **votre compte administrateur** (identifiant `ADMIN_USERNAME`, mot de passe `ADMIN_PASSWORD` du `.env`).
Aucun parfum de démonstration n'est créé en production : vous ajouterez les vrais.

## 8. Retirer le mot de passe admin du `.env`, puis optimiser

1. Ouvrez `laravel/.env` et **supprimez la ligne `ADMIN_PASSWORD=...`** (le compte existe déjà ; il se change ensuite dans l'application).
2. Puis (SSH, ou cron comme ci-dessus) :

```bash
$PHP artisan optimize
```

`optimize` met la configuration en cache : faites-le **après** avoir retiré le mot de passe.

## 9. Tâche planifiée (sauvegarde hebdomadaire)

**Advanced → Cron Jobs → Add New Cron Job**, **chaque minute** (`* * * * *`) :

```
/opt/alt/php84/usr/bin/php /home/<compte-cpanel>/laravel/artisan schedule:run >> /dev/null 2>&1
```

Laravel décide seul ce qui doit tourner : la sauvegarde de la base a lieu **le dimanche à 3 h** dans `/home/<compte-cpanel>/backups` (8 copies gardées). Testez-la une fois à la main (SSH) :

```bash
$PHP artisan db:backup
ls ~/backups
```

Téléchargez de temps en temps ces fichiers sur votre PC. L'hébergeur a aussi des sauvegardes (**Backup**, **JetBackup 5**), mais ne vous y fiez pas seul.

## 10. Envoyer la boutique

1. **File Manager** → `public_html/` : supprimez les fichiers par défaut (`index.html`, `default.php`...). Gardez `cgi-bin`.
2. **Upload** `frontend-...zip` dans `public_html/`, clic droit → **Extract**, supprimez le zip.
3. Vérifiez la présence de `public_html/index.html`, `public_html/assets/` et **`public_html/.htaccess`**.

## 11. Vérifier

1. `https://api.votre-domaine.com/api/settings/public` → du JSON avec « Roze Sham ».
2. `https://votre-domaine.com` → la boutique s'affiche. Rechargez sur `/boutique` : pas d'erreur 404.
3. `https://votre-domaine.com/admin` → page de connexion. Connectez-vous (`admin` + le mot de passe du `.env`).
4. Dans l'admin :
   - **Paramètres** : ajoutez le **téléphone** de la boutique et vérifiez les frais de livraison par wilaya.
   - **Produits** : créez un parfum de test avec une photo, vérifiez qu'il apparaît dans la boutique, puis supprimez-le.
   - Passez **une commande de test** depuis la boutique, confirmez-la dans l'admin, puis annulez-la.
5. Vérifiez que `https://api.votre-domaine.com/.env` et `https://api.votre-domaine.com/docs/api` donnent une erreur (jamais le contenu).

## 12. Mettre à jour plus tard

- **Boutique** : refaites `build-frontend.ps1`, téléversez et extrayez le zip dans `public_html/` en écrasant.
- **API** : refaites `package-backend.ps1 -WithVendor`, extrayez dans `laravel/` en écrasant (votre `.env` et vos photos ne sont pas dans le zip, ils restent). Puis :

```bash
cd ~/laravel
$PHP artisan migrate --force
$PHP artisan optimize:clear && $PHP artisan optimize
```

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Erreur 500 sur l'API | Voir `laravel/storage/logs/laravel-AAAA-MM-JJ.log`. Souvent : mauvaise version de PHP (pas 8.4), extension manquante, `.env` absent ou permissions de `storage`. |
| « API injoignable » ou erreur 419 à la connexion | `SESSION_DOMAIN` doit être `.votre-domaine.com`, `SANCTUM_STATEFUL_DOMAINS` et `CORS_ALLOWED_ORIGINS` doivent contenir le domaine exact. Après modification : `$PHP artisan optimize:clear && $PHP artisan optimize`. |
| Page blanche ou 404 au rechargement | `public_html/.htaccess` manquant (fichier caché). |
| Photos qui ne s'affichent pas | `storage:link` pas fait, ou `APP_URL` incorrect. |
| Photos qui ne se téléversent pas | `upload_max_filesize` / `post_max_size` trop bas (étape 2, onglet Options). |
| Impossible de se connecter à l'admin | Le seeder n'a pas été lancé, ou `ADMIN_PASSWORD` était vide. Remettez-le, lancez `$PHP artisan db:seed --force --class=AdminSeeder`, puis retirez-le à nouveau. Attention : relancer ce seeder **remet** le mot de passe du `.env` pour ce compte. |

---

## 13. Mise à jour : types de produits, cosmétiques et application de bureau

À faire quand vous envoyez la nouvelle version de l'API. La base du serveur est migrée toute seule : vos parfums, leurs familles et leurs marques sont conservés (ils passent dans un type « Parfums »).

1. **Sauvegardez la base d'abord.** Cron Jobs, une ligne « Once Per Minute », puis supprimez-la après une minute. Téléchargez le fichier créé dans `/home/<compte-cpanel>/backups` :

```
(cd /home/<compte-cpanel>/laravel && /opt/alt/php84/usr/bin/php artisan db:backup) > /home/<compte-cpanel>/setup.log 2>&1
```

2. **Ajoutez une ligne dans `laravel/.env`** (File Manager, Edit) : les types que vend la boutique. Sans elle, les types « Montres » et « Lunettes » seraient créés aussi.

```
SHOP_TYPES=parfums,cosmetiques
```

3. **Envoyez le zip de l'API** dans `laravel/` (Upload, Extract en écrasant), comme à l'étape 6. Le `.env` et les photos ne sont pas touchés.
4. **Lancez la mise à jour** (Cron Jobs, une ligne à usage unique, puis lisez `setup.log` et supprimez la ligne) :

```
(cd /home/<compte-cpanel>/laravel && /opt/alt/php84/usr/bin/php artisan migrate --force && /opt/alt/php84/usr/bin/php artisan db:seed --class=ProductTypeSeeder --force && /opt/alt/php84/usr/bin/php artisan optimize:clear && /opt/alt/php84/usr/bin/php artisan optimize) > /home/<compte-cpanel>/setup.log 2>&1
```

   Le log doit montrer quatre `DONE` de migrations puis les caches (config, events, routes, views) en `DONE`.
5. **Envoyez le zip de la boutique** dans `public_html/` (Upload, Extract en écrasant), comme à l'étape 10.
6. **Vérifiez** : `https://api.votre-domaine.com/api/product-types` répond avec « Parfums » et « Cosmétiques », puis `https://votre-domaine.com/admin` fonctionne.

### Administration sur le site web, oui ou non

C'est une ligne dans `laravel/config/features.php` : `'web_admin' => true,` (le site et l'application de bureau) ou `false` (application de bureau seulement). Après modification, relancez `optimize:clear` puis `optimize` (même ligne cron que ci-dessus, sans `migrate`). L'application de bureau fonctionne dans les deux cas.

### Application de bureau

L'installateur `desktop\dist\Administration-Boutique-Setup-1.0.0.exe` est déjà réglé sur `https://api.votre-domaine.com` : il s'ouvre directement sur la connexion. Elle lit et écrit les mêmes données que le site, **par l'API** (jamais directement dans MySQL). Ne servez pas la base à distance : ne l'ouvrez pas à internet dans cPanel (« Remote Database Access »).
