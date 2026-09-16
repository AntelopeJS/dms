---
name: dms-auth
description: Wires authentication and RBAC permissions on the AntelopeJS DMS. Use when protecting a route with @AuthUser / @AuthUserWithPermission, gating a page via its PageController options, registering permissions, or working with the user, role, and tenant models under @antelopejs/interface-dms/auth and @antelopejs/interface-dms.
category: security
tags: [auth, permissions, rbac, users, roles, tenants]
---

# Auth & permissions

Authentication answers "who is calling"; permissions answer "may they see or do this". Depth:
`docs/03.auth-and-tenancy/02.auth-and-permissions.md` (gating + RBAC) and
`01.authentication.md` (shipped flows: JWT rotation, invites, 2FA, recovery). The surface is
split across `@antelopejs/interface-dms/auth` (identity decorators),
`@antelopejs/interface-dms/guards` (permission & tenant guards), and `@antelopejs/interface-dms/permissions`
(permission registry).

## Protecting routes

Auth is applied with **parameter decorators** on controller route methods — each injects the
resolved user (or rejects if the requirement fails):

```ts
import { Controller, Get } from "@antelopejs/interface-api";
import { AuthUser, IfAuthUser } from "@antelopejs/interface-dms/auth";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { User } from "@antelopejs/interface-dms/auth/db";

export class ThingController extends Controller("/api/things") {
  @Get("")
  async list(@AuthUser() user: User) { /* requires a logged-in user, else 401 */ }

  @Get("/public")
  async maybe(@IfAuthUser() user: User | undefined) { /* optional: undefined if anonymous */ }

  @Get("/admin")
  async admin(@AuthUserWithPermission(SomePageController) user: User) { /* requires permission, else 403 */ }
}
```

From `@antelopejs/interface-dms/auth`: `@AuthUser()` (require login), `@IfAuthUser()` (optional), `@AuthRawUser()`,
`@AuthOwnerOnly()` (platform owner only). From `dms/guards`: `@AuthUserWithPermission(target)`
(permission tied to a page/component), `@AuthTenantOwner()`, `@AuthTenantMember()`.

**`@IfAuthUser()` does not 401 on an expired token** — it silently treats the caller as
anonymous and returns a normal 200. If a page must hard-fail for expired sessions (so a
refresh interceptor fires), use `@AuthUser()` and give anonymous-allowed paths their own
route. This optional-auth-returns-200 behavior has caused a real token-refresh bug.

## Protecting pages

A page's auth comes from its `PageController` options (see **dms-pages**): `publicAccess:
true` (no auth), `authOnly: true` (login only), default (login **and** the auto-derived page
permission), `permission: …` (a specific `Partial<Permission> | Action`),
`noComponentPermissions: true` (skip per-component permission derivation). Routes under a
controller that a page or `DataController` wraps **inherit** its auth — don't re-add login
checks; only add finer ones (ownership, a specific permission).

## Permissions & RBAC

Permissions are **hierarchical and auto-derived** from the page → component → action tree.
A component's permission id is the page's **`fullId`** (category chain + page id) followed by
the component key, then the action (e.g. `pages.recipes.submit-recipe.form.delete`), registered
automatically when the page loads. Users hold roles; roles hold granted permission ids; the
platform **owner** holds everything. **Module pages are special**: prefixed
`modules.<moduleId>.…`, never grantable in the Roles tree, owner-only regardless of grants.

To contribute a standalone permission, register it in `construct`:

```ts
import { RegisterPermission } from "@antelopejs/interface-dms/permissions";

RegisterPermission("cookbook.edit", {
  id: "cookbook.edit",
  title: "$dms_cookbook.perm.edit",   // i18n key — add to every locale file
  icon: "i-ph-pencil",
  defaultGranted: false,
  // dependencies: ["cookbook.view"],  // declarative metadata only — not enforced or auto-granted
});
```

Then gate with `@AuthUserWithPermission(...)` or the page/component permission options. To
check imperatively, use `dms/permissions`: `GetEffectiveUserPermissions`, `HasPermission`,
`GetPermission` / `GetPermissions` (`GetUserPermissions` for the base set). Two extension
points reshape the model: `RegisterPermissionsResolver` (`dms/permissions-resolver`) rewrites
a user's effective set, and `RegisterTenantAccessGate` (`dms/tenant-access`, checked via
`CheckTenantAccess` / `AssertTenantAccess`) can block a whole tenant. The `dms/guards`
decorators also run the tenant access gate; routes that must stay reachable for a denied
tenant (billing, recovery) opt out with `@AuthTenantOwner({ bypassTenantAccessGate: true })`.

## Users, roles, tenants

Models are exposed as interfaces: `UserModel` and `SessionModel` under
`@antelopejs/interface-dms/auth/db` (the `User` entity type — what `@AuthUser()` resolves to — lives
there too); `RoleModel`, `UserInviteModel`, `TenantModel`, `TenantMemberModel` under
`@antelopejs/interface-dms/db`. Tenant lifecycle events are observable through the DMS hooks — see
`docs/02.building/06.backend-services.md`.

The DMS is **multi-tenant by default** (single-tenant apps live in the `default` tenant).
Primitives, covered in `docs/03.auth-and-tenancy/03.multi-tenant.md`: `@TenantScopedModel`
(`dms/tenant-scoped-model`) scopes a model to the request's tenant, `getRequestTenantId`
(`dms/request-tenant`) reads it, `applyTenantOwnership`
(`dms/tenant-ownership`) upserts a user's tenant membership (roles + owner flag),
`inviteUserToTenant` (`dms/invites`, expiry `INVITE_EXPIRY_DAYS`), and `CROSS_INSTANCE`
(`@antelopejs/interface-database`) for cross-tenant queries. SaaS mode (Stripe billing,
public registration, plans gating permissions) is `docs/03.auth-and-tenancy/04.saas-mode.md`.
