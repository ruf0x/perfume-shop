<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\ProductImporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ImportController extends Controller
{
    private const TEMPLATES = [
        ProductImporter::PERFUMES => 'modele-parfums.csv',
        ProductImporter::OPTIONS => 'modele-autres-produits.csv',
    ];

    /** The CSV model to fill in (UTF-8, `;` separated, opens in Excel): `perfumes` or `options`. */
    public function template(string $format): BinaryFileResponse
    {
        abort_unless(isset(self::TEMPLATES[$format]), 404);

        return response()->download(resource_path('import/'.self::TEMPLATES[$format]), self::TEMPLATES[$format], ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Add products from a CSV file. Without `commit` it only checks the file and says what would happen (nothing is
     * saved); with `commit=1` it imports. Existing products are skipped, never changed; a product with a problem is
     * skipped with its line numbers and the others are imported.
     */
    public function products(Request $request, ProductImporter $importer): JsonResponse
    {
        $v = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:2048'],
            /** `perfumes` (one row per perfume, sizes as columns) or `options` (one row per option of a product). */
            'format' => ['required', 'in:perfumes,options'],
            'commit' => ['nullable', 'boolean'],
        ]);

        return response()->json(['data' => $importer->run($request->file('file')->getRealPath(), $v['format'], (bool) ($v['commit'] ?? false), $request->user())]);
    }
}
