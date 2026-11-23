<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class Sequence
{
    /**
     * Next number for a named counter. The row is locked, so two cashiers
     * finishing a sale at the same moment never get the same number.
     */
    public static function next(string $name, int $start = 1000): int
    {
        return DB::transaction(function () use ($name, $start) {
            $row = DB::table('sequences')->where('name', $name)->lockForUpdate()->first();

            if (! $row) {
                DB::table('sequences')->insertOrIgnore(['name' => $name, 'value' => $start]);
                $row = DB::table('sequences')->where('name', $name)->lockForUpdate()->first();
            }

            $next = $row->value + 1;
            DB::table('sequences')->where('name', $name)->update(['value' => $next]);

            return $next;
        });
    }

    public static function code(string $prefix, string $name, int $start = 1000): string
    {
        return $prefix.'-'.static::next($name, $start);
    }
}
