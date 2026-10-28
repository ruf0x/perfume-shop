<?php

namespace Database\Seeders;

use App\Models\Commune;
use App\Models\Wilaya;
use Illuminate\Database\Seeder;

class WilayaSeeder extends Seeder
{
    /**
     * Wilayas 59-69 created by the 2025 administrative reform; the JSON dataset only
     * covers 1-58. The commune breakdown is not available, so each one gets its seat
     * as a single commune until a complete list is imported.
     */
    private const NEW_WILAYAS = [
        59 => ['Aflou', 'آفلو'],
        60 => ['Barika', 'بريكة'],
        61 => ['Ksar Chellala', 'قصر الشلالة'],
        62 => ['Messaad', 'مسعد'],
        63 => ['Aïn Oussera', 'عين وسارة'],
        64 => ['Bou Saâda', 'بوسعادة'],
        65 => ['El Abiodh Sidi Cheikh', 'الأبيض سيدي الشيخ'],
        66 => ['El Kantara', 'القنطرة'],
        67 => ['Bir El Ater', 'بئر العاتر'],
        68 => ['Ksar El Boukhari', 'قصر البخاري'],
        69 => ['El Aricha', 'العريشة'],
    ];

    public function run(): void
    {
        // Source: https://github.com/othmanus/algeria-cities (json/algeria_cities.json)
        $rows = json_decode(file_get_contents(database_path('data/algeria_cities.json')), true, flags: JSON_THROW_ON_ERROR);

        $wilayas = [];
        foreach ($rows as $row) {
            $wilayas[$row['wilaya_code']] ??= [
                'id' => (int) $row['wilaya_code'],
                'code' => str_pad($row['wilaya_code'], 2, '0', STR_PAD_LEFT),
                'name' => $row['wilaya_name_ascii'],
                'name_ar' => $row['wilaya_name'],
                // Alger is cheaper (same city as the shop is assumed); the rest use the defaults.
                'home_fee' => (int) $row['wilaya_code'] === 16 ? 400 : config('shop.default_home_fee'),
                'desk_fee' => (int) $row['wilaya_code'] === 16 ? 300 : config('shop.default_desk_fee'),
                'is_active' => true,
            ];
        }

        $newCommunes = [];
        foreach (self::NEW_WILAYAS as $id => [$name, $nameAr]) {
            $wilayas[$id] = [
                'id' => $id,
                'code' => (string) $id,
                'name' => $name,
                'name_ar' => $nameAr,
                'home_fee' => config('shop.default_home_fee'),
                'desk_fee' => config('shop.default_desk_fee'),
                'is_active' => true,
            ];
            $newCommunes[] = ['wilaya_id' => $id, 'name' => $name, 'name_ar' => $nameAr];
        }

        $now = now();
        Wilaya::upsert(
            array_map(fn (array $w) => $w + ['created_at' => $now, 'updated_at' => $now], array_values($wilayas)),
            ['id'],
            ['code', 'name', 'name_ar'],
        );

        Commune::query()->delete();
        $communes = array_map(fn (array $row) => [
            'wilaya_id' => (int) $row['wilaya_code'],
            'name' => $row['commune_name_ascii'],
            'name_ar' => $row['commune_name'],
            'created_at' => $now,
            'updated_at' => $now,
        ], $rows);

        foreach ($newCommunes as $commune) {
            $communes[] = $commune + ['created_at' => $now, 'updated_at' => $now];
        }

        foreach (array_chunk($communes, 500) as $chunk) {
            Commune::insert($chunk);
        }

        $this->command?->info(count($wilayas).' wilayas, '.count($communes).' communes seeded.');
    }
}
