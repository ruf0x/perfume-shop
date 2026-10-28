<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\DashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    /**
     * Dashboard numbers for a date range (default: today; 366 days max).
     *
     * Revenue = delivered + sold-in-shop orders, split online / caisse. Also returns the sales
     * per day (for the chart), the 10 best-selling sizes and the perfumes running out of stock.
     */
    public function __invoke(Request $request, DashboardService $dashboard): JsonResponse
    {
        $v = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $to = Carbon::parse($v['to'] ?? 'today');
        $from = Carbon::parse($v['from'] ?? $to);

        if ($from->diffInDays($to) > 366) {
            return response()->json(['message' => 'La période ne peut pas dépasser 366 jours.'], 422);
        }

        return response()->json(['data' => $dashboard->summary($from, $to)]);
    }
}
