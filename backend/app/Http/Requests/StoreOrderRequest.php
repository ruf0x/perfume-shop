<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            /** Algerian mobile: `0550123456` (also accepts `+213 550 12 34 56`). */
            'phone' => ['required', 'string', 'max:20'],
            'phone2' => ['nullable', 'string', 'max:20'],
            /** Required unless the client picks up in the shop. */
            'wilaya_id' => ['required_unless:delivery_mode,boutique', 'nullable', 'integer', 'exists:wilayas,id'],
            'commune_id' => ['nullable', 'integer', 'exists:communes,id'],
            'address' => ['nullable', 'string', 'max:255'],
            'delivery_mode' => ['required', 'in:domicile,stop_desk,boutique'],
            'customer_note' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1', 'max:30'],
            'lines.*.variant_id' => ['required', 'integer'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            /** Honeypot: must stay empty. Real clients never fill it. */
            'website' => ['prohibited'],
        ];
    }
}
