# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, `journeys/<feature>.mjs` its journeys and `seeded-breaks/<feature>.patch` the break its journeys must catch. `dms-control map` checks that every user-facing file is covered and that every feature has its journeys, its seeded break and existing docs pages.

| Feature | What the user does | Journeys |
|---|---|---|
| [auth](auth.md) | Signing in and out, the sign-in redirect of protected pages, and password recovery by emailed code. The pages are `/auth`, `/auth/forgot`, `/auth/forgot-validation` and `/auth/recover`; the API is `/api/auth/*`. | login-form-persists, login-wrong-password, protected-page-redirects, logout-ends-session, forgot-password-resets, forgot-password-wrong-code, base-written-data-upgrade |
| [block-preview](block-preview.md) | The public `/dms-preview` page renders a tree of registered blocks from `?state=` or from a postMessage, without the dashboard chrome. `GET /api/block-preview/types` lists the blocks it may draw. | preview-renders-state, preview-refuses-unknown-and-remote, preview-empty-and-unreadable, preview-postmessage-render, block-types-api-members-only |
| [module-pages](module-pages.md) | What a module's pages are made of: table views with their forms, row actions and search, record pages, realtime updates and uploads. The playground's Users table (`/table-view/table-view-users`, data API `/api/user`) stands for every table view. | table-create-record, form-required-fields, table-search-empty, table-edit-record, table-delete-record, realtime-row-reaches-other-tab, record-not-found |
| [modules-store](modules-store.md) | The installed modules page (`/modules`) and the module store (`/modules/store`, API `/dms/store/*`). Outside development the store is read-only: it lists the catalog but installs nothing. | installed-modules-open, modules-search-empty, store-read-only-outside-dev, store-listing-owners-only |
| [onboarding](onboarding.md) | The first-run wizard at `/onboarding` creates the platform owner on an empty database; `GET /api/onboarding/informations` tells the frontend whether to show it, and `POST /api/onboarding/register` is what it calls. | wizard-creates-admin, wizard-refuses-weak-password, register-rejects-invalid-body, register-refused-once-onboarded, concurrent-registers-one-owner, concurrent-registers-one-owner |
| [settings-account](settings-account.md) |  |  |
| [settings-members](settings-members.md) |  |  |
| [settings-roles](settings-roles.md) |  |  |
| [shell](shell.md) | The dashboard around every page: the sidebar and breadcrumb, the command palette, favorites, the notification bell and the error pages. It also owns the frontend server, the backend-to-frontend handshake and the notification and HTML render services the other features use. | sidebar-navigation, command-palette-navigates, command-palette-no-match, favorites-persist, sign-in-notification, unknown-page-404 |
| [smoke](smoke.md) | The fixed journey every verdict runs, whatever the diff touches: a fresh platform onboards its administrator, the administrator signs in through the form, invites a member from Settings > Members, and the invitation is still there after a reload. | smoke |
| [tenancy](tenancy.md) | Which workspace a request is bound to, who may enter it, and the tenant access gate. The playground runs one workspace, `default`, and demonstrates the gate on `/tenancy`. | default-workspace-membership, suspended-workspace-gate, tenant-routes-refuse-visitors |

The smoke journey (onboard → login → invite a member → reload) runs on every verdict.
