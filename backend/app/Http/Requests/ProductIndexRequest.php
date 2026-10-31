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
            /** Family or category slug, e.g. `arabe` or `lunettes-de-soleil`. */
            'type' => ['nullable', 'string', 'max:80'],
            /** Brand slug. */
            'brand' => ['nullable', 'string', 'max:120'],
            'gender' => ['nullable', 'in:homme,femme,mixte'],
            /** Product type (rayon) slug, e.g. `montres`. */
            'rayon' => ['nullable', 'string', 'max:80'],
            /** One or several of `perfume`, `standard`, `pack`, comma-separated: how the product works, not where it is shown. */
            'kind' => ['nullable', 'regex:/^(perfume|standard|pack)(,(perfume|standard|pack))*$/'],
            'min_price' => ['nullable', 'integer', 'min:0'],
            'max_price' => ['nullable', 'integer', 'min:0'],
            'featured' => ['nullable', 'boolean'],
            'sort' => ['nullable', 'in:newest,price_asc,price_desc,name'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:48'],
        ];
    }
}
