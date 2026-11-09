<?php

namespace Database\Seeders;

use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Enums\StockMovementType;
use App\Enums\UserRole;
use App\Models\Commune;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\BottleService;
use App\Services\LoyaltyService;
use App\Services\OrderPlacement;
use App\Services\OrderWorkflow;
use App\Services\StockService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Two months of believable activity for the static demo site (never part of a real shop): restock, empty decant
 * bottles, online orders at every stage, caisse sales, regular clients with their loyalty progress. Everything goes
 * through the real services, with the clock moved back, so stock, costs, bottles, counters and loyalty all agree.
 * Run after DemoSeeder, CosmeticSeeder, AccessorySeeder and PurchaseCostSeeder.
 */
class ShowcaseSeeder extends Seeder
{
    private const FIRST = ['Amine', 'Yacine', 'Karim', 'Walid', 'Redouane', 'Nassim', 'Anis', 'Hichem', 'Mehdi', 'Bilal', 'Rachid', 'Samir', 'Amina', 'Yasmine', 'Sara', 'Imane', 'Lina', 'Nour', 'Meriem', 'Khadija', 'Rania', 'Soraya', 'Houda', 'Lamia', 'Wafa', 'Asma'];

    private const LAST = ['Benali', 'Haddad', 'Merabet', 'Khelifi', 'Bensalem', 'Boudiaf', 'Cherif', 'Mansouri', 'Belkacem', 'Zerrouki', 'Hamidi', 'Larbi', 'Saidi', 'Toumi', 'Bouzid', 'Rahmani', 'Taleb', 'Meziane', 'Ouali', 'Sebaa'];

    /** Wilaya codes, Oran and Alger the most often. */
    private const WILAYAS = [31, 31, 31, 31, 16, 16, 16, 25, 9, 19, 13, 23, 6, 15, 22, 5, 35, 26];

    private User $owner;

    private User $staff;

    private int $phone = 0;

    private OrderPlacement $placement;

    private OrderWorkflow $workflow;

    /** @var array<int, list<int>> */
    private array $communes = [];

    /** @var list<ProductVariant> */
    private array $decants = [];

    /** @var list<ProductVariant> */
    private array $flacons = [];

    /** @var list<ProductVariant> */
    private array $others = [];

    /** @var list<ProductVariant> */
    private array $packs = [];

    public function run(): void
    {
        mt_srand(2026);
        $real = Carbon::now();
        $this->placement = app(OrderPlacement::class);
        $this->workflow = app(OrderWorkflow::class);

        $this->owner = User::query()->where('role', UserRole::Owner)->firstOrFail();
        $this->staff = User::query()->updateOrCreate(['username' => 'equipe'], ['name' => 'Samir (équipe)', 'password' => 'demo1234', 'role' => UserRole::Staff, 'is_active' => true]);

        Carbon::setTestNow($real->copy()->subDays(70));
        $this->restock();
        $this->bottles();
        $this->loadVariants();

        $regulars = [];
        for ($i = 0; $i < 14; $i++) {
            $regulars[] = $this->newCustomer();
        }

        // Day by day, oldest first.
        for ($ago = 62; $ago >= 0; $ago--) {
            $day = $real->copy()->subDays($ago)->startOfDay();
            $weekend = in_array($day->dayOfWeek, [Carbon::FRIDAY, Carbon::SATURDAY], true);
            $growth = (int) round((62 - $ago) / 25);
            $online = mt_rand(1, 3) + $growth + ($weekend ? 1 : 0);
            $pos = mt_rand(1, 3) + ($weekend ? 1 : 0);

            if ($ago === 31) {
                Carbon::setTestNow($real->copy()->subDays(31));
                app(BottleService::class)->addEntry(10, 400, 10000, 'Réassort de bouteilles 10 ml', $this->owner);
            }

            for ($n = 0; $n < $online; $n++) {
                $at = $this->moment($real, $day, $ago);
                $customer = mt_rand(1, 100) <= 25 ? $regulars[mt_rand(4, 13)] : $this->newCustomer();
                $this->online($real, $at, $customer, $this->randomLines(), $ago);
            }
            for ($n = 0; $n < $pos; $n++) {
                $at = $this->moment($real, $day, $ago);
                $customer = mt_rand(1, 100) <= 40 ? ($this->newCustomer(false)) : null;
                $this->pos($at, $customer, $this->randomLines());
            }
        }

        $this->vips($real, $regulars);
        $this->specialCases($real);

        Carbon::setTestNow($real);
        $this->leaveStockAtDifferentLevels();
        Carbon::setTestNow();
    }

    /** A lot of stock at the start, so two months of sales never run dry. */
    private function restock(): void
    {
        $stock = app(StockService::class);

        Product::query()->with('variants')->whereIn('kind', [ProductKind::Perfume, ProductKind::Standard])->get()->each(function (Product $product) use ($stock) {
            if ($product->name === 'Layton') {
                return;
            }
            if ($product->kind === ProductKind::Perfume) {
                $stock->addEntry($product, null, ml: 3500, note: 'Arrivage');
                $flacon = $product->variants->firstWhere('stock_mode', StockMode::Unit);
                if ($flacon) {
                    $stock->addEntry($product, $flacon, qty: 12, note: 'Arrivage');
                }

                return;
            }
            foreach ($product->variants->where('stock_mode', StockMode::Unit) as $variant) {
                $stock->addEntry($product, $variant, qty: 60, note: 'Arrivage');
            }
        });
    }

    /** The empty decant bottles: bought in bulk, then a second batch of 10 ml ones. */
    private function bottles(): void
    {
        $bottles = app(BottleService::class);
        $bottles->addEntry(10, 800, 20000, 'Premier achat de bouteilles 10 ml', $this->owner);
        $bottles->addEntry(20, 500, 17500, 'Premier achat de bouteilles 20 ml', $this->owner);
        $bottles->addEntry(30, 400, 18000, 'Premier achat de bouteilles 30 ml', $this->owner);
    }

    private function loadVariants(): void
    {
        $variants = ProductVariant::query()->with('product')->where('is_active', true)->get()
            ->filter(fn (ProductVariant $v) => $v->product?->is_active && $v->product->name !== 'Layton');

        $this->decants = $variants->filter(fn ($v) => $v->product->kind === ProductKind::Perfume && $v->stock_mode === StockMode::Pool)->values()->all();
        $this->flacons = $variants->filter(fn ($v) => $v->product->kind === ProductKind::Perfume && $v->stock_mode === StockMode::Unit)->values()->all();
        $this->others = $variants->filter(fn ($v) => $v->product->kind === ProductKind::Standard && $v->stock_mode === StockMode::Unit)->values()->all();
        $this->packs = $variants->filter(fn ($v) => $v->product->kind === ProductKind::Pack)->values()->all();
    }

    /** @return array{first: string, last: string, phone: string, wilaya: int, commune: int|null} */
    private function newCustomer(bool $withPlace = true): array
    {
        $this->phone++;
        $wilaya = self::WILAYAS[array_rand(self::WILAYAS)];

        return [
            'first' => self::FIRST[array_rand(self::FIRST)],
            'last' => self::LAST[array_rand(self::LAST)],
            'phone' => '055'.str_pad((string) (7000000 + $this->phone), 7, '0', STR_PAD_LEFT),
            'wilaya' => $wilaya,
            'commune' => $withPlace ? $this->commune($wilaya) : null,
        ];
    }

    private function commune(int $wilaya): ?int
    {
        $this->communes[$wilaya] ??= Commune::query()->where('wilaya_id', $wilaya)->pluck('id')->all();

        return $this->communes[$wilaya] ? $this->communes[$wilaya][array_rand($this->communes[$wilaya])] : null;
    }

    /** A time of that day, never later than the real now. */
    private function moment(Carbon $real, Carbon $day, int $ago): Carbon
    {
        $at = $day->copy()->setTime(mt_rand(9, 21), mt_rand(0, 59));

        return $ago === 0 ? $real->copy()->subMinutes(mt_rand(20, 400)) : $at;
    }

    /** @return list<array{0: ProductVariant, 1: int}> */
    private function randomLines(): array
    {
        $lines = [];
        $count = [1, 1, 1, 2, 2, 3][mt_rand(0, 5)];

        for ($i = 0; $i < $count; $i++) {
            $roll = mt_rand(1, 100);
            $pool = match (true) {
                $roll <= 58 => $this->decants,
                $roll <= 78 => $this->others,
                $roll <= 90 => $this->flacons,
                default => $this->packs ?: $this->decants,
            } ?: $this->decants;
            $variant = $pool[array_rand($pool)];
            $lines[$variant->id] = [$variant, mt_rand(1, 10) === 1 ? 2 : 1];
        }

        return array_values($lines);
    }

    private function at(Carbon $moment): void
    {
        Carbon::setTestNow($moment->copy());
    }

    /**
     * An online order and its life: pending, confirmed, shipped, delivered, or cancelled / returned, as far as its age allows.
     *
     * @param  array<string, mixed>  $customer
     * @param  list<array{0: ProductVariant, 1: int}>  $lines
     */
    private function online(Carbon $real, Carbon $at, array $customer, array $lines, int $ago, ?string $forceEnd = null): ?Order
    {
        $this->at($at);
        $mode = mt_rand(1, 100) <= 70 ? 'domicile' : 'stop_desk';

        $order = $this->placement->placeOnline([
            'first_name' => $customer['first'],
            'last_name' => $customer['last'],
            'phone' => $customer['phone'],
            'wilaya_id' => $customer['wilaya'],
            'commune_id' => $customer['commune'],
            'address' => $mode === 'domicile' ? mt_rand(2, 140).' rue '.['des Martyrs', 'Larbi Ben M\'hidi', 'de la Liberté', 'Didouche Mourad', 'du 1er Novembre'][mt_rand(0, 4)] : null,
            'delivery_mode' => $mode,
            'customer_note' => mt_rand(1, 12) === 1 ? 'Appelez-moi avant de venir, merci.' : null,
            'lines' => array_map(fn ($l) => ['variant_id' => $l[0]->id, 'quantity' => $l[1]], $lines),
        ]);

        $step = fn (string $action, Carbon $when, array $data = []) => $this->move($order, $action, $when, $real, $data);
        $confirmAt = $at->copy()->addHours(mt_rand(1, 6));
        $shipAt = $confirmAt->copy()->addDay();
        $deliverAt = $shipAt->copy()->addDays(mt_rand(1, 2));

        $end = $forceEnd ?? match (true) {
            $ago >= 5 => array_merge(array_fill(0, 22, 'livree'), ['annulee', 'annulee_apres', 'retournee'])[mt_rand(0, 24)],
            $ago >= 3 => 'livree',
            $ago === 2 => 'en_livraison',
            $ago === 1 => 'confirmee',
            default => ['en_attente', 'en_attente', 'confirmee'][mt_rand(0, 2)],
        };

        switch ($end) {
            case 'en_attente':
                if (mt_rand(1, 5) === 1) {
                    $step('no_answer', $at->copy()->addHours(2), ['note' => 'Pas de réponse au premier appel']);
                }
                break;
            case 'confirmee':
                $step('confirm', $confirmAt);
                break;
            case 'en_livraison':
                $step('confirm', $confirmAt);
                $step('ship', $shipAt, ['delivery_company' => ['Yalidine', 'Zr Express', 'Ecotrack'][mt_rand(0, 2)], 'tracking_number' => 'YAL-'.mt_rand(100000, 999999)]);
                break;
            case 'livree':
                $step('confirm', $confirmAt);
                $step('ship', $shipAt, ['delivery_company' => ['Yalidine', 'Zr Express', 'Ecotrack'][mt_rand(0, 2)], 'tracking_number' => 'YAL-'.mt_rand(100000, 999999)]);
                $step('deliver', $deliverAt);
                break;
            case 'annulee':
                $step('cancel', $at->copy()->addHours(mt_rand(2, 20)), ['reason' => ['Le client a changé d\'avis', 'Numéro injoignable', 'Doublon'][mt_rand(0, 2)]]);
                break;
            case 'annulee_apres':
                $step('confirm', $confirmAt);
                $step('cancel', $confirmAt->copy()->addHours(5), ['reason' => 'Le client a refusé la commande']);
                break;
            case 'retournee':
                $step('confirm', $confirmAt);
                $step('ship', $shipAt, ['delivery_company' => 'Yalidine', 'tracking_number' => 'YAL-'.mt_rand(100000, 999999)]);
                $step('return', $deliverAt, ['restock' => mt_rand(0, 1) === 1, 'reason' => 'Client absent à la livraison']);
                break;
        }

        return $order;
    }

    private function move(Order $order, string $action, Carbon $when, Carbon $real, array $data = []): void
    {
        $this->at($when->gt($real) ? $real->copy() : $when);
        $this->workflow->transition($order, $action, $this->owner, $data);
    }

    /**
     * A caisse sale, finished at once.
     *
     * @param  array<string, mixed>|null  $customer
     * @param  list<array{0: ProductVariant, 1: int}>  $lines
     */
    private function pos(Carbon $at, ?array $customer, array $lines): void
    {
        $this->at($at);
        $subtotal = array_sum(array_map(fn ($l) => $l[0]->price * $l[1], $lines));
        $discount = mt_rand(1, 10) === 1 ? 200 : 0;
        $payment = ['especes', 'especes', 'especes', 'carte'][mt_rand(0, 3)];

        $this->placement->placePos([
            'lines' => array_map(fn ($l) => ['variant_id' => $l[0]->id, 'quantity' => $l[1]], $lines),
            'discount' => $discount,
            'payment_method' => $payment,
            'amount_received' => (int) (ceil(($subtotal - $discount) / 500) * 500),
            'phone' => $customer['phone'] ?? null,
            'first_name' => $customer['first'] ?? null,
            'last_name' => $customer['last'] ?? null,
        ], mt_rand(0, 2) === 0 ? $this->staff : $this->owner);
    }

    /** @return list<array{0: ProductVariant, 1: int}> */
    private function perfumes(int $units): array
    {
        $lines = [];
        for ($i = 0; $i < $units; $i++) {
            $variant = $this->decants[array_rand($this->decants)];
            $lines[$variant->id] = [$variant, 1];
        }

        return array_values($lines);
    }

    /**
     * Four regular clients with a story in the loyalty programme: one at 5 / 6, one with a gift waiting, one who
     * already got a gift (13 perfumes, a second one waiting) and one at 7.
     *
     * @param  list<array<string, mixed>>  $regulars
     */
    private function vips(Carbon $real, array $regulars): void
    {
        $regulars[0] = array_merge($regulars[0], ['first' => 'Amina', 'last' => 'Bensalem', 'wilaya' => 31, 'commune' => $this->commune(31)]);
        $regulars[1] = array_merge($regulars[1], ['first' => 'Karim', 'last' => 'Haddad', 'wilaya' => 16, 'commune' => $this->commune(16)]);
        $regulars[2] = array_merge($regulars[2], ['first' => 'Sofiane', 'last' => 'Merabet', 'wilaya' => 31, 'commune' => $this->commune(31)]);
        $regulars[3] = array_merge($regulars[3], ['first' => 'Yasmine', 'last' => 'Khelifi', 'wilaya' => 25, 'commune' => $this->commune(25)]);

        $plans = [
            0 => [[50, 1], [38, 1], [27, 2], [12, 1]],
            1 => [[55, 2], [40, 1], [26, 1], [15, 1], [7, 1]],
            2 => [[58, 2], [50, 1], [44, 2], [36, 1], [30, 2], [22, 1], [16, 2], [9, 1], [3, 1]],
            3 => [[48, 1], [41, 1], [33, 2], [21, 1], [14, 1], [4, 1]],
        ];

        foreach ($plans as $who => $orders) {
            foreach ($orders as [$ago, $units]) {
                $day = $real->copy()->subDays($ago)->setTime(mt_rand(10, 19), mt_rand(0, 59));
                $this->online($real, $day, $regulars[$who], $this->perfumes($units), $ago, 'livree');
            }
        }

        // Sofiane's first gift was handed over at the counter.
        $this->at($real->copy()->subDays(32)->setTime(15, 20));
        $customer = Customer::query()->where('phone', $regulars[2]['phone'])->firstOrFail();
        $gift = app(LoyaltyService::class)->suggestions($customer)['items'][0]['variant_id'] ?? null;
        $giftVariant = $gift ? ProductVariant::query()->find($gift) : $this->flacons[0];
        app(LoyaltyService::class)->redeem($customer, $giftVariant, $this->owner);
    }

    /** Things the dashboard and the orders list should show: a backorder, a blacklisted client, a note. */
    private function specialCases(Carbon $real): void
    {
        // An order the stock cannot cover yet (Layton has little left): the owner sees "stock insuffisant".
        $layton = Product::query()->where('name', 'Layton')->with('variants')->first();
        if ($layton) {
            app(StockService::class)->addEntry($layton, null, ml: 40, note: 'Arrivage partiel');
            $variant = $layton->variants->firstWhere('ml', 30);
            $customer = $this->newCustomer();
            $this->online($real, $real->copy()->subHours(3), $customer, [[$variant, 2]], 0, 'en_attente');
        }

        $bad = Customer::query()->where('cancelled_count', '>', 0)->first();
        $bad?->update(['is_blacklisted' => true, 'note' => 'Plusieurs commandes refusées à la livraison.']);
    }

    /** A few products nearly out, one out, the rest comfortable, so the low-stock widgets have something to show. */
    private function leaveStockAtDifferentLevels(): void
    {
        $stock = app(StockService::class);

        foreach (['Sauvage' => 40, 'Aventus' => 25, 'Hawas' => 55, 'Baccarat Rouge 540' => 0] as $name => $keep) {
            $product = Product::query()->where('name', $name)->first();
            if ($product && $product->stock_ml > $keep) {
                $stock->adjust($product, null, StockMovementType::Perte, mlChange: -($product->stock_ml - $keep), note: 'Inventaire');
            }
        }

        Product::query()->where('kind', ProductKind::Standard)->with('variants')->take(3)->get()->each(function (Product $product) use ($stock) {
            $variant = $product->variants->firstWhere('stock_mode', StockMode::Unit);
            if ($variant && $variant->stock_qty > 2) {
                $stock->adjust($product, $variant, StockMovementType::Perte, qtyChange: -($variant->stock_qty - 2), note: 'Inventaire');
            }
        });
    }
}
