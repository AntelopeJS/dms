---
covers:
  - packages/dms/src/pages/settings/users/role*.ts
  - packages/dms/src/pages/permissions.ts
  - packages/dms/src/implementations/dms/permissions.ts
  - packages/dms/src/implementations/dms/permissions-resolver.ts
  - packages/dms/src/implementations/dms/permission-preview.ts
  - packages/dms/src/implementations/dms/guards.ts
  - packages/dms/src/validation/role-editor.schema.ts
  - packages/dms/src/pages/settings/users/permission-tree-nodes.ts
  - packages/dms/frontend-vue/layers/dms-layout/app/build/components/pages/settings/roles/**
  - packages/dms/frontend-vue/layers/dms-core/app/components/PermissionGate.vue
  - packages/interface-dms/src/data-controllers/roles.ts
  - packages/interface-dms/src/permissions.ts
  - packages/interface-dms/src/permissions-resolver.ts
  - packages/interface-dms/src/permission-gate.ts
docs:
  - packages/dms/docs/03.auth-and-tenancy/02.auth-and-permissions.md
---

# Roles and permissions

What each role can see and do, and who holds it. Settings > Workspace > Roles is a list of roles beside an editor with the permission tree; the Owner entry is built in and locked. The page is `/settings/workspace/roles`, its actions are under `/dms/pages/settings/workspace/roles` (`create`, `:id`, `:id/duplicate`, `overview`, `editor-tree`, `preview`), and the stored roles are at `/api/tables/roles`.

## Sub-features

- `roles-empty-state`: empty path: a fresh workspace lists only the locked Owner (no Save, no actions), the roles table is empty, and the invite dialog says "No role yet. Create one in Roles & permissions."
- `create-role-persists`: happy and persistence path: New role with a name, a description and one permission is listed after a reload and stored with exactly that permission; a second role with the same name is refused.
- `role-validation-errors`: error path: a blank name shows "This field is required." and keeps the draft; the API answers 400 for a blank name and for a name over 80 characters; Discard leaves nothing behind.
- `role-search-no-match`: empty path: a search without a match shows "No role matches this search." and keeps the Owner; a matching search keeps the role.
- `role-assigned-through-invitation`: a role chosen on an invitation counts as a pending invite, then as a member once the invitation is accepted, in the editor and in the `overview` API.
- `role-edit-changes-access`: the **Exposure** journey. A member whose role grants only the Playground page is refused Roles (403 "Forbidden"); the `preview` API, the member's page and the stored role agree before and after the role gains the Roles permission, and again after it loses it; the editor says "applies to <member> on their next page load".
- `role-preview-opens-tab`: Preview as <role> opens a new tab with the Role preview bar, menu entries marked "Hidden for <role>", and the page hidden; Exit preview ends it.
- `role-duplicate`: Duplicate role stores "<name> (copy)" with the same permissions.
- `role-delete-unused`: containment path: the dialog says nobody holds the role; Cancel keeps it; Delete removes it from the list and the API after a reload.
- `role-delete-in-use-moves-members`: containment path: the dialog counts the holders and offers "Move them to"; after deleting, the member holds the chosen role and is refused the page the deleted role granted.

## How to get to it (user POV)

- Settings > Workspace > Roles, then New role, or pick a role in the list; More role actions has Duplicate role and Delete role.
- Settings > Workspace > Members > Invite members, where the Roles picker lists the roles.

## Driving it with dms-control

```bash
dms-control journey "$RUN" settings-roles [journey-id...]
```

The permission tree is checkboxes by name: "Export reports" is the one permission outside any page, "Playground" and "Roles" are page branches. Members are made by invitation and accepted in an `anon` tab; their tabs show "Forbidden" (HTTP 403) on a page their role does not grant. Roles for setup are created through `POST /dms/pages/settings/workspace/roles/create`. Evidence is under `$RUN/evidence/settings-roles/<journey>/`.

## Gotchas

- Owner is not a stored role: `/api/tables/roles/list` is empty on a fresh workspace while the page shows "Roles 1".
- Ticking a page adds its ancestors (`settings`, `settings.workspace`) and its form permission; API-created roles must list them too (`settings.workspace.playground.form`) or the menu entry stays hidden.
- Preview as role opens a tab with `window.open`; the journey reads it through the raw Playwright context (`tab.page.context()`), since `Tab` has no popup helper.
- Several checks read counts and badges from the ARIA tree because the page's text is upper-cased by CSS.
- Not driven: permissions the viewer cannot grant, the owner-level warnings on risky permissions, and unsaved-changes prompts when leaving the editor.
