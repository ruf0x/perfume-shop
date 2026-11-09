<?php

use App\Enums\ProductKind;
use App\Models\Brand;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Models\ProductType;
use Illuminate\Http\UploadedFile;

beforeEach(function () {
    $this->owner = makeOwner();
    $this->actingAs($this->owner);
    $this->perfumes = productType('Parfums', ProductKind::Perfume, true);
    $this->cosmetics = productType('Cosmétiques', ProductKind::Standard, false);
    $this->watches = productType('Montres', ProductKind::Standard, true);
});

/** Upload a CSV given as text (or the path of one of the shipped models). */
function importCsv($test, string $format, string $content, bool $commit = false)
{
    $file = UploadedFile::fake()->createWithContent('import.csv', $content);

    return $test->post('/api/admin/imports/products', ['file' => $file, 'format' => $format, 'commit' => $commit ? 1 : 0], ['Accept' => 'application/json']);
}

function model(string $name): string
{
    return file_get_contents(resource_path("import/{$name}"));
}

// ───────────────────────────── the shipped models ─────────────────────────────

it('imports the shipped perfume model: products, sizes, purchase prices and starting stock', function () {
    $res = importCsv($this, 'perfumes', model('modele-parfums.csv'), commit: true)->assertOk();

    expect($res->json('data.created'))->toHaveCount(5)->and($res->json('data.errors'))->toBe([])->and($res->json('data.skipped'))->toBe([]);

    $sauvage = Product::where('name', 'Sauvage')->firstOrFail()->load('variants', 'brand', 'type');
    expect($sauvage->kind)->toBe(ProductKind::Perfume)
        ->and($sauvage->brand->name)->toBe('Dior')->and($sauvage->type->name)->toBe('Designer')->and($sauvage->gender->value)->toBe('homme')
        ->and($sauvage->variants)->toHaveCount(4)
        ->and($sauvage->variants->pluck('label')->all())->toBe(['10 ml', '20 ml', '30 ml', 'Flacon complet 100 ml'])
        ->and($sauvage->variants->firstWhere('label', '10 ml')->price)->toBe(1500)
        ->and($sauvage->variants->firstWhere('label', '10 ml')->cost_price)->toBe(1250)
        ->and($sauvage->variants->firstWhere('label', 'Flacon complet 100 ml')->stock_qty)->toBe(3)
        ->and($sauvage->stock_ml)->toBe(400)
        ->and($sauvage->notes_top)->toBe('Bergamote');

    $dupe = Product::where('name', 'Club de Nuit Intense')->firstOrFail()->load('variants');
    expect($dupe->inspired_by)->toBe('Inspiré de Aventus – Creed')->and($dupe->variants->firstWhere('label', 'Flacon complet 100 ml')->stock_qty)->toBe(0);
    expect(Brand::count())->toBe(5)->and(PerfumeType::whereIn('name', ['Designer', 'Niche', 'Arabe', 'Dupe'])->count())->toBe(4);
});

it('imports the shipped model of the other products: rows of one product become its options', function () {
    $res = importCsv($this, 'options', model('modele-autres-produits.csv'), commit: true)->assertOk();

    expect($res->json('data.created'))->toHaveCount(3)->and($res->json('data.errors'))->toBe([]);

    $creme = Product::where('name', 'Crème corps hydratante')->firstOrFail()->load('variants');
    expect($creme->kind)->toBe(ProductKind::Standard)->and($creme->product_type_id)->toBe($this->cosmetics->id)
        ->and($creme->variants->pluck('label')->all())->toBe(['250 ml', '400 ml'])
        ->and($creme->variants->firstWhere('label', '250 ml')->stock_qty)->toBe(10)
        ->and($creme->variants->firstWhere('label', '250 ml')->cost_price)->toBe(750)
        ->and($creme->gender)->toBeNull();

    $rouge = Product::where('name', 'Rouge à lèvres mat')->firstOrFail()->load('variants');
    expect($rouge->variants->firstWhere('label', 'Rose nude')->compare_at_price)->toBe(1600);

    $watch = Product::where('name', 'G-Shock GA-2100')->firstOrFail();
    expect($watch->product_type_id)->toBe($this->watches->id)->and($watch->gender->value)->toBe('homme')->and($watch->variants()->count())->toBe(2);
});

it('downloads both models', function () {
    $this->get('/api/admin/imports/templates/perfumes')->assertOk()->assertDownload('modele-parfums.csv');
    $this->get('/api/admin/imports/templates/options')->assertOk()->assertDownload('modele-autres-produits.csv');
    $this->get('/api/admin/imports/templates/other')->assertNotFound();
});

// ───────────────────────────── preview, duplicates, errors ─────────────────────────────

it('previews without saving anything, then imports the same thing', function () {
    $preview = importCsv($this, 'perfumes', model('modele-parfums.csv'))->assertOk();

    expect($preview->json('data.committed'))->toBeFalse()->and($preview->json('data.created'))->toHaveCount(5)
        ->and(Product::count())->toBe(0)->and(Brand::count())->toBe(0)->and(PerfumeType::count())->toBe(0);

    $real = importCsv($this, 'perfumes', model('modele-parfums.csv'), commit: true)->assertOk();
    expect($real->json('data.created'))->toHaveCount(5)->and(Product::count())->toBe(5);
});

it('skips a product that already exists instead of changing it', function () {
    importCsv($this, 'perfumes', model('modele-parfums.csv'), commit: true)->assertOk();
    Product::where('name', 'Sauvage')->first()->variants()->where('label', '10 ml')->update(['price' => 1111]);

    $again = importCsv($this, 'perfumes', model('modele-parfums.csv'), commit: true)->assertOk();

    expect($again->json('data.created'))->toBe([])->and($again->json('data.skipped'))->toHaveCount(5)->and(Product::count())->toBe(5)
        ->and(Product::where('name', 'Sauvage')->first()->variants()->where('label', '10 ml')->value('price'))->toBe(1111);
});

it('reports the lines with a problem and still imports the others', function () {
    $csv = "nom;marque;prix_10ml;prix_flacon_100ml;stock_ml\n"
        ."Bon parfum;Dior;1500;14000;100\n"
        .";Dior;1500;;\n"                       // no name
        ."Prix faux;Dior;abc;;\n"               // a price that is not a number
        ."Sans prix;Dior;;;\n"                  // no price at all
        ."Autre bon;;1200;;50\n";

    $res = importCsv($this, 'perfumes', $csv, commit: true)->assertOk();

    expect($res->json('data.created'))->toHaveCount(2)
        ->and(collect($res->json('data.errors'))->pluck('line')->all())->toBe([3, 4, 5])
        ->and($res->json('data.errors.1.message'))->toContain('Montant invalide')
        ->and(Product::pluck('name')->all())->toBe(['Bon parfum', 'Autre bon']);
});

it('reads the file as Excel saves it: commas or semicolons, odd headers, prices with spaces', function () {
    $csv = "Nom,Marque,Famille,Genre,Prix 10 ml,Achat 10 ml,Prix Flacon 100 ML,Stock ML\n"
        ."Oud Royal,Maison X,Niche,Femme,\"1 500\",\"1 000 DA\",\"22 000,00\",250\n";

    $res = importCsv($this, 'perfumes', $csv, commit: true)->assertOk();

    $p = Product::where('name', 'Oud Royal')->firstOrFail()->load('variants');
    expect($res->json('data.errors'))->toBe([])
        ->and($p->variants->firstWhere('label', '10 ml')->price)->toBe(1500)
        ->and($p->variants->firstWhere('label', '10 ml')->cost_price)->toBe(1000)
        ->and($p->variants->firstWhere('label', 'Flacon complet 100 ml')->price)->toBe(22000)
        ->and($p->stock_ml)->toBe(250)->and($p->gender->value)->toBe('femme');
});

it('gives clear errors for the other products: unknown type, a perfume type, a repeated option', function () {
    $csv = "type;nom;option;prix\n"
        ."Bijoux;Collier;Or;5000\n"                 // no such type
        ."Parfums;Gel;250 ml;900\n"                 // a perfume type belongs to the other model
        ."Cosmétiques;Savon;Rose;300\n"
        ."Cosmétiques;Savon;Rose;300\n"             // the same option twice
        ."Cosmétiques;Crème;Pot;800\n";

    $res = importCsv($this, 'options', $csv, commit: true)->assertOk();
    $messages = collect($res->json('data.errors'))->pluck('message')->implode(' | ');

    expect($res->json('data.created'))->toHaveCount(1)->and(Product::pluck('name')->all())->toBe(['Crème'])
        ->and($messages)->toContain("Le type « Bijoux » n'existe pas")->and($messages)->toContain('utilisez le modèle des parfums')->and($messages)->toContain('déjà dans ce produit');
});

it('refuses a file with no products, no price column, or the wrong kind of file', function () {
    importCsv($this, 'perfumes', "nom;marque\n")->assertUnprocessable();
    importCsv($this, 'perfumes', "nom;marque\nSauvage;Dior\n")->assertUnprocessable()->assertJsonPath('message', 'Aucune colonne de prix : ajoutez par exemple prix_10ml, prix_20ml ou prix_flacon_100ml.');
    $this->post('/api/admin/imports/products', ['file' => UploadedFile::fake()->image('x.png'), 'format' => 'perfumes'], ['Accept' => 'application/json'])->assertUnprocessable();
    importCsv($this, 'unknown', "a;b\n1;2\n")->assertUnprocessable();
});

it('lets only the owner import', function () {
    $staff = \App\Models\User::create(['name' => 'Staff', 'username' => 'staff3', 'password' => 'secret-pass', 'role' => \App\Enums\UserRole::Staff]);

    $this->actingAs($staff)->post('/api/admin/imports/products', ['file' => UploadedFile::fake()->createWithContent('a.csv', "nom;prix_10ml\nX;1\n"), 'format' => 'perfumes'], ['Accept' => 'application/json'])->assertForbidden();
});

it('tells which model a file belongs to when the wrong one was chosen', function () {
    importCsv($this, 'perfumes', model('modele-autres-produits.csv'))->assertUnprocessable()->assertJsonPath('message', 'Ce fichier est au format « Autres produits » (il a une colonne option) : choisissez le modèle « Autres produits ».');
    importCsv($this, 'options', model('modele-parfums.csv'))->assertUnprocessable()->assertJsonPath('message', 'Ce fichier est au format « Parfums » (les tailles sont des colonnes) : choisissez le modèle « Parfums ».');
    importCsv($this, 'options', "type;nom;prix
Cosmétiques;Gel;900
")->assertUnprocessable();
});
