<?php

use App\Enums\UserRole;
use App\Models\Brand;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->owner = makeOwner();
    $this->actingAs($this->owner);
});

function perfumePayload(array $overrides = []): array
{
    return array_merge([
        'product_type_id' => productType()->id,
        'name' => 'Oud Royal',
        'perfume_type_id' => PerfumeType::firstOrCreate(['slug' => 'arabe'], ['name' => 'Arabe'])->id,
        'inspired_by' => 'Tom Ford Oud Wood',
        'variants' => [
            ['label' => '10 ml', 'ml' => 10, 'price' => 900, 'stock_mode' => 'pool'],
            ['label' => '20 ml', 'ml' => 20, 'price' => 1700, 'stock_mode' => 'pool'],
            ['label' => 'Flacon complet 100 ml', 'ml' => 100, 'price' => 8000, 'stock_mode' => 'unit'],
        ],
    ], $overrides);
}

it('creates a perfume with several sizes and prices, with zero stock', function () {
    $res = $this->postJson('/api/admin/products', perfumePayload())->assertCreated()
        ->assertJsonPath('data.slug', 'oud-royal')
        ->assertJsonPath('data.stock_ml', 0)
        ->assertJsonPath('data.is_active', true)
        ->assertJsonCount(3, 'data.variants')
        ->assertJsonPath('data.variants.2.stock_mode', 'unit')
        ->assertJsonPath('data.variants.2.stock_qty', 0);

    expect(Product::count())->toBe(1);
});

it('does not let the payload set stock directly', function () {
    $payload = perfumePayload(['stock_ml' => 5000]);
    $payload['variants'][2]['stock_qty'] = 50;

    $res = $this->postJson('/api/admin/products', $payload)->assertCreated();

    expect($res->json('data.stock_ml'))->toBe(0)->and($res->json('data.variants.2.stock_qty'))->toBe(0);
});

it('generates unique slugs', function () {
    $this->postJson('/api/admin/products', perfumePayload())->assertCreated();
    $this->postJson('/api/admin/products', perfumePayload())->assertCreated()->assertJsonPath('data.slug', 'oud-royal-2');
});

it('validates the payload', function () {
    $this->postJson('/api/admin/products', ['product_type_id' => productType()->id, 'name' => '', 'variants' => []])
        ->assertUnprocessable()->assertJsonValidationErrors(['name', 'variants']);

    $bad = perfumePayload();
    $bad['variants'][0]['ml'] = null;
    $bad['variants'][1]['stock_mode'] = 'pack';
    $bad['variants'][2]['price'] = -1;
    $this->postJson('/api/admin/products', $bad)->assertUnprocessable()
        ->assertJsonValidationErrors(['variants.0.ml', 'variants.1.stock_mode', 'variants.2.price']);

    $this->postJson('/api/admin/products', perfumePayload(['pack' => ['price' => 1, 'components' => []]]))->assertUnprocessable();
});

it('updates fields, edits prices and adds or removes sizes', function () {
    $id = $this->postJson('/api/admin/products', perfumePayload())->json('data.id');
    $product = Product::with('variants')->find($id);
    $v10 = variantOf($product, '10 ml');
    $v20 = variantOf($product, '20 ml');

    $res = $this->putJson("/api/admin/products/{$id}", [
        'name' => 'Oud Royal Prestige',
        'is_active' => false,
        'variants' => [
            ['id' => $v10->id, 'label' => '10 ml', 'ml' => 10, 'price' => 1000, 'stock_mode' => 'pool'],
            ['label' => '30 ml', 'ml' => 30, 'price' => 2400, 'stock_mode' => 'pool'],
            // 20 ml and the sealed bottle are left out => removed
        ],
    ])->assertOk();

    expect($res->json('data.name'))->toBe('Oud Royal Prestige')
        ->and($res->json('data.slug'))->toBe('oud-royal')       // slug is stable on rename
        ->and($res->json('data.is_active'))->toBeFalse()
        ->and(collect($res->json('data.variants'))->pluck('label', 'price')->all())->toBe([1000 => '10 ml', 2400 => '30 ml'])
        ->and($v10->fresh()->price)->toBe(1000)
        ->and(\App\Models\ProductVariant::find($v20->id))->toBeNull();
});

it('deactivates instead of deleting a size that has history', function () {
    $product = makePerfume('Historique', poolMl: 100);
    $v10 = variantOf($product, '10 ml');
    placeOnline([[$v10, 1]]);

    $keep = $product->variants->reject(fn ($v) => $v->id === $v10->id)->map(fn ($v) => [
        'id' => $v->id, 'label' => $v->label, 'ml' => $v->ml, 'price' => $v->price, 'stock_mode' => $v->stock_mode->value,
    ])->values()->all();

    $this->putJson("/api/admin/products/{$product->id}", ['variants' => $keep])->assertOk();

    expect($v10->fresh()->is_active)->toBeFalse();
});

it('refuses to change the stock mode of a size that still holds sealed bottles', function () {
    $product = makePerfume('Scellés', sealed: 2);
    $full = variantOf($product, '100 ml scellé');

    $this->putJson("/api/admin/products/{$product->id}", ['variants' => [
        ['id' => $full->id, 'label' => '100 ml', 'ml' => 100, 'price' => 9000, 'stock_mode' => 'pool'],
    ]])->assertUnprocessable();
});

it('creates a pack with its contents and price', function () {
    $a = makePerfume('A', poolMl: 100);
    $b = makePerfume('B', poolMl: 100);

    $res = $this->postJson('/api/admin/products', [
        'kind' => 'pack',
        'name' => 'Pack Découverte',
        'description' => 'Trois décants',
        'pack' => ['price' => 2200, 'components' => [
            ['variant_id' => variantOf($a, '10 ml')->id, 'quantity' => 1],
            ['variant_id' => variantOf($b, '10 ml')->id, 'quantity' => 2],
        ]],
    ])->assertCreated();

    expect($res->json('data.variants'))->toHaveCount(1)
        ->and($res->json('data.variants.0.price'))->toBe(2200)
        ->and($res->json('data.variants.0.stock_mode'))->toBe('pack')
        ->and($res->json('data.variants.0.components'))->toHaveCount(2)
        ->and($res->json('data.available'))->toBeTrue();

    // and the storefront sells it
    $this->getJson('/api/products/pack-decouverte')->assertOk()->assertJsonPath('data.contains.1.quantity', 2);
});

it('refuses packs inside packs and deleting a perfume that is part of a pack', function () {
    $a = makePerfume('A', poolMl: 100);
    $pack = makePack([[variantOf($a, '10 ml'), 1]]);

    $this->postJson('/api/admin/products', ['kind' => 'pack', 'name' => 'Méta', 'pack' => ['price' => 1, 'components' => [['variant_id' => $pack->id, 'quantity' => 1]]]])
        ->assertUnprocessable()->assertJsonValidationErrors('pack.components');

    $this->deleteJson("/api/admin/products/{$a->id}")->assertUnprocessable();
    expect(Product::find($a->id))->not->toBeNull();
});

it('soft-deletes a product and hides it everywhere', function () {
    $p = makePerfume('Éphémère', poolMl: 100);

    $this->deleteJson("/api/admin/products/{$p->id}")->assertNoContent();

    expect(Product::find($p->id))->toBeNull()->and(Product::withTrashed()->find($p->id))->not->toBeNull();
    $this->getJson('/api/products')->assertJsonCount(0, 'data');
});

it('lists products with stock for the admin, including hidden ones, and filters low stock', function () {
    makePerfume('Plein', poolMl: 200);
    makePerfume('Presque vide', poolMl: 5)->update(['is_active' => false]);

    $all = $this->getJson('/api/admin/products')->assertOk();
    expect($all->json('data'))->toHaveCount(2)->and($all->json('data.0'))->toHaveKey('stock_ml');

    $low = $this->getJson('/api/admin/products?low_stock=1')->assertOk();
    expect($low->json('data'))->toHaveCount(1)->and($low->json('data.0.name'))->toBe('Presque vide');
    expect($this->getJson('/api/admin/products?q=plein')->json('data'))->toHaveCount(1);
});

it('uploads, reorders and deletes product photos', function () {
    Storage::fake('public');
    $p = makePerfume('Photo');

    $first = $this->postJson("/api/admin/products/{$p->id}/images", ['image' => UploadedFile::fake()->image('a.jpg', 2400, 1800)])->assertCreated();
    $second = $this->postJson("/api/admin/products/{$p->id}/images", ['image' => UploadedFile::fake()->image('b.png', 800, 800)])->assertCreated();

    $stored = ProductImage::orderBy('id')->get();
    Storage::disk('public')->assertExists($stored[0]->path);
    expect($stored[0]->path)->toEndWith('.webp')
        ->and($p->fresh()->main_image)->toBe($stored[0]->path)
        ->and($first->json('data.url'))->toContain('/storage/products/');
    [$w, $h] = getimagesizefromstring(Storage::disk('public')->get($stored[0]->path));
    expect($w)->toBe(1200)->and($h)->toBe(900); // scaled down, ratio kept

    $this->putJson("/api/admin/products/{$p->id}/images/order", ['ids' => [$stored[1]->id, $stored[0]->id]])->assertNoContent();
    expect($p->fresh()->main_image)->toBe($stored[1]->path);

    $this->deleteJson("/api/admin/images/{$stored[1]->id}")->assertNoContent();
    Storage::disk('public')->assertMissing($stored[1]->path);
    expect($p->fresh()->main_image)->toBe($stored[0]->path);

    $this->putJson("/api/admin/products/{$p->id}/images/order", ['ids' => [$stored[0]->id, 999]])->assertUnprocessable();
});

it('rejects files that are not images or are too large', function () {
    Storage::fake('public');
    $p = makePerfume('Photo');

    $this->postJson("/api/admin/products/{$p->id}/images", ['image' => UploadedFile::fake()->create('virus.pdf', 10, 'application/pdf')])->assertUnprocessable();
    $this->postJson("/api/admin/products/{$p->id}/images", ['image' => UploadedFile::fake()->image('big.jpg')->size(21000)])->assertUnprocessable();
    $this->postJson("/api/admin/products/{$p->id}/images", [])->assertUnprocessable();
});

it('manages types and brands, and refuses to delete ones in use', function () {
    $typeId = productType()->id;
    $id = $this->postJson('/api/admin/types', ['name' => 'Oud Prestige', 'product_type_id' => $typeId])->assertCreated()->assertJsonPath('data.slug', 'oud-prestige')->json('data.id');
    $this->postJson('/api/admin/types', ['name' => 'Oud Prestige', 'product_type_id' => $typeId])->assertUnprocessable()->assertJsonValidationErrors('name');
    $this->putJson("/api/admin/types/{$id}", ['name' => 'Oud Royal', 'is_active' => false])->assertOk()->assertJsonPath('data.slug', 'oud-royal');

    $p = makePerfume('Typé');
    $p->update(['perfume_type_id' => $id]);
    $this->deleteJson("/api/admin/types/{$id}")->assertUnprocessable();
    $p->update(['perfume_type_id' => null]);
    $this->deleteJson("/api/admin/types/{$id}")->assertNoContent();

    $brand = $this->postJson('/api/admin/brands', ['name' => 'Rasasi'])->assertCreated()->json('data.id');
    $p->update(['brand_id' => $brand]);
    $this->deleteJson("/api/admin/brands/{$brand}")->assertUnprocessable();
    $this->getJson('/api/admin/brands')->assertOk()->assertJsonPath('data.0.products_count', 1);
});

it('lets staff read the catalogue but not change it', function () {
    $staff = User::create(['name' => 'S', 'username' => 'staff', 'password' => 'secret-pass', 'role' => UserRole::Staff]);
    $p = makePerfume('Lecture', poolMl: 100);
    $this->actingAs($staff);

    $this->getJson('/api/admin/products')->assertOk();
    $this->getJson("/api/admin/products/{$p->id}")->assertOk();
    $this->getJson('/api/admin/types')->assertOk();
    $this->getJson('/api/admin/brands')->assertOk();

    $this->postJson('/api/admin/products', perfumePayload())->assertForbidden();
    $this->putJson("/api/admin/products/{$p->id}", ['name' => 'x'])->assertForbidden();
    $this->deleteJson("/api/admin/products/{$p->id}")->assertForbidden();
    $this->postJson('/api/admin/types', ['name' => 'x'])->assertForbidden();
    $this->postJson('/api/admin/brands', ['name' => 'x'])->assertForbidden();
    expect(Product::count())->toBe(1);
});

it('lets a perfume be deleted once the only pack that used it has been deleted', function () {
    $a = makePerfume('Seul dans un pack', poolMl: 100);
    $pack = makePack([[variantOf($a, '10 ml'), 1]]);

    $this->deleteJson("/api/admin/products/{$a->id}")->assertUnprocessable();   // still in a pack on sale
    $this->deleteJson("/api/admin/products/{$pack->product->id}")->assertNoContent();
    $this->deleteJson("/api/admin/products/{$a->id}")->assertNoContent();
});

it('saves the purchase price of each size and refuses a negative one', function () {
    $payload = perfumePayload();
    $payload['variants'][0]['cost_price'] = 600;

    $this->postJson('/api/admin/products', $payload)->assertCreated()
        ->assertJsonPath('data.variants.0.cost_price', 600)
        ->assertJsonPath('data.variants.1.cost_price', null);

    $payload['variants'][0]['cost_price'] = -5;
    $this->postJson('/api/admin/products', $payload)->assertUnprocessable()->assertJsonValidationErrors(['variants.0.cost_price']);
});
