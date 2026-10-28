<?php

namespace App\Http\Controllers\Admin;

use App\Enums\UserRole;
use App\Exceptions\ShopException;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UserController extends Controller
{
    /** Admin accounts. `owner` can do everything; `staff` only handles orders and the caisse. */
    public function index(): AnonymousResourceCollection
    {
        return UserResource::collection(User::query()->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'max:50', 'alpha_dash', Rule::unique('users', 'username')],
            'password' => ['required', Password::min(8)],
            'role' => ['required', Rule::enum(UserRole::class)],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        return (new UserResource(User::create($v)))->response()->setStatusCode(201);
    }

    public function update(Request $request, User $user): UserResource
    {
        $v = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'username' => ['sometimes', 'string', 'max:50', 'alpha_dash', Rule::unique('users', 'username')->ignore($user)],
            'password' => ['sometimes', Password::min(8)],
            'role' => ['sometimes', Rule::enum(UserRole::class)],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $losesOwnerAccess = (isset($v['role']) && $v['role'] !== UserRole::Owner->value) || (isset($v['is_active']) && ! $v['is_active']);
        if ($user->isOwner() && $losesOwnerAccess) {
            $this->guardLastOwner($user, $request->user());
        }

        $user->update($v);

        return new UserResource($user->fresh());
    }

    public function destroy(Request $request, User $user): Response
    {
        if ($user->is($request->user())) {
            throw new ShopException('Vous ne pouvez pas supprimer votre propre compte.');
        }
        if ($user->isOwner()) {
            $this->guardLastOwner($user, $request->user());
        }

        $user->delete();

        return response()->noContent();
    }

    /** There must always be another active owner, and you cannot demote yourself. */
    private function guardLastOwner(User $target, User $actor): void
    {
        if ($target->is($actor)) {
            throw new ShopException('Vous ne pouvez pas retirer vos propres droits de propriétaire.');
        }

        $others = User::query()->where('role', UserRole::Owner)->where('is_active', true)->whereKeyNot($target->id)->exists();
        if (! $others) {
            throw new ShopException('Il doit rester au moins un propriétaire actif.');
        }
    }
}
