<?php

namespace App\Http\Controllers\Api\Store;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Company;
use App\Models\DeliveryArea;
use App\Models\Medicine;
use App\Models\Setting;
use App\Services\PricingService;
use App\Support\Features;
use App\Support\StoreCatalog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Public store: no sign-in needed. */
class CatalogController extends Controller
{
    public function __construct(private StoreCatalog $catalog) {}

    /** Everything the home page needs in one call. */
    public function home(): JsonResponse
    {
        $branch = Branch::default();

        $mostOrdered = Medicine::active()
            ->with(StoreCatalog::CARD_RELATIONS)
            ->orderByDesc('is_featured')
            ->orderByDesc('sold_count')
            ->limit(12)
            ->get();

        return response()->json([
            'store' => $this->storeInfo(),
            'categories' => Category::active()->whereNull('parent_id')->orderBy('sort_order')->get(['id', 'name', 'name_bn', 'slug', 'icon']),
            'quick_filters' => Category::active()->whereNotNull('parent_id')->orderBy('sort_order')->get(['id', 'name', 'name_bn', 'slug']),
            'most_ordered' => $this->catalog->cards($mostOrdered, $branch->id),
            'companies' => Company::active()->where('is_featured', true)->orderBy('name')->get(['id', 'name', 'slug', 'logo']),
        ]);
    }

    public function settings(): JsonResponse
    {
        return response()->json(['store' => $this->storeInfo()]);
    }

    public function categories(): JsonResponse
    {
        return response()->json([
            'data' => Category::active()
                ->whereNull('parent_id')
                ->with(['children' => fn ($q) => $q->where('is_active', true)->select(['id', 'parent_id', 'name', 'name_bn', 'slug'])])
                ->withCount(['medicines' => fn ($q) => $q->where('is_active', true)])
                ->orderBy('sort_order')
                ->get(['id', 'name', 'name_bn', 'slug', 'icon']),
        ]);
    }

    public function companies(): JsonResponse
    {
        return response()->json([
            'data' => Company::active()
                ->withCount(['medicines' => fn ($q) => $q->where('is_active', true)])
                ->orderByDesc('is_featured')
                ->orderBy('name')
                ->get(['id', 'name', 'slug', 'logo', 'is_featured']),
        ]);
    }

    /** Browse and search: ?search=&category=&company=&generic=&rx=0|1&in_stock=1&sort=popular|name|newest */
    public function medicines(Request $request): JsonResponse
    {
        // types / brands are comma-separated slugs, e.g. ?types=thermometers,glucometers&brands=omron
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'string', 'max:100'],
            'types' => ['nullable', 'string', 'max:500'],
            'company' => ['nullable', 'string', 'max:100'],
            'brands' => ['nullable', 'string', 'max:500'],
            'generic' => ['nullable', 'string', 'max:100'],
            'rx' => ['nullable', 'boolean'],
            'in_stock' => ['nullable', 'boolean'],
            'on_discount' => ['nullable', 'boolean'],
            'min_price' => ['nullable', 'numeric', 'min:0'],
            'max_price' => ['nullable', 'numeric', 'min:0'],
            'sort' => ['nullable', 'in:popular,name,newest,price_asc,price_desc,discount'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:60'],
        ]);
        $branchId = Branch::default()->id;
        [$priceSql, $priceBindings] = Medicine::listPriceSql($branchId);
        $slugs = fn (?string $csv) => array_values(array_filter(array_map('trim', explode(',', (string) $csv))));

        // Base: search + the page's category. Facet counts are taken from this, before the filters.
        $base = Medicine::active()->search($data['search'] ?? null);
        $category = null;
        if (! empty($data['category'])) {
            $category = Category::active()->where('slug', $data['category'])->first();
            $ids = $category ? Category::where('parent_id', $category->id)->pluck('id')->push($category->id) : collect([0]);
            $base->whereIn('category_id', $ids);
        }
        if (! empty($data['generic'])) {
            $base->whereHas('generic', fn (Builder $q) => $q->where('slug', $data['generic']));
        }

        $query = (clone $base)->with(StoreCatalog::CARD_RELATIONS)->select('medicines.*');

        $types = $slugs($data['types'] ?? null);
        if ($types) {
            $query->whereHas('category', fn (Builder $q) => $q->whereIn('slug', $types));
        }
        $brands = array_merge($slugs($data['brands'] ?? null), $slugs($data['company'] ?? null));
        if ($brands) {
            $query->whereHas('company', fn (Builder $q) => $q->whereIn('slug', $brands));
        }
        if (isset($data['rx'])) {
            $query->where('rx_required', (bool) $data['rx']);
        }
        if (! empty($data['in_stock'])) {
            $query->inStock($branchId);
        }
        if (! empty($data['on_discount'])) {
            $query->where('discount_percent', '>', 0);
        }
        if (isset($data['min_price'])) {
            $query->whereRaw("$priceSql >= ?", [...$priceBindings, $data['min_price']]);
        }
        if (isset($data['max_price'])) {
            $query->whereRaw("$priceSql <= ?", [...$priceBindings, $data['max_price']]);
        }

        match ($data['sort'] ?? 'popular') {
            'name' => $query->orderBy('name')->orderBy('strength'),
            'newest' => $query->latest('medicines.id'),
            'price_asc' => $query->orderByRaw("$priceSql asc", $priceBindings),
            'price_desc' => $query->orderByRaw("$priceSql desc", $priceBindings),
            'discount' => $query->orderByDesc('discount_percent')->orderByDesc('sold_count'),
            default => $query->orderByDesc('sold_count')->orderBy('name'),
        };

        $page = $query->paginate($data['per_page'] ?? 24)->withQueryString();

        return response()->json([
            'data' => $this->catalog->cards($page->getCollection(), $branchId),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'from' => $page->firstItem(),
                'to' => $page->lastItem(),
            ],
            'category' => $category?->only(['id', 'name', 'name_bn', 'slug']),
            'facets' => $this->facets($base, $branchId),
        ]);
    }

    /** Counts for the filter sidebar: types (sub-categories), brands, availability. */
    private function facets(Builder $base, int $branchId): array
    {
        $ids = (clone $base)->pluck('medicines.id');

        return [
            'types' => Category::active()
                ->whereHas('medicines', fn (Builder $q) => $q->whereIn('medicines.id', $ids))
                ->withCount(['medicines' => fn (Builder $q) => $q->whereIn('medicines.id', $ids)])
                ->orderBy('sort_order')
                ->get(['id', 'name', 'name_bn', 'slug'])
                ->map(fn ($c) => ['slug' => $c->slug, 'name' => $c->name, 'name_bn' => $c->name_bn, 'count' => $c->medicines_count]),
            'brands' => Company::active()
                ->whereHas('medicines', fn (Builder $q) => $q->whereIn('medicines.id', $ids))
                ->withCount(['medicines' => fn (Builder $q) => $q->whereIn('medicines.id', $ids)])
                ->orderByDesc('medicines_count')
                ->limit(15)
                ->get(['id', 'name', 'slug'])
                ->map(fn ($c) => ['slug' => $c->slug, 'name' => $c->name, 'count' => $c->medicines_count]),
            'in_stock' => Medicine::whereIn('id', $ids)->inStock($branchId)->count(),
            'on_discount' => Medicine::whereIn('id', $ids)->where('discount_percent', '>', 0)->count(),
            'total' => $ids->count(),
        ];
    }

    /** Search-as-you-type: top matches by brand or generic. */
    public function suggest(Request $request): JsonResponse
    {
        $q = (string) $request->validate(['q' => ['required', 'string', 'min:2', 'max:60']])['q'];

        $medicines = Medicine::active()
            ->with(StoreCatalog::CARD_RELATIONS)
            ->search($q)
            ->orderByDesc('sold_count')
            ->limit(8)
            ->get();

        return response()->json(['data' => $this->catalog->cards($medicines, Branch::default()->id)]);
    }

    public function show(string $slug): JsonResponse
    {
        $medicine = Medicine::active()->where('slug', $slug)->firstOrFail();

        return response()->json(['data' => $this->catalog->detail($medicine, Branch::default()->id)]);
    }

    public function deliveryAreas(): JsonResponse
    {
        return response()->json([
            'data' => DeliveryArea::active()->get(['id', 'name', 'name_bn', 'standard_fee', 'express_fee', 'express_available']),
            'pickup_ready_minutes' => (int) Setting::get('delivery.pickup_ready_minutes', 30),
            'express_hours' => (int) Setting::get('delivery.express_hours', 2),
            'same_day_cutoff' => Setting::get('delivery.same_day_cutoff'),
        ]);
    }

    /** Price a cart without placing an order. */
    public function quote(Request $request, PricingService $pricing): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.medicine_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:500'],
            'items.*.pack_size_id' => ['nullable', 'integer'],
            'delivery_type' => ['nullable', 'in:express,standard,pickup'],
            'delivery_area_id' => ['nullable', 'integer'],
        ]);

        return response()->json($pricing->quote(
            $data['items'],
            Branch::default()->id,
            $data['delivery_type'] ?? null,
            $data['delivery_area_id'] ?? null,
        ));
    }

    private function storeInfo(): array
    {
        $keys = ['name', 'phone', 'whatsapp', 'email', 'address', 'area', 'opening_hours', 'hours_sat_thu', 'hours_friday', 'delivery_hours', 'drug_licence_no', 'trade_licence_no', 'tin_bin', 'since_year', 'map_url'];
        $info = [];
        foreach ($keys as $key) {
            $info[$key] = Setting::get("store.$key");
        }

        return $info + [
            'payment_methods' => Setting::get('payments.methods', ['cash']),
            'features' => Features::all(),
            'same_day_cutoff' => Setting::get('delivery.same_day_cutoff'),
        ];
    }
}
