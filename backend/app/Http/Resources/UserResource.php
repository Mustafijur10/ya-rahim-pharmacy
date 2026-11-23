<?php

namespace App\Http\Resources;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
class UserResource extends JsonResource
{
    /** Include the permission list (for the signed-in user's own /me). */
    public bool $withPermissions = false;

    public function withPermissions(): static
    {
        $this->withPermissions = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $role = $this->is_staff ? $this->getRoleNames()->first() : null;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'initials' => $this->initials(),
            'phone' => $this->phone,
            'email' => $this->email,
            'is_staff' => $this->is_staff,
            'status' => $this->status,
            'role' => $role,
            'role_label' => $role ? Role::tryFrom($role)?->label() : null,
            'branch_id' => $this->branch_id,
            'shift' => $this->shift,
            'registration_no' => $this->registration_no,
            'staff_note' => $this->staff_note,
            'locale' => $this->locale,
            'last_active_at' => $this->last_active_at,
            'permissions' => $this->when($this->withPermissions && $this->is_staff, fn () => $this->getAllPermissions()->pluck('name')->sort()->values()),
            'customer' => $this->when(! $this->is_staff && $this->relationLoaded('customer'), fn () => $this->customer ? [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
                'phone' => $this->customer->phone,
            ] : null),
        ];
    }
}
