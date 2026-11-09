# Site de démonstration (statique)

Une copie de la boutique **et** de l'administration qui fonctionne **sans serveur**, pour la montrer à des clients potentiels depuis un hébergement gratuit. Les visiteurs peuvent tout essayer : commander dans la boutique, confirmer la commande dans l'administration, vendre à la caisse, offrir un parfum de fidélité… Les données sont fictives et restent **dans le navigateur de chaque visiteur** (rien n'est partagé entre visiteurs, rien n'est envoyé nulle part).

Ce que le visiteur voit :

1. **Un écran de choix de langue** (Français / العربية), une seule fois. Le choix s'applique à la boutique, à l'administration et au guide. On peut en changer à tout moment (menu de la boutique ou barre latérale de l'administration).
2. **Un guide pas à pas** (bouton rond en bas) : 14 étapes qui emmènent le visiteur de la boutique au tableau de bord, aux commandes, à la caisse, aux clients et à la fidélité, au stock, aux bouteilles. « Suivant » change de page et ouvre la session tout seul.
3. **Une connexion sans mot de passe** : deux boutons, « Entrer comme propriétaire » et « Entrer comme employé » (l'employé n'a ni les bénéfices ni les prix d'achat).
4. Un bouton « Recommencer la démo » qui remet les données de départ. Les données repartent aussi de zéro (avec des dates fraîches) le lendemain.

Le nom (« Parfumerie Démo ») et le logo sont neutres : le site ne contient aucune trace du logo d'un client.

## Récupérer le site prêt à mettre en ligne

Le dossier prêt à l'emploi est dans `deploy/out/` : `demo-site-AAAA-MM-JJ-HHMM.zip` (à dézipper) ou le dossier `frontend/dist-demo/`. C'est un site statique : `index.html` + `assets/`. Il fonctionne depuis la racine d'un hébergement **ou depuis un sous-dossier** (adresses relatives, navigation par `#`).

Pour le reconstruire après une modification :

```bash
cd frontend
npm run build:demo        # écrit frontend/dist-demo/
```

(Sous Windows, pour le zip : `powershell -NoProfile -ExecutionPolicy Bypass -File deploy/zip-demo.ps1`.)

## Le mettre en ligne gratuitement

N'importe lequel de ces hébergeurs convient. Dans tous les cas on publie **le contenu de `dist-demo`** (pas le dossier parent).

**Netlify Drop (le plus simple, sans compte Git)**
1. Aller sur `https://app.netlify.com/drop` (un compte gratuit est demandé pour garder le site).
2. Glisser le dossier `dist-demo` dans la page. Le site est en ligne tout de suite, avec une adresse `xxxx.netlify.app` que l'on peut renommer dans *Site configuration → Change site name*.

**Cloudflare Pages**
1. `https://dash.cloudflare.com` → *Workers & Pages* → *Create* → *Pages* → *Upload assets*.
2. Nommer le projet, glisser le dossier `dist-demo`, *Deploy*. Adresse : `nom.pages.dev`.

**GitHub Pages**
1. Créer un dépôt (public) et y mettre le contenu de `dist-demo` (à la racine du dépôt, ou dans un dossier `docs/`).
2. *Settings → Pages* → *Deploy from a branch* → choisir la branche et `/ (root)` ou `/docs`.
3. Adresse : `https://votre-compte.github.io/nom-du-depot/`. Le site marche dans ce sous-dossier.

**Vercel** : *Add New → Project → importer un dépôt* qui contient `dist-demo`, ou `npx vercel --prod` depuis le dossier `dist-demo`.

Un domaine à vous (`demo.votre-domaine.com`) se branche ensuite dans les réglages de l'hébergeur (enregistrement CNAME).

## Personnaliser la démo

| Quoi | Où |
|---|---|
| Votre contact à la dernière étape du guide | `frontend/src/demo/tour.ts`, constante `DEMO_CONTACT` (ex. `'Contactez-moi : 05 50 12 34 56'`) |
| Textes du guide (français et arabe) | `frontend/src/demo/tour.ts` |
| Nom de la boutique de démo, téléphone, adresse | `frontend/src/demo/db.ts` (objet `settings`) et `frontend/src/i18n/ar.json` (`brand.name`) |
| Logo de démo | `frontend/public/brand-demo/*.svg` |
| Couleurs | `frontend/src/index.css` (la démo prend la palette grise du projet) |
| Produits, commandes, clients de départ | `backend/database/seeders/ShowcaseSeeder.php` + seeders du catalogue, puis régénérer les données (ci-dessous) |

## Régénérer les données de départ

Les données viennent de la vraie API Laravel, lancée sur **une base à part** (`perfume_shop_demo`) pour ne jamais toucher à votre base de travail. Depuis `backend/` (Git Bash, PHP de Herd dans le PATH) :

```bash
export DB_DATABASE=perfume_shop_demo ADMIN_USERNAME=admin ADMIN_PASSWORD=demo1234 SHOP_TYPES=
php artisan migrate:fresh --seed --force
for s in CosmeticSeeder AccessorySeeder PurchaseCostSeeder ShowcaseSeeder; do php artisan db:seed --class=$s --force; done
php serve.php 127.0.0.1 8001        # laisser tourner (autre terminal, avec les mêmes variables)
```

puis, depuis `frontend/` :

```bash
npm run demo:snapshot     # lit l'API sur http://127.0.0.1:8001 -> src/demo/data/snapshot.json
npm run build:demo
```

(La base `perfume_shop_demo` doit exister : `CREATE DATABASE perfume_shop_demo CHARACTER SET utf8mb4;`.) Le script de remplissage (`ShowcaseSeeder`) passe par les vrais services (stock, bouteilles, commandes, fidélité) avec l'horloge reculée de deux mois : les chiffres sont donc cohérents entre eux.

## Si l'API change

Le faux serveur du navigateur (`frontend/src/demo/routes.ts` et `engine.ts`) est le jumeau de l'API. Si une route ou une règle change dans Laravel, il faut changer sa copie là-bas, sinon la démo se comportera comme l'ancienne version. Les routes que la démo ne connaît pas répondent « n'est pas disponible dans la démo ».

## Limites connues

- L'import CSV est désactivé dans la démo (il répond par un message).
- Les photos que l'on ajoute sont gardées dans le navigateur du visiteur (réduites par l'application), pas ailleurs.
- Les tickets imprimés s'ouvrent comme dans la vraie application.
- Les noms de rayons et de familles sont traduits en arabe pour la démo ; les noms de produits et de marques restent tels quels.
