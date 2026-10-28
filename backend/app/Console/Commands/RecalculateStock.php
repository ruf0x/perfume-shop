<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Services\StockService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('stock:recalculate {product? : Product id (all perfumes when omitted)}')]
#[Description('Rebuild the cached stock totals from the stock_movements ledger')]
class RecalculateStock extends Command
{
    public function handle(StockService $stock): int
    {
        $products = Product::query()->perfumes()->withTrashed()
            ->when($this->argument('product'), fn ($q, $id) => $q->whereKey($id))
            ->get();

        $fixed = 0;
        foreach ($products as $product) {
            if ($stock->recalculate($product)) {
                $fixed++;
                $this->warn("Corrigé : {$product->name}");
            }
        }

        $this->info("{$products->count()} parfum(s) vérifié(s), {$fixed} corrigé(s).");

        return self::SUCCESS;
    }
}
