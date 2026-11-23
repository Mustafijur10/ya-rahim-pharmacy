<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\BatchResource;
use App\Models\Category;
use App\Models\Company;
use App\Models\Generic;
use App\Models\Medicine;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Medicine master data, plus categories, companies, generics and suppliers. */
class MedicineController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:60'],
            'category_id' => ['nullable', 'integer'],
            'company_id' => ['nullable', 'integer'],
            'active' => ['nullable', 'boolean'],
        ]);

        $query = Medicine::with(['generic:id,name', 'company:id,name', 'category:id,name', 'defaultPackSize'])
            ->withSum(['batches as stock_units' => fn ($q) => $q->where('branch_id', $request->user()->branch_id)->where('status', 'active')->whereDate('expiry_date', '>', now()->toDateString())], 'quantity')
            ->search($data['search'] ?? null)
            ->orderBy('name');

        foreach (['category_id', 'company_id'] as $key) {
            if (! empty($data[$key])) {
                $query->where($key, $data[$key]);
            }
        }
        if (isset($data['active'])) {
            $query->where('is_active', (bool) $data['active']);
        }

        return response()->json($query->paginate(30)->withQueryString());
    }

    public function show(Request $request, Medicine $medicine): JsonResponse
    {
        $medicine->load(['generic', 'company', 'category', 'packSizes']);
        $batches = $medicine->batches()
            ->where('branch_id', $request->user()->branch_id)
            ->with(['supplier:id,name', 'medicine.defaultPackSize'])
            ->orderBy('expiry_date')
            ->get();

        return response()->json([
            'data' => $medicine,
            'batches' => BatchResource::collection($batches),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $medicine = DB::transaction(function () use ($data) {
            $medicine = Medicine::create($this->attributes($data) + ['slug' => $this->slug($data)]);
            $this->syncPacks($medicine, $data['pack_sizes']);

            return $medicine;
        });

        return response()->json(['data' => $medicine->load('packSizes')], 201);
    }

    public function update(Request $request, Medicine $medicine): JsonResponse
    {
        $data = $this->validated($request, $medicine);

        DB::transaction(function () use ($medicine, $data) {
            $medicine->update($this->attributes($data));
            $this->syncPacks($medicine, $data['pack_sizes']);
        });

        return response()->json(['data' => $medicine->fresh()->load('packSizes')]);
    }

    /** Add a photo (shown on the website). Stored on the public disk as /storage/medicines/… */
    public function addImage(Request $request, Medicine $medicine): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096']]);
        $images = $medicine->images ?? [];
        abort_if(count($images) >= 6, 422, 'A medicine can have at most 6 photos.');

        $path = $request->file('image')->store('medicines', 'public');
        $images[] = '/storage/'.$path;
        $medicine->update(['images' => $images]);

        return response()->json(['data' => ['images' => $images]], 201);
    }

    public function removeImage(Request $request, Medicine $medicine): JsonResponse
    {
        $url = (string) $request->validate(['url' => ['required', 'string']])['url'];
        $images = array_values(array_filter($medicine->images ?? [], fn ($i) => $i !== $url));
        $medicine->update(['images' => $images]);
        if (str_starts_with($url, '/storage/medicines/')) {
            Storage::disk('public')->delete(substr($url, strlen('/storage/')));
        }

        return response()->json(['data' => ['images' => $images]]);
    }

    /** Hides a medicine from sale. History stays. */
    public function destroy(Medicine $medicine): JsonResponse
    {
        $medicine->update(['is_active' => false]);
        $medicine->delete();

        return response()->json(['message' => 'Medicine removed from sale.']);
    }

    /** Dropdown data for the medicine form and filters. */
    public function references(): JsonResponse
    {
        return response()->json([
            'categories' => Category::orderBy('sort_order')->get(['id', 'parent_id', 'name', 'slug', 'is_active']),
            'companies' => Company::orderBy('name')->get(['id', 'name', 'slug', 'is_active']),
            'generics' => Generic::orderBy('name')->get(['id', 'name', 'slug']),
            'suppliers' => Supplier::where('is_active', true)->orderBy('name')->get(['id', 'name', 'phone', 'balance']),
        ]);
    }

    /* ---- Small catalog lists: categories, companies, generics, suppliers ---- */

    public function saveCategory(Request $request, ?Category $category = null): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'name_bn' => ['nullable', 'string', 'max:100'],
            'parent_id' => ['nullable', 'integer', 'exists:categories,id'],
            'icon' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['boolean'],
        ]);
        $category ??= new Category(['slug' => $this->uniqueSlug(Category::class, $data['name'])]);
        $category->fill($data)->save();

        return response()->json(['data' => $category], $category->wasRecentlyCreated ? 201 : 200);
    }

    public function saveCompany(Request $request, ?Company $company = null): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'is_featured' => ['boolean'],
            'is_active' => ['boolean'],
        ]);
        $company ??= new Company(['slug' => $this->uniqueSlug(Company::class, $data['name'])]);
        $company->fill($data)->save();

        return response()->json(['data' => $company], $company->wasRecentlyCreated ? 201 : 200);
    }

    public function saveGeneric(Request $request, ?Generic $generic = null): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('generics', 'name')->ignore($generic?->id)],
            'therapeutic_class' => ['nullable', 'string', 'max:150'],
            'overview' => ['nullable', 'string', 'max:5000'],
            'indications' => ['nullable', 'string', 'max:5000'],
            'side_effects' => ['nullable', 'string', 'max:5000'],
            'precautions' => ['nullable', 'string', 'max:5000'],
            'storage' => ['nullable', 'string', 'max:2000'],
        ]);
        $generic ??= new Generic(['slug' => $this->uniqueSlug(Generic::class, $data['name'])]);
        $generic->fill($data)->save();

        return response()->json(['data' => $generic], $generic->wasRecentlyCreated ? 201 : 200);
    }

    /* ---------------- helpers ---------------- */

    private function validated(Request $request, ?Medicine $medicine = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'strength' => ['nullable', 'string', 'max:50'],
            'dosage_form' => ['nullable', 'string', 'max:50'],
            'generic_id' => ['nullable', 'integer', 'exists:generics,id'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'barcode' => ['nullable', 'string', 'max:64'],
            'unit_name' => ['required', 'string', 'max:20'],
            'rx_required' => ['required', 'boolean'],
            'is_cold_chain' => ['boolean'],
            'discount_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'reorder_level' => ['required', 'integer', 'min:0'],
            'description' => ['nullable', 'string', 'max:5000'],
            'indications' => ['nullable', 'string', 'max:5000'],
            'side_effects' => ['nullable', 'string', 'max:5000'],
            'storage' => ['nullable', Rule::in(['room', 'fridge', 'cool_dry'])],
            'is_antibiotic' => ['boolean'],
            'sell_online' => ['boolean'],
            'allow_loose_sale' => ['boolean'],
            'default_rack' => ['nullable', 'string', 'max:30'],
            'vat_percent' => ['nullable', 'numeric', 'min:0', 'max:30'],
            'default_cost' => ['nullable', 'numeric', 'min:0'],
            'default_mrp' => ['nullable', 'numeric', 'min:0', 'gte:default_cost'],
            'is_featured' => ['boolean'],
            'is_active' => ['boolean'],
            'pack_sizes' => ['required', 'array', 'min:1', 'max:5'],
            'pack_sizes.*.id' => ['nullable', 'integer'],
            'pack_sizes.*.name' => ['required', 'string', 'max:100'],
            'pack_sizes.*.short_name' => ['required', 'string', 'max:30'],
            'pack_sizes.*.units' => ['required', 'integer', 'min:1', 'max:10000'],
            'pack_sizes.*.extra_discount_percent' => ['nullable', 'numeric', 'min:0', 'max:50'],
            'pack_sizes.*.is_default' => ['boolean'],
        ]);
    }

    private function attributes(array $data): array
    {
        $attrs = collect($data)->except('pack_sizes')->all();
        if (array_key_exists('storage', $attrs)) {
            $attrs['storage'] ??= 'room';
            $attrs['is_cold_chain'] = $attrs['storage'] === 'fridge';
        }
        if (array_key_exists('vat_percent', $attrs)) {
            $attrs['vat_percent'] ??= 0;
        }

        return $attrs;
    }

    private function syncPacks(Medicine $medicine, array $packs): void
    {
        $hasDefault = collect($packs)->contains(fn ($p) => ! empty($p['is_default']));
        $keep = [];
        foreach (array_values($packs) as $i => $p) {
            $attrs = [
                'name' => $p['name'],
                'short_name' => $p['short_name'],
                'units' => $p['units'],
                'extra_discount_percent' => $p['extra_discount_percent'] ?? 0,
                'is_default' => $hasDefault ? ! empty($p['is_default']) : $i === 0,
                'sort_order' => $i,
            ];
            $pack = ! empty($p['id']) ? $medicine->packSizes()->find($p['id']) : null;
            $pack ? $pack->update($attrs) : ($pack = $medicine->packSizes()->create($attrs));
            $keep[] = $pack->id;
        }
        $medicine->packSizes()->whereNotIn('id', $keep)->delete();
    }

    private function slug(array $data): string
    {
        return $this->uniqueSlug(Medicine::class, implode(' ', array_filter([$data['name'], $data['strength'] ?? null, $data['dosage_form'] ?? null])));
    }

    private function uniqueSlug(string $model, string $text): string
    {
        $base = Str::slug($text) ?: Str::lower(Str::random(8));
        $slug = $base;
        $i = 2;
        while ($model::withoutGlobalScopes()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }
}
