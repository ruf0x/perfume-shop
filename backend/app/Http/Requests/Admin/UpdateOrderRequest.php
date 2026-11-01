<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOrderRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'first_name' => ['sometimes', 'string', 'max:80'],
            'last_name' => ['sometimes', 'string', 'max:80'],
            'phone' => ['sometimes', 'string', 'max:20'],
            'phone2' => ['sometimes', 'nullable', 'string', 'max:20'],
            'wilaya_id' => ['sometimes', 'nullable', 'integer', 'exists:wilayas,id'],
            'commune_id' => ['sometimes', 'nullable', 'integer', 'exists:communes,id'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'delivery_mode' => ['sometimes', 'in:domicile,stop_desk,boutique'],
            'delivery_fee' => ['sometimes', 'integer', 'min:0'],
            'discount' => ['sometimes', 'integer', 'min:0'],
            'admin_note' => ['sometimes', 'nullable', 'string', 'max:2000'],
            /** Put the order aside until stock arrives (it stays pending). */
            'awaiting_stock' => ['sometimes', 'boolean'],
            /**
             * Replaces all items. Variants already in the order keep their original price;
             * new ones use the current price.
             */
            'lines' => ['sometimes', 'array', 'min:1', 'max:30'],
            'lines.*.variant_id' => ['required_with:lines', 'integer', 'exists:product_variants,id'],
            'lines.*.quantity' => ['required_with:lines', 'integer', 'min:1', 'max:50'],
        ];
    }
}
