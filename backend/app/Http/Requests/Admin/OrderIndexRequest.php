<?php

namespace App\Http\Requests\Admin;

use App\Enums\OrderChannel;
use App\Enums\OrderStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class OrderIndexRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'status' => ['nullable', Rule::enum(OrderStatus::class)],
            'channel' => ['nullable', Rule::enum(OrderChannel::class)],
            /** Created on or after this date (YYYY-MM-DD). */
            'from' => ['nullable', 'date'],
            /** Created on or before this date (YYYY-MM-DD). */
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'wilaya_id' => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer'],
            'min_total' => ['nullable', 'integer', 'min:0'],
            'max_total' => ['nullable', 'integer', 'min:0'],
            /** Search in reference, name and phone. */
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'in:created_at,total'],
            'dir' => ['nullable', 'in:asc,desc'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ];
    }
}
