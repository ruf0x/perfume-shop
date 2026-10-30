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
            /** Family or category slug, e.g. `arabe` or `soin-du-corps`. */
            'type' => ['nullable', 'string', 'max:80'],
            /** Brand slug. */
            'brand' => ['nullable', 'string', 'max:120'],
            'gender' => ['nullable', 'in:homme,femme,mixte'],
            /** One or several of `perfume`, `cosmetic`, `pack`, comma-separated: `perfume,cosmetic`. */
            'kind' => ['nullable', 'regex:/^(perfume|cosmetic|pack)(,(perfume|cosmetic|pack))*$/'],
            'min_price' => ['nullable', 'integer', 'min:0'],
            'max_price' => ['nullable', 'integer', 'min:0'],
            'featured' => ['nullable', 'boolean'],
            'sort' => ['nullable', 'in:newest,price_asc,price_desc,name'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:48'],
        ];
    }
}
