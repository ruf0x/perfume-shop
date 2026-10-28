<?php

namespace App\Enums;

enum DeliveryMode: string
{
    case Domicile = 'domicile';
    case StopDesk = 'stop_desk';
    case Boutique = 'boutique';
}
