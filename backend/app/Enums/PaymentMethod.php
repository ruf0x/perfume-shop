<?php

namespace App\Enums;

enum PaymentMethod: string
{
    case Cod = 'cod';
    case Especes = 'especes';
    case Carte = 'carte';
    case Ccp = 'ccp';
}
