<?php

namespace App\Console\Commands;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Services\LoyaltyService;
use Illuminate\Console\Command;

class LoyaltyBackfill extends Command
{
    protected $signature = 'loyalty:backfill';

    protected $description = 'Count the perfumes of the completed orders that were placed before the loyalty programme (safe to run again)';

    public function handle(LoyaltyService $loyalty): int
    {
        if (! $loyalty->enabled()) {
            $this->warn('The loyalty programme is off (switch it on in the admin settings; the shop must also have it in config/features.php, loyalty_every).');

            return self::SUCCESS;
        }

        $done = 0;
        Order::query()->whereIn('status', OrderStatus::revenueStatuses())->whereNotNull('customer_id')->orderBy('completed_at')->orderBy('id')->each(function (Order $order) use ($loyalty, &$done) {
            $loyalty->record($order);
            $done++;
        });

        $this->info("{$done} completed orders looked at.");

        return self::SUCCESS;
    }
}
