<?php

namespace App\Support;

use App\Exceptions\BusinessException;
use App\Models\Setting;

/**
 * "Modules & features" switches. Stored in settings as features.<key> (true/false);
 * a key never saved uses the default from config('pharmacy.features').
 */
class Features
{
    /** @return array<string, array{label:string, help?:string, core?:bool, requires?:string, default?:bool, group:string}> */
    public static function catalog(): array
    {
        $flat = [];
        foreach (config('pharmacy.features') as $group => $def) {
            foreach ($def['items'] as $key => $item) {
                $flat[$key] = $item + ['group' => $group];
            }
        }

        return $flat;
    }

    public static function enabled(string $key): bool
    {
        $item = static::catalog()[$key] ?? null;
        if (! $item) {
            return false;
        }
        if (! empty($item['core'])) {
            return true;
        }
        if (! empty($item['requires']) && ! static::enabled($item['requires'])) {
            return false;
        }

        return (bool) Setting::get("features.$key", $item['default'] ?? true);
    }

    /** @return array<string, bool> every feature and whether it is on */
    public static function all(): array
    {
        return collect(static::catalog())->mapWithKeys(fn ($_, $key) => [$key => static::enabled($key)])->all();
    }

    /** Save switches. Core features can't be turned off; unknown keys are refused. */
    public static function update(array $changes): void
    {
        $catalog = static::catalog();
        foreach ($changes as $key => $on) {
            if (! isset($catalog[$key])) {
                throw new BusinessException("Unknown feature: $key");
            }
            if (! empty($catalog[$key]['core']) && ! $on) {
                throw new BusinessException("{$catalog[$key]['label']} is a core feature and cannot be turned off.");
            }
            Setting::put("features.$key", (bool) $on);
        }
    }

    public static function require(string $key): void
    {
        if (! static::enabled($key)) {
            throw new BusinessException('This feature is turned off.', 'feature_off', 404);
        }
    }
}
