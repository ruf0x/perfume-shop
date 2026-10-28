<?php

namespace App\Enums;

enum OrderChannel: string
{
    case Online = 'online';
    case Pos = 'pos';
}
