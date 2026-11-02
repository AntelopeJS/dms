## Verify: FAIL

**Head** `5d93cf7` · **Skill** `verify-dms` @ `a6711ec` (not trusted yet) · **Verifier** fresh subagent of the implementing session; did not write the change

### One-way doors
| Kind | Location | What cannot be undone | Containment |
|---|---|---|---|
| format | `packages/interface-dms/src/db/tables/tenants.table.ts` | This version writes `provisioningHolder` and `provisioningRevision` on the `default` tenant's stored row (seen after `reset`: holder null, revision a UUID). A revert leaves both fields in the row. | Both fields are optional and additive. The base version reads only `provisioningPending` and ignores the extra fields. The containment journey passed in this run: this version reads what the base version wrote. (journey `auth/base-written-data-upgrade`) |
| contract | `packages/interface-dms/src/db/tables/tenants.table.ts` | The public `Tenant` table gains `provisioningHolder` (a declared field) and `provisioningRevision` (undeclared on purpose). Once modules read them, removing or renaming either is a breaking change. | Additive and optional. No module needs them: the DMS writes them for its own lease. |
| contract | `packages/interface-dms/src/hooks.ts` | The TSDoc of `TENANT_BEING_PROVISIONED` now promises module authors that the `default` tenant's handlers may run again after a failed attempt or a dead holder, and fire on the replica holding the lease. | TSDoc only, no emitted code. It states what the base already did after a failed attempt (the row stays pending for the next start), and adds the dead-holder takeover. |
| contract | `packages/dms/src/config/internal/state.ts` | A new optional config key `provisioningLease` ({ renewEveryMs, staleAfterMs, pollEveryMs }), documented in 02.building/02.configuration.md. Once projects set it, removing it is a breaking change. | Optional, with defaults (10 s, 60 s, 5 s) that match the docs. A project that does not set it behaves the same as one that sets the defaults. |

### Touched features
- `module-pages` (diff: `packages/interface-dms/src/db/tables/tenants.table.ts`)
- `onboarding` (diff: `packages/dms/src/utils/ensure-default-tenant.ts`)
- `shell` (diff: `packages/dms/src/config/internal/state.ts`, `packages/dms/src/index.ts`, `packages/interface-dms/src/hooks.ts`)
- `tenancy` (diff: `packages/dms/src/utils/ensure-default-tenant.ts`)
- smoke: onboard → login → invite a member → reload
- containment journeys of the Data and Format doors: `auth/base-written-data-upgrade`

### Why it fails
- onboarding/concurrent-registers-one-owner failed
- shell/command-palette-no-match failed

### Journeys
| Feature | Entry point | Result | Evidence |
|---|---|---|---|
| smoke | `smoke`: POST /api/onboarding/register, then the sign-in form and Settings > Members > Invite members | pass: a fresh platform onboards, its admin signs in, invites a member, and the invitation survives a reload | [smoke/smoke](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/smoke/smoke) |
| module-pages | `table-create-record`: /table-view/table-view-users > New entry | pass: New entry creates a user that the table lists, and it survives a reload and a backend restart | [module-pages/table-create-record](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/module-pages/table-create-record) |
| module-pages | `form-required-fields`: /table-view/table-view-users/table/new | pass: Create with empty required fields names them and stores nothing | [module-pages/form-required-fields](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/module-pages/form-required-fields) |
| module-pages | `table-search-empty`: /table-view/table-view-users search | pass: a search that matches no user shows the empty table, and clearing it lists them again | [module-pages/table-search-empty](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/module-pages/table-search-empty) |
| module-pages | `table-edit-record`: row menu > Edit | pass: Edit from the row menu renames a user, and the new name persists | [module-pages/table-edit-record](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/module-pages/table-edit-record) |
| module-pages | `table-delete-record`: row menu > Delete | pass: Delete from the row menu asks to confirm, then the user is gone from the table and the API | [module-pages/table-delete-record](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/module-pages/table-delete-record) |
| module-pages | `realtime-row-reaches-other-tab`: realtime: /api/realtime/connection shared by the tabs of a browser | pass: a user created in one tab appears in another tab on the same table without a reload | [module-pages/realtime-row-reaches-other-tab](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/module-pages/realtime-row-reaches-other-tab) |
| module-pages | `record-not-found`: /table-view/table-view-users/table/<missing id>/edit | pass: the edit page of a record that does not exist says so instead of an empty form | [module-pages/record-not-found](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/module-pages/record-not-found) |
| onboarding | `wizard-creates-admin`: /onboarding wizard (Platform, Administrator, Ready) | pass: the wizard names the platform, creates the owner, signs it in, and the platform stays onboarded | [onboarding/wizard-creates-admin](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/onboarding/wizard-creates-admin) |
| onboarding | `wizard-refuses-weak-password`: /onboarding wizard, Administrator step | pass: the wizard lists the unmet password rules and creates nobody | [onboarding/wizard-refuses-weak-password](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/onboarding/wizard-refuses-weak-password) |
| onboarding | `register-rejects-invalid-body`: POST /api/onboarding/register | pass: POST /api/onboarding/register answers 400 with the invalid fields and creates nobody | [onboarding/register-rejects-invalid-body](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/onboarding/register-rejects-invalid-body) |
| onboarding | `register-refused-once-onboarded`: POST /api/onboarding/register | pass: a second registration after onboarding is refused and the first owner stays the only one | [onboarding/register-refused-once-onboarded](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/onboarding/register-refused-once-onboarded) |
| onboarding | `concurrent-registers-one-owner`: POST /api/onboarding/register, twice concurrently | **fail**: two registrations sent at once leave exactly one platform owner (formal-onboarding-bootstrap AtMostOneOwner) | [onboarding/concurrent-registers-one-owner](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/onboarding/concurrent-registers-one-owner) |
| shell | `sidebar-navigation`: sidebar navigation and breadcrumb | pass: the sidebar opens a page, the breadcrumb names it, and a reload stays on it | [shell/sidebar-navigation](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/shell/sidebar-navigation) |
| shell | `command-palette-navigates`: command palette (Ctrl K) | pass: Ctrl K searches pages and Enter opens the first match | [shell/command-palette-navigates](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/shell/command-palette-navigates) |
| shell | `command-palette-no-match`: command palette (Ctrl K), empty result | **fail**: a palette search that matches nothing shows no option and opens nothing | [shell/command-palette-no-match](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/shell/command-palette-no-match) |
| shell | `favorites-persist`: page header > Add to favorites | pass: a favorite page appears in the sidebar, survives a reload and a new tab, and can be removed | [shell/favorites-persist](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/shell/favorites-persist) |
| shell | `sign-in-notification`: header > Notifications | pass: signing in from a new device puts a notification behind the bell, which opens the inbox | [shell/sign-in-notification](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/shell/sign-in-notification) |
| shell | `unknown-page-404`: any unknown URL | pass: an unknown path shows the 404 page with a way home | [shell/unknown-page-404](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/shell/unknown-page-404) |
| tenancy | `default-workspace-membership`: POST /api/auth/switch-tenant, /api/tables/members/list | pass: onboarding makes the owner a member of the default workspace, and switching to a workspace it is not in answers 403 | [tenancy/default-workspace-membership](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/tenancy/default-workspace-membership) |
| tenancy | `suspended-workspace-gate`: /tenancy header action, RegisterTenantAccessGate | pass: suspending the workspace makes gated pages refuse the owner while the recovery page still answers, and restoring it reopens them | [tenancy/suspended-workspace-gate](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/tenancy/suspended-workspace-gate) |
| tenancy | `tenant-routes-refuse-visitors`: AuthTenantMember guards | pass: tenant-scoped routes refuse a caller without a session | [tenancy/tenant-routes-refuse-visitors](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/tenancy/tenant-routes-refuse-visitors) |

### Formal checks
- None ran.

### Docs
- `packages/dms/docs/02.building/03.pages-and-components.md`: matches. The diff does not change it. The module-pages journeys (create, edit, delete, search, record not found, realtime) behave as it describes.
- `packages/dms/docs/04.components/08.tables/0.index.md`: matches. The diff does not change it. The table journeys passed.
- `packages/dms/docs/04.components/07.forms/0.index.md`: matches. The diff does not change it. form-required-fields and table-edit-record passed.
- `packages/dms/docs/06.frontend-composables/03.realtime-and-notifications.md`: matches. The diff does not change it. realtime-row-reaches-other-tab and sign-in-notification passed.
- `packages/dms/docs/01.getting-started/03.quickstart.md`: matches. The diff does not change it. Onboarding, sign-in and inviting a member (smoke) passed.
- `packages/dms/docs/01.getting-started/06.built-in-dashboard.md`: matches. The diff does not change it. The wizard journeys passed. The known race in concurrent-registers-one-owner (a request refused with 412 still creates an owner) contradicts 'the wizard locks itself' only for concurrent requests. That finding comes from main, not from this diff.
- `packages/dms/docs/05.extending-the-dashboard/02.dashboard-chrome.md`: matches. Its 'Command palette assistant' section says every non-empty search ends with 'Ask the assistant “query”' and, when nothing matches, that item is the only one. command-palette-no-match showed exactly that with the playground's assistant demo. The page matches the product; the journey's expectation is stale.
- `packages/dms/docs/02.building/04.navigation.md`: matches. The diff does not change it. sidebar-navigation, command-palette-navigates and unknown-page-404 passed.
- `packages/dms/docs/03.auth-and-tenancy/03.multi-tenant.md`: matches. The tenancy journeys passed on a database whose `default` tenant this version created and provisioned. The page's claim that `ProvisionTenant` registers the tenant instance before the hook fires is untouched.
- `packages/dms/docs/03.auth-and-tenancy/04.saas-mode.md`: matches. The diff does not change it. SaaS signup provisioning is not on the changed path, and the playground has no dms-saas.
- `packages/dms/docs/02.building/02.configuration.md`: matches. The new `provisioningLease` row's defaults match getProvisioningLeaseConfig (10000, 60000, 5000).
- `packages/dms/docs/02.building/06.backend-services.md`: matches. After `reset` on an empty database, one process created the row, provisioned it and released the lease (pending false, holder null). 'On one replica at a time' holds only while the holder keeps renewing: see attention.
- `packages/interface-dms/docs/1.core/7.hooks.md`: matches. It matches the code: one elected holder, takeover after a failed attempt or a dead holder, handlers rerun and must skip what they already wrote.

### Not verified
- Two replicas starting on one empty database. dms-control runs one backend per run and no journey starts a second one, so I saw only the single-process first boot (after `reset`, the `default` row read provisioningPending false, provisioningHolder null, provisioningRevision set). The only evidence for two replicas is the PR's integration test first-boot-replicas.test.ts. Both its cases ('both start and exactly one provisions', 'the other replica resumes after the holder is killed') passed in the PR's CI job `backend (integration)` on 5d93cf770. I did not run them locally.
- Complete provisioning content and no duplicates. The playground registers no TENANT_BEING_PROVISIONED handler, so the run had no provisioned rows to count. Only the pending marker was observed.
- Takeover after a failed attempt, a killed holder or a stale lease. No journey reaches it. The unit test tenant-provisioning-lease.test.ts and the integration test cover it, and both passed in CI.

### Attention
- onboarding/concurrent-registers-one-owner fails (2 platform owners; the request refused with 412 leaves an account that can sign in). This is the known finding the onboarding Gotchas record on main. The diff does not change the onboarding route, but ensure-default-tenant.ts is under the onboarding feature's globs, so rule 3 fails the verdict until the product is fixed.
- shell/command-palette-no-match fails: 1 option where it expects none, and no 'No matching data'. Since #441 (59a1390c3) the playground declares its frontend, and that frontend's command-palette-assistant-demo plugin adds 'Ask the assistant “qqxzjjwv”' to every search, as 02.dashboard-chrome.md documents. The diff touches neither the palette, the frontend nor the playground, so the journey is stale on main and needs its own fix. It is not a defect of this change.
- A holder whose renewals stop for staleAfterMs can be taken over while its handlers still run, for example because its event loop is blocked or it cannot reach the database while others can. Its handlers are not aborted, so two replicas can then run TENANT_BEING_PROVISIONED at the same time. 06.backend-services.md says 'on one replica at a time'. Only the provisioningLease config row mentions the risk of taking over a holder that is only slow. Handlers must already be idempotent, but the owner may want the docs to say that the run can be concurrent, not only repeated.

Evidence: `verify-evidence` branch, [`pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/`](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-657/5d93cf770fec840ddfc973d0d70b00fcecb4a415/)
