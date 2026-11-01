<?php

namespace App\Http\Controllers\Admin;

use Illuminate\Http\JsonResponse;
use App\Services\OrderDeleter;
use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\OrderIndexRequest;
use App\Http\Requests\Admin\TransitionRequest;
use App\Http\Requests\Admin\UpdateOrderRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\OrderEditor;
use App\Services\OrderWorkflow;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderController extends Controller
{
    /**
     * Orders list with filters, sorting and pagination.
     *
     * The response also carries `counts`: how many orders each status tab holds under the
     * current filters (the `status` filter itself is ignored for the counts).
     */
    public function index(OrderIndexRequest $request): AnonymousResourceCollection
    {
        $filters = $request->validated();

        $orders = Order::query()
            ->filter($filters)
            ->with(['wilaya:id,name', 'commune:id,name'])
            ->withCount('items')
            ->orderBy($filters['sort'] ?? 'created_at', $filters['dir'] ?? 'desc')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 20)
            ->withQueryString();

        $byStatus = Order::query()->filter(array_diff_key($filters, ['status' => 1]))
            ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        $counts = ['all' => (int) $byStatus->sum()];
        foreach (OrderStatus::cases() as $status) {
            $counts[$status->value] = (int) ($byStatus[$status->value] ?? 0);
        }

        return OrderResource::collection($orders)->additional(['counts' => $counts]);
    }

    /** One order with client info, items, totals and status history. */
    public function show(Order $order): OrderResource
    {
        return new OrderResource($this->loaded($order));
    }

    /**
     * Correct an order after the phone call (client details, items, delivery fee, discount).
     *
     * Only while the order is pending or confirmed. On a confirmed order the stock is
     * re-taken for the new items; if it is short, nothing changes.
     */
    public function update(UpdateOrderRequest $request, Order $order, OrderEditor $editor): OrderResource
    {
        return new OrderResource($this->loaded($editor->update($order, $request->validated(), $request->user())));
    }

    /** Delete an order made by mistake (owner only). Pending, cancelled, returned orders and caisse sales; the others must be cancelled first. */
    public function destroy(Request $request, Order $order, OrderDeleter $deleter): JsonResponse
    {
        $deleter->delete($order, $request->user());

        return response()->json(['message' => 'Commande supprimée.']);
    }

    /** Move an order through the workflow (confirm, cancel, ship, deliver, return...). */
    public function transition(TransitionRequest $request, Order $order, OrderWorkflow $workflow): OrderResource
    {
        $data = $request->validated();
        $order = $workflow->transition($order, $data['action'], $request->user(), $data);

        return new OrderResource($this->loaded($order));
    }

    /** CSV export of the orders matching the filters (opens in Excel with accents). */
    public function export(OrderIndexRequest $request): StreamedResponse
    {
        $query = Order::query()->filter($request->validated())
            ->with(['wilaya:id,name', 'commune:id,name', 'items'])
            ->orderByDesc('created_at');

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM
            fputcsv($out, ['Référence', 'Date', 'Statut', 'Canal', 'Client', 'Téléphone', 'Wilaya', 'Commune', 'Adresse', 'Articles', 'Sous-total', 'Livraison', 'Remise', 'Total', 'Paiement'], ';');

            foreach ($query->lazyById(500) as $order) {
                fputcsv($out, [
                    $order->reference,
                    $order->created_at->format('Y-m-d H:i'),
                    $order->status->label(),
                    $order->channel->value,
                    trim("{$order->first_name} {$order->last_name}"),
                    $order->phone,
                    $order->wilaya?->name,
                    $order->commune?->name,
                    $order->address,
                    $order->items->map(fn ($i) => "{$i->product_name} {$i->variant_label} x{$i->quantity}")->implode(' | '),
                    $order->subtotal,
                    $order->delivery_fee,
                    $order->discount,
                    $order->total,
                    $order->payment_method->value,
                ], ';');
            }
            fclose($out);
        }, 'commandes-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function loaded(Order $order): Order
    {
        return $order->load(['items', 'history.user', 'wilaya:id,name', 'commune:id,name', 'creator:id,name']);
    }
}
