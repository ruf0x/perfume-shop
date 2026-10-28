<?php

namespace App\Enums;

enum StockMode: string
{
    case Pool = 'pool';
    case Unit = 'unit';
    case Pack = 'pack';
}
