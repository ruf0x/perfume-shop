<?php

namespace App\Http\Controllers\Admin;

use App\Enums\StockMovementType;
use App\Http\Controllers\Controller;
use App\Models\BottleMovement;
use App\Models\BottleSize;
use App\Services\BottleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BottleController extends Controller
{
    /**
     * The empty decant bottles by size: left, bought, what they cost, and the totals of the investment.
     * A size the shop never entered is not tracked (never blocks a sale).
     */
    public function index(): JsonResponse
    {
        $threshold = settings()->lowStockThresholdQty();
        $entries = BottleMovement::query()->where('type', StockMovementType::Entree)
            ->selectRaw('bottle_size_id, SUM(qty_change) as bought, SUM(total_cost) as invested, SUM(CASE WHEN total_cost IS NOT NULL THEN qty_change ELSE 0 END) as costed')
            ->groupBy('bottle_size_id')->get()->keyBy('bottle_size_id');

        $rows = BottleSize::query()->orderBy('ml')->get()->map(function (BottleSize $s) use ($entries, $threshold) {
            $e = $entries->get($s->id);
            $avg = $e && (int) $e->costed > 0 ? (int) round((int) $e->invested / (int) $e->costed) : null;

            return [
                'id' => $s->id,
                'ml' => $s->ml,
                'qty' => $s->qty,
                'bought' => (int) ($e->bought ?? 0),
                'invested' => (int) ($e->invested ?? 0),
                /** Average price of one bottle, over the entries whose cost was entered. */
                'unit_cost' => $avg,
                'value_left' => $avg !== null ? $avg * max(0, $s->qty) : null,
                'low' => $s->qty <= $threshold,
            ];
        });

        return response()->json(['data' => $rows->values(), 'totals' => [
            'bottles_left' => (int) $rows->sum('qty'),
            'bought' => (int) $rows->sum('bought'),
            'invested' => (int) $rows->sum('invested'),
            'value_left' => (int) $rows->sum('value_left'),
        ]]);
    }

    /** Receive bottles of one size (the size is created the first time). */
    public function entry(Request $request, BottleService $bottles): JsonResponse
    {
        $v = $request->validate([
            'ml' => ['required', 'integer', 'min:1', 'max:1000'],
            'quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            /** What the whole entry cost, in DA (optional). */
            'total_cost' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $size = $bottles->addEntry($v['ml'], $v['quantity'], $v['total_cost'] ?? null, $v['note'] ?? null, $request->user());

        return response()->json(['data' => ['ml' => $size->ml, 'qty' => $size->qty]], 201);
    }

    /** Rename a size. */
    public function updateSize(Request $request, BottleSize $size, BottleService $bottles): JsonResponse
    {
        $v = $request->validate(['ml' => ['required', 'integer', 'min:1', 'max:1000']]);
        $size = $bottles->updateSize($size, $v['ml']);

        return response()->json(['data' => ['id' => $size->id, 'ml' => $size->ml, 'qty' => $size->qty]]);
    }

    /** Stop tracking a size (its history is deleted). */
    public function destroySize(BottleSize $size, BottleService $bottles): JsonResponse
    {
        $bottles->deleteSize($size);

        return response()->json(['message' => 'Taille supprimée.']);
    }

    /** Correct an entry, a loss or a recount made by hand: `quantity` (signed like the movement), `total_cost` (entries), `note`. */
    public function updateMovement(Request $request, BottleMovement $movement, BottleService $bottles): JsonResponse
    {
        $v = $request->validate([
            'quantity' => ['required', 'integer', 'not_in:0', 'min:-100000', 'max:100000'],
            'total_cost' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $bottles->updateMovement($movement, $v['quantity'], $v['total_cost'] ?? null, $v['note'] ?? null);

        return response()->json(['data' => ['qty' => BottleSize::query()->whereKey($movement->bottle_size_id)->value('qty')]]);
    }

    /** Delete a movement made by hand. */
    public function destroyMovement(BottleMovement $movement, BottleService $bottles): JsonResponse
    {
        $bottles->deleteMovement($movement);

        return response()->json(['message' => 'Mouvement supprimé.']);
    }

    /** Correct the count: lost / broken bottles (negative) or a recount. A note is required. */
    public function adjustment(Request $request, BottleService $bottles): JsonResponse
    {
        $v = $request->validate([
            'ml' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'integer', 'not_in:0', 'min:-100000', 'max:100000'],
            'type' => ['required', 'in:perte,ajustement'],
            'note' => ['required', 'string', 'max:255'],
        ]);

        $size = $bottles->adjust($v['ml'], $v['quantity'], StockMovementType::from($v['type']), $v['note'], $request->user());

        return response()->json(['data' => ['ml' => $size->ml, 'qty' => $size->qty]]);
    }

    /** History of the bottle movements, newest first. Filter: `ml`. */
    public function movements(Request $request): JsonResponse
    {
        $v = $request->validate(['ml' => ['nullable', 'integer'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);

        $page = BottleMovement::query()->with(['size:id,ml', 'user:id,name'])
            ->when($v['ml'] ?? null, fn ($q, $ml) => $q->whereHas('size', fn ($s) => $s->where('ml', $ml)))
            ->orderByDesc('id')->paginate($v['per_page'] ?? 30);

        return response()->json([
            'data' => $page->getCollection()->map(fn (BottleMovement $m) => [
                'id' => $m->id,
                /** Entered by hand (an entry, a loss, a recount): it can be edited or deleted. */
                'editable' => in_array($m->type, [StockMovementType::Entree, StockMovementType::Perte, StockMovementType::Ajustement], true),
                'ml' => $m->size->ml,
                'type' => $m->type,
                'qty_change' => $m->qty_change,
                'total_cost' => $m->total_cost,
                'order' => $m->order_reference,
                'user' => $m->user?->name,
                'note' => $m->note,
                'created_at' => $m->created_at,
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }
}
