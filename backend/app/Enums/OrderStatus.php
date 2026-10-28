<?php

namespace App\Enums;

enum OrderStatus: string
{
    case EnAttente = 'en_attente';
    case Confirmee = 'confirmee';
    case Annulee = 'annulee';
    case EnLivraison = 'en_livraison';
    case Livree = 'livree';
    case Retournee = 'retournee';
    case VendueBoutique = 'vendue_boutique';

    public function label(): string
    {
        return match ($this) {
            self::EnAttente => 'En attente',
            self::Confirmee => 'Confirmée',
            self::Annulee => 'Annulée',
            self::EnLivraison => 'En livraison',
            self::Livree => 'Livrée',
            self::Retournee => 'Retournée',
            self::VendueBoutique => 'Vendue en boutique',
        };
    }

    /** @return list<self> */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::EnAttente => [self::Confirmee, self::Annulee],
            self::Confirmee => [self::VendueBoutique, self::EnLivraison, self::Annulee],
            self::EnLivraison => [self::Livree, self::Retournee],
            // A cancelled order can be reopened (back to pending) if the client changes their mind.
            self::Annulee => [self::EnAttente],
            self::Livree, self::Retournee, self::VendueBoutique => [],
        };
    }

    /**
     * Workflow actions the admin can trigger from this status (see OrderWorkflow).
     *
     * @return list<string>
     */
    public function actions(): array
    {
        return match ($this) {
            self::EnAttente => ['confirm', 'no_answer', 'cancel'],
            self::Confirmee => ['ship', 'sell_in_store', 'cancel'],
            self::EnLivraison => ['deliver', 'return'],
            self::Annulee => ['reopen'],
            default => [],
        };
    }

    public function canTransitionTo(self $to): bool
    {
        return in_array($to, $this->allowedTransitions(), true);
    }

    public function isFinal(): bool
    {
        return $this->allowedTransitions() === [];
    }

    /** Statuses that count as revenue. */
    public function countsAsRevenue(): bool
    {
        return in_array($this, [self::Livree, self::VendueBoutique], true);
    }

    /** @return list<self> */
    public static function revenueStatuses(): array
    {
        return [self::Livree, self::VendueBoutique];
    }
}
