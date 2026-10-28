<?php

namespace App\Enums;

enum StockMovementType: string
{
    case Entree = 'entree';
    case VenteEnLigne = 'vente_en_ligne';
    case VenteCaisse = 'vente_caisse';
    case Annulation = 'annulation';
    case Retour = 'retour';
    case Ajustement = 'ajustement';
    case Perte = 'perte';
    case OuvertureFlacon = 'ouverture_flacon';
}
