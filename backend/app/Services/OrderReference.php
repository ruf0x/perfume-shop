<?php

namespace App\Services;

use App\Enums\OrderChannel;
use Illuminate\Support\Facades\DB;

/**
 * Sequential references (CMD-000001 online, POS-000001 caisse).
 * The counter row is locked, so concurrent orders never get the same number.
 */
class OrderReference
{
    public function next(OrderChannel $channel): string
    {
        return DB::transaction(function () use ($channel) {
            $key = "counter.{$channel->value}";

            DB::table('settings')->insertOrIgnore([
                'key' => $key,
                'value' => '0',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $next = (int) DB::table('settings')->where('key', $key)->lockForUpdate()->value('value') + 1;

            DB::table('settings')->where('key', $key)->update(['value' => (string) $next, 'updated_at' => now()]);

            $prefix = $channel === OrderChannel::Online ? 'CMD' : 'POS';

            return sprintf('%s-%06d', $prefix, $next);
        });
    }
}
