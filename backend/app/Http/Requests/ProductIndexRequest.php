<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProductIndexRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** Search in name, brand and "inspired by". */
            'q' => ['nullable', 'string', 'max:100'],
            /** Perfume type slug, e.g. `arabe`. */
            'type' => ['nullable', 'string', 'max:80'],
            /** Brand slug. */
            'brand' => ['nullable', 'string', 'max:120'],
            'gender' => ['nullable', 'in:homme,femme,mixte'],
            'kind' => ['nullable', 'in:perfume,pack'],
            'min_price' => ['nullable', 'integer', 'min:0'],
            'max_price' => ['nullable', 'integer', 'min:0'],
            'featured' => ['nullable', 'boolean'],
            'sort' => ['nullable', 'in:newest,price_asc,price_desc,name'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:48'],
        ];
    }
}
