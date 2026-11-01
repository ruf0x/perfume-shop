<?php

namespace App\Http\Controllers\Admin;

use Illuminate\Support\Facades\DB;
use App\Support\Phone;
use App\Models\Order;
use App\Models\Commune;
use App\Exceptions\ShopException;
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

    /**
     * Find a client while typing (name or phone), for the caisse and the order screens. Owner and staff.
     * Returns up to 8, with the place they live so the form can be filled in.
     */
    public function search(Request $request): JsonResponse
    {
        $v = $request->validate(['q' => ['required', 'string', 'min:2', 'max:60']]);
        $term = $v['q'];

        $rows = Customer::query()->with('wilaya:id,name')
            ->where(fn ($w) => $w->where('phone', 'like', "%{$term}%")
                ->orWhere('first_name', 'like', "%{$term}%")
                ->orWhere('last_name', 'like', "%{$term}%")
                ->orWhereRaw("CONCAT(first_name, ' ', last_name) like ?", ["%{$term}%"]))
            ->orderByDesc('orders_count')->limit(8)->get();

        return response()->json(['data' => $rows->map(fn (Customer $c) => [
            'id' => $c->id,
            'first_name' => $c->first_name,
            'last_name' => $c->last_name,
            'phone' => $c->phone,
            'wilaya_id' => $c->wilaya_id,
            'commune_id' => $c->commune_id,
            'wilaya' => $c->wilaya?->name,
            'orders_count' => $c->orders_count,
        ])->values()]);
    }

    public function show(Customer $customer): JsonResponse
    {
        return response()->json(['data' => $this->present($customer->load('wilaya:id,name'))]);
    }

    /** Blacklist a client (their phone can no longer place online orders) or add a note. */
    public function update(Request $request, Customer $customer): JsonResponse
    {
        $v = $request->validate([
            'is_blacklisted' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'first_name' => ['sometimes', 'string', 'max:80'],
            'last_name' => ['sometimes', 'string', 'max:80'],
            'phone' => ['sometimes', 'string', 'max:20'],
            'wilaya_id' => ['sometimes', 'nullable', 'integer', 'exists:wilayas,id'],
            'commune_id' => ['sometimes', 'nullable', 'integer', 'exists:communes,id'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        if (array_key_exists('phone', $v)) {
            $v['phone'] = Phone::normalize($v['phone']) ?? throw new ShopException('Numéro de téléphone invalide.');
            if (Customer::query()->where('phone', $v['phone'])->whereKeyNot($customer->id)->exists()) {
                throw new ShopException('Ce numéro est déjà utilisé par un autre client.');
            }
        }
        $wilayaId = array_key_exists('wilaya_id', $v) ? $v['wilaya_id'] : $customer->wilaya_id;
        $communeId = array_key_exists('commune_id', $v) ? $v['commune_id'] : $customer->commune_id;
        if ($communeId && ! Commune::query()->whereKey($communeId)->where('wilaya_id', $wilayaId)->exists()) {
            throw new ShopException("Cette commune n'appartient pas à la wilaya choisie.");
        }

        $customer->update($v);

        return response()->json(['data' => $this->present($customer->fresh('wilaya:id,name'))]);
    }

    /**
     * Delete a client. Their orders stay (they carry the name and phone they were made with) but are no longer
     * attached to a client; their loyalty count and gifts are deleted with them.
     */
    public function destroy(Customer $customer): JsonResponse
    {
        DB::transaction(function () use ($customer) {
            Order::query()->where('customer_id', $customer->id)->update(['customer_id' => null]);
            $customer->delete();
        });

        return response()->json(['message' => 'Client supprimé.']);
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
            'wilaya_id' => $c->wilaya_id,
            'commune_id' => $c->commune_id,
            'address' => $c->address,
            'orders_count' => $c->orders_count,
            'delivered_count' => $c->delivered_count,
            'cancelled_count' => $c->cancelled_count,
            'returned_count' => $c->returned_count,
            'is_blacklisted' => $c->is_blacklisted,
            'note' => $c->note,
            'loyalty' => app(\App\Services\LoyaltyService::class)->progress($c),
            'created_at' => $c->created_at,
        ];
    }
}
