<?php

namespace App\Exceptions;

use App\Enums\OrderStatus;

class InvalidTransitionException extends ShopException
{
    public function __construct(public readonly OrderStatus $from, public readonly string $action)
    {
        parent::__construct("Action « {$action} » impossible pour une commande « {$from->label()} ».");
    }
}
