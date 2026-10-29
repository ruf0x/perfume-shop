<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

#[Signature('db:backup {--keep=8 : How many backups to keep} {--path= : Folder for the dump files}')]
#[Description('Dump the database to a .sql file and delete the oldest dumps')]
class BackupDatabase extends Command
{
    public function handle(): int
    {
        $db = config('database.connections.'.config('database.default'));
        $folder = $this->option('path') ?: config('shop.backup_path');
        File::ensureDirectoryExists($folder, 0750);

        $file = rtrim($folder, '/\\').DIRECTORY_SEPARATOR.$db['database'].'-'.now()->format('Y-m-d_His').'.sql';

        $process = new Process([
            config('shop.dump_binary'),
            '--host='.$db['host'],
            '--port='.$db['port'],
            '--user='.$db['username'],
            '--single-transaction',
            '--routines',
            '--default-character-set=utf8mb4',
            '--result-file='.$file,
            $db['database'],
        ], null, ['MYSQL_PWD' => $db['password']]); // the password goes in the environment, not on the command line

        $process->setTimeout(300)->run();

        if (! $process->isSuccessful() || ! is_file($file) || filesize($file) === 0) {
            @unlink($file);
            $this->error('Sauvegarde impossible : '.trim($process->getErrorOutput() ?: 'mysqldump introuvable (voir DB_DUMP_BINARY).'));

            return self::FAILURE;
        }

        $kept = collect(File::glob(rtrim($folder, '/\\').DIRECTORY_SEPARATOR.$db['database'].'-*.sql'))->sort()->values();
        $kept->slice(0, max(0, $kept->count() - (int) $this->option('keep')))->each(fn ($old) => File::delete($old));

        $this->info('Sauvegarde créée : '.$file.' ('.number_format(filesize($file) / 1024, 0, ',', ' ').' Ko). '.min($kept->count(), (int) $this->option('keep')).' sauvegarde(s) conservée(s).');

        return self::SUCCESS;
    }
}
