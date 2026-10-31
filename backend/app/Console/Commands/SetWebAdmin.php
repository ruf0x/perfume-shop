<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('admin:web {state? : on or off (omit to show the current state)}')]
#[Description("Turn the website's admin on or off (the desktop app keeps working). Rescue command if the owner locked themselves out.")]
class SetWebAdmin extends Command
{
    public function handle(): int
    {
        $state = $this->argument('state');

        if ($state !== null) {
            if (! in_array($state, ['on', 'off'], true)) {
                $this->error('Utilisez « on » ou « off ».');

                return self::INVALID;
            }

            settings()->set('web_admin_enabled', $state === 'on');
        }

        $this->info('Administration sur le site web : '.(settings()->webAdminEnabled() ? 'activée' : 'désactivée').'.');

        return self::SUCCESS;
    }
}
