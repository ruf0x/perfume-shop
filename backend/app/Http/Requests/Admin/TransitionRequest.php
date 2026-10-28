<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class TransitionRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /**
             * `confirm` takes the stock out, `cancel` puts it back if it was taken,
             * `no_answer` only counts a call attempt.
             */
            'action' => ['required', 'in:confirm,cancel,no_answer,ship,deliver,return,sell_in_store'],
            'note' => ['nullable', 'string', 'max:255'],
            /** For `cancel`. */
            'reason' => ['nullable', 'string', 'max:255'],
            /** For `return`: put the bottles back in stock? */
            'restock' => ['nullable', 'boolean'],
            /** For `ship`. */
            'delivery_company' => ['nullable', 'string', 'max:50'],
            'tracking_number' => ['nullable', 'string', 'max:60'],
        ];
    }
}
