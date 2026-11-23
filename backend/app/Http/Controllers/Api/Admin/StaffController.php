<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\Role as RoleEnum;
use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Sms\SmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/** Staff accounts, the role permission grid and the activity log. */
class StaffController extends Controller
{
    private const LEVELS = ['full', 'view', 'approval', 'own'];

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:60'],
            'role' => ['nullable', Rule::enum(RoleEnum::class)],
        ]);

        $query = User::staff()->where('branch_id', $request->user()->branch_id)->with('roles')->orderBy('name');
        if (! empty($data['search'])) {
            $s = '%'.addcslashes($data['search'], '%_\\').'%';
            $query->where(fn ($q) => $q->where('name', 'like', $s)->orWhere('phone', 'like', $s));
        }
        if (! empty($data['role'])) {
            $query->role($data['role']);
        }

        return UserResource::collection($query->get())->response();
    }

    public function store(Request $request, SmsService $sms): JsonResponse
    {
        $data = $this->validated($request, $sms);

        $user = DB::transaction(function () use ($data, $request) {
            $user = User::create(collect($data)->except('role')->all() + [
                'is_staff' => true,
                'branch_id' => $request->user()->branch_id,
                'phone_verified_at' => now(),
            ]);
            $user->syncRoles([$data['role']]);

            return $user;
        });

        activity('staff')->performedOn($user)->causedBy($request->user())->withProperties(['role' => $data['role']])->log('Staff added');

        return response()->json(['data' => new UserResource($user->load('roles'))], 201);
    }

    public function update(Request $request, User $staff, SmsService $sms): JsonResponse
    {
        $this->assertStaffOfBranch($request, $staff);
        $data = $this->validated($request, $sms, $staff);
        $me = $request->user();

        if ($staff->id === $me->id && ($data['role'] !== 'owner' || ($data['status'] ?? 'active') !== 'active')) {
            throw new BusinessException('You cannot change your own role or deactivate yourself.', 'forbidden', 403);
        }
        if ($staff->hasRole('owner') && $data['role'] !== 'owner' && User::role('owner')->where('status', 'active')->count() <= 1) {
            throw new BusinessException('There must always be at least one active owner.');
        }

        DB::transaction(function () use ($staff, $data) {
            $attrs = collect($data)->except('role')->filter(fn ($v, $k) => ! in_array($k, ['password', 'pin'], true) || filled($v))->all();
            $staff->update($attrs);
            $staff->syncRoles([$data['role']]);
            if (($data['status'] ?? 'active') !== 'active') {
                DB::table('sessions')->where('user_id', $staff->id)->delete();
                $staff->tokens()->delete();
            }
        });

        activity('staff')->performedOn($staff)->causedBy($me)->withProperties(['role' => $data['role'], 'status' => $data['status'] ?? 'active'])->log('Staff updated');

        return response()->json(['data' => new UserResource($staff->fresh()->load('roles'))]);
    }

    public function resetPin(Request $request, User $staff): JsonResponse
    {
        $this->assertStaffOfBranch($request, $staff);
        $pin = $request->validate(['pin' => ['required', 'digits_between:4,6']])['pin'];
        $staff->update(['pin' => $pin]);
        activity('staff')->performedOn($staff)->causedBy($request->user())->log('PIN reset');

        return response()->json(['message' => 'PIN updated.']);
    }

    /** Roles with their permission grid, as on the Staff & roles screen. */
    public function roles(): JsonResponse
    {
        $modules = config('pharmacy.modules');
        $roles = Role::with('permissions')->get()->keyBy('name');
        $counts = DB::table(config('permission.table_names.model_has_roles'))
            ->join('users', 'users.id', '=', 'model_id')
            ->where('model_type', 'user')
            ->where('users.status', 'active')
            ->whereNull('users.deleted_at')
            ->groupBy('role_id')
            ->pluck(DB::raw('COUNT(*)'), 'role_id');

        return response()->json([
            'modules' => collect($modules)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
            'levels' => self::LEVELS,
            'roles' => collect(RoleEnum::cases())->map(function (RoleEnum $r) use ($roles, $modules, $counts) {
                $role = $roles->get($r->value);
                $names = $role?->permissions->pluck('name')->all() ?? [];
                $grid = [];
                foreach (array_keys($modules) as $module) {
                    $grid[$module] = collect(self::LEVELS)->first(fn ($l) => in_array("$module.$l", $names, true));
                }

                return [
                    'name' => $r->value,
                    'label' => $r->label(),
                    'app' => $r->app(),
                    'users_count' => (int) ($role ? ($counts[$role->id] ?? 0) : 0),
                    'locked' => $r === RoleEnum::Owner,
                    'permissions' => $grid,
                ];
            }),
        ]);
    }

    /** Change one role's grid: {"permissions": {"orders": "full", "rx": null, …}}. Owner is locked. */
    public function updateRole(Request $request, string $role): JsonResponse
    {
        $enum = RoleEnum::tryFrom($role) ?? abort(404);
        if ($enum === RoleEnum::Owner) {
            throw new BusinessException('Owner permissions cannot be reduced.', 'forbidden', 403);
        }
        $modules = array_keys(config('pharmacy.modules'));
        $data = $request->validate([
            'permissions' => ['required', 'array'],
            'permissions.*' => ['nullable', Rule::in(self::LEVELS)],
        ]);

        $names = [];
        foreach ($data['permissions'] as $module => $level) {
            if (! in_array($module, $modules, true)) {
                throw new BusinessException("Unknown module: $module");
            }
            if ($level) {
                $names[] = "$module.$level";
            }
        }

        Role::findByName($enum->value, 'web')->syncPermissions($names);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        activity('staff')->causedBy($request->user())->withProperties(['role' => $enum->value, 'permissions' => $names])->log('Role permissions changed');

        return $this->roles();
    }

    /** Everything logged: sales, discounts, refunds, stock changes, Rx approvals, sign-ins. */
    public function activity(Request $request): JsonResponse
    {
        $data = $request->validate([
            'log' => ['nullable', 'string', 'max:30'],
            'user_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
        ]);

        $query = Activity::with('causer:id,name')->latest('id');
        if (! empty($data['log'])) {
            $query->where('log_name', $data['log']);
        }
        if (! empty($data['user_id'])) {
            $query->where('causer_type', 'user')->where('causer_id', $data['user_id']);
        }
        if (! empty($data['from'])) {
            $query->whereDate('created_at', '>=', $data['from']);
        }

        return response()->json($query->paginate(50, ['id', 'log_name', 'description', 'subject_type', 'subject_id', 'causer_id', 'causer_type', 'properties', 'created_at'])->withQueryString());
    }

    private function validated(Request $request, SmsService $sms, ?User $staff = null): array
    {
        $request->merge(['phone' => $sms->normalise($request->input('phone')) ?? $request->input('phone')]);

        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'regex:/^01[3-9]\d{8}$/', Rule::unique('users', 'phone')->ignore($staff?->id)],
            'email' => ['nullable', 'email', 'max:150', Rule::unique('users', 'email')->ignore($staff?->id)],
            'role' => ['required', Rule::enum(RoleEnum::class)],
            'password' => [$staff ? 'nullable' : 'required', 'string', Password::min(8)],
            'pin' => [$staff ? 'nullable' : 'required', 'digits_between:4,6'],
            'status' => ['nullable', 'in:active,inactive'],
            'shift' => ['nullable', 'in:day,evening,night,flexible'],
            'registration_no' => ['nullable', 'string', 'max:50'],
            'staff_note' => ['nullable', 'string', 'max:100'],
        ], ['phone.regex' => 'Enter a valid mobile number, e.g. 01712345678.']);
    }

    private function assertStaffOfBranch(Request $request, User $staff): void
    {
        if (! $staff->is_staff || $staff->branch_id !== $request->user()->branch_id) {
            abort(404);
        }
    }
}
