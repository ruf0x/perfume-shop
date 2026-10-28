<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

#[Signature('auth:sign-out-everyone')]
#[Description('Sign every admin out: deletes all sessions and API tokens (everyone must log in again)')]
class SignOutEveryone extends Command
{
    public function handle(): int
    {
        $sessions = DB::table('sessions')->delete();
        $tokens = DB::table('personal_access_tokens')->delete();

        $this->info("Déconnecté : {$sessions} session(s) et {$tokens} jeton(s) supprimés. Tout le monde doit se reconnecter.");

        return self::SUCCESS;
    }
}
