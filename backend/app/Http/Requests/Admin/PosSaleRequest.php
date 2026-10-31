<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class PosSaleRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'lines' => ['required', 'array', 'min:1', 'max:50'],
            'lines.*.variant_id' => ['required', 'integer'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            /** Price per unit for this sale, when different from the catalogue price (negotiated price). */
            'lines.*.unit_price' => ['nullable', 'integer', 'min:0'],
            /** Amount off the subtotal, in DZD. */
            'discount' => ['nullable', 'integer', 'min:0'],
            'payment_method' => ['required', 'in:especes,carte,ccp'],
            /** Cash handed over. Required for `especes`; the change to give back is in the response. */
            'amount_received' => ['nullable', 'integer', 'min:0'],
            'first_name' => ['nullable', 'string', 'max:80'],
            'last_name' => ['nullable', 'string', 'max:80'],
            'phone' => ['nullable', 'string', 'max:20'],
        ];
    }
}
