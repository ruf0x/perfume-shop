<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    /**
     * Clients, built from their orders (the phone number identifies them).
     *
     * Filters: `q` (name / phone), `blacklisted=1`. Sort: `orders_count`, `created_at` (default).
     * A client's orders: `GET /admin/orders?customer_id=ID`.
     */
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'blacklisted' => ['nullable', 'boolean'],
            'sort' => ['nullable', 'in:orders_count,created_at'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $page = Customer::query()->with('wilaya:id,name')
            ->when($v['q'] ?? null, fn ($q, $term) => $q->where(fn ($w) => $w
                ->where('phone', 'like', "%{$term}%")
                ->orWhere('first_name', 'like', "%{$term}%")
                ->orWhere('last_name', 'like', "%{$term}%")))
            ->when(isset($v['blacklisted']), fn ($q) => $q->where('is_blacklisted', (bool) $v['blacklisted']))
            ->orderByDesc($v['sort'] ?? 'created_at')->orderByDesc('id')
            ->paginate($v['per_page'] ?? 30)->withQueryString();

        return response()->json([
            'data' => $page->getCollection()->map(fn (Customer $c) => $this->present($c))->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }

    public function show(Customer $customer): JsonResponse
    {
        return response()->json(['data' => $this->present($customer->load('wilaya:id,name'))]);
    }

    /** Blacklist a client (their phone can no longer place online orders) or add a note. */
    public function update(Request $request, Customer $customer): JsonResponse
    {
        $customer->update($request->validate([
            'is_blacklisted' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'first_name' => ['sometimes', 'string', 'max:80'],
            'last_name' => ['sometimes', 'string', 'max:80'],
        ]));

        return response()->json(['data' => $this->present($customer->fresh('wilaya:id,name'))]);
    }

    /** @return array<string, mixed> */
    private function present(Customer $c): array
    {
        return [
            'id' => $c->id,
            'phone' => $c->phone,
            'first_name' => $c->first_name,
            'last_name' => $c->last_name,
            'wilaya' => $c->wilaya?->name,
            'address' => $c->address,
            'orders_count' => $c->orders_count,
            'delivered_count' => $c->delivered_count,
            'cancelled_count' => $c->cancelled_count,
            'returned_count' => $c->returned_count,
            'is_blacklisted' => $c->is_blacklisted,
            'note' => $c->note,
            'created_at' => $c->created_at,
        ];
    }
}
