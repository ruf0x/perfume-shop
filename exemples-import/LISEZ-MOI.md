# Importer des produits avec un fichier CSV

Dans l'administration : **Importer** (menu Catalogue). Choisissez le modèle, envoyez le fichier, cliquez **Vérifier le fichier** : l'écran dit ce qui sera créé et ce qui est à corriger. Rien n'est enregistré avant que vous confirmiez.

## Les fichiers de ce dossier

| Fichier | Modèle | Contenu |
|---|---|---|
| `1-parfums-20.csv` | Parfums | 20 parfums (4 par famille : Designer, Niche, Arabe, Dupe, Création maison), avec prix, prix d'achat et stock |
| `2-autres-produits.csv` | Autres produits | 15 produits (cosmétiques, montres, lunettes) et leurs options |
| `3-test-erreurs-parfums.csv` | Parfums | 7 lignes avec des erreurs voulues, pour voir le rapport |
| `4-test-erreurs-autres-produits.csv` | Autres produits | 7 lignes avec des erreurs voulues, pour voir le rapport |

Les modèles vides à remplir sont dans l'écran d'import (« Télécharger le modèle »).

Ouvrez-les avec Excel. Pour enregistrer : *Enregistrer sous* → **CSV UTF-8 (délimité par des virgules)** ou *CSV (séparateur : point-virgule)*. Les deux marchent.

---

## Modèle Parfums : une ligne = un parfum

Les tailles sont des colonnes. Gardez seulement celles que vous vendez, ou ajoutez-en (`prix_50ml`).

**Titres (première ligne)**

```
nom;marque;famille;genre;description;notes_tete;notes_coeur;notes_fond;inspire_de;prix_10ml;prix_20ml;prix_30ml;prix_flacon_100ml;achat_10ml;achat_20ml;achat_30ml;achat_flacon_100ml;stock_ml;stock_flacon_100ml;actif
```

**Exemple d'une ligne**

```
Sauvage;Dior;Designer;homme;Frais et épicé;Bergamote;Poivre;Ambroxan;;1500;2800;4000;14000;1250;2333;3333;11667;400;3;oui
```

| Colonne | Dans l'exemple | Explication |
|---|---|---|
| `nom` | Sauvage | **Obligatoire.** |
| `marque` | Dior | Créée si elle n'existe pas. Peut rester vide. |
| `famille` | Designer | Créée si elle n'existe pas (Designer, Niche, Arabe, Dupe…). |
| `genre` | homme | `homme`, `femme` ou `mixte`. |
| `description`, `notes_tete`, `notes_coeur`, `notes_fond` | | Texte libre, facultatif. |
| `inspire_de` | | Pour un dupe : « Inspiré de Aventus – Creed ». |
| `prix_10ml`, `prix_20ml`, `prix_30ml` | 1500, 2800, 4000 | Prix de vente d'un décant, en DA. Une taille sans prix n'est pas créée. |
| `prix_flacon_100ml` | 14000 | Prix du flacon complet de 100 ml. |
| `achat_10ml`… `achat_flacon_100ml` | 1250… 11667 | Ce que chaque taille vous coûte (sert au bénéfice). Facultatif. |
| `stock_ml` | 400 | Millilitres à décanter en stock au départ. |
| `stock_flacon_100ml` | 3 | Flacons fermés de 100 ml en stock au départ. |
| `actif` | oui | `oui` (visible dans la boutique) ou `non`. Vide = oui. |

---

## Modèle Autres produits : une ligne = une option d'un produit

Cosmétiques, montres, lunettes… Un produit avec plusieurs options (tailles, teintes, couleurs) prend plusieurs lignes : celles qui ont le même **type + nom + marque** sont regroupées. La description et le genre se remplissent sur la première ligne du produit.

**Titres (première ligne)**

```
type;categorie;marque;nom;description;genre;option;prix;ancien_prix;achat;stock;actif
```

**Exemple d'une ligne**

```
Cosmétiques;Maquillage;Maybelline;Rouge à lèvres mat;Tenue longue durée;;Rose nude;1400;1600;1167;10;oui
```

| Colonne | Dans l'exemple | Explication |
|---|---|---|
| `type` | Cosmétiques | **Obligatoire.** Doit déjà exister (Cosmétiques, Montres, Lunettes…). |
| `categorie` | Maquillage | Créée si elle n'existe pas. |
| `marque` | Maybelline | Créée si elle n'existe pas. Peut rester vide. |
| `nom` | Rouge à lèvres mat | **Obligatoire.** |
| `description` | Tenue longue durée | Facultatif. |
| `genre` | (vide) | `homme`, `femme` ou `mixte`, pour les types qui en ont un (montres, lunettes). Inutile pour les cosmétiques. |
| `option` | Rose nude | **Obligatoire.** La taille, la teinte ou la couleur. |
| `prix` | 1400 | **Obligatoire.** Prix de vente en DA. |
| `ancien_prix` | 1600 | Prix barré, facultatif. |
| `achat` | 1167 | Prix d'achat, facultatif. |
| `stock` | 10 | Quantité en stock au départ. |
| `actif` | oui | `oui` ou `non`. Vide = oui. |

---

## Bon à savoir

- Les prix sont des nombres entiers en DA : `1500`, `1 500` ou `1500 DA`.
- Un produit qui existe déjà (même type, même nom, même marque) est ignoré, jamais modifié.
- Une ligne avec un problème est signalée avec son numéro ; les autres lignes sont quand même importées.
- Les stocks de départ sont notés « Import CSV » dans l'historique du stock.
- 2000 lignes au maximum par fichier.
