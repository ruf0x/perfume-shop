<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CartRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'lines' => ['required', 'array', 'min:1', 'max:30'],
            'lines.*.variant_id' => ['required', 'integer'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            /** Needed together with `delivery_mode` to get the delivery fee. */
            'wilaya_id' => ['nullable', 'integer', 'exists:wilayas,id'],
            'delivery_mode' => ['nullable', 'in:domicile,stop_desk,boutique'],
        ];
    }
}
