---
covers:
  - packages/dms/src/implementations/dms/tenant-access.ts
  - packages/dms/src/implementations/dms/saas-mode.ts
  - packages/dms/src/utils/ensure-default-tenant.ts
  - packages/dms/src/utils/tenant-*.ts
  - packages/dms/src/hooks/tenant-deleted.ts
  - packages/dms/src/implementations/dms-base/tenant-export-archive.ts
  - packages/dms/src/routes/auth/switch-tenant.ts
  - packages/dms/src/routes/auth/pick-tenant.ts
  - packages/dms/src/pages/public/auth/accounts.ts
  - packages/dms/frontend-vue/layers/dms-auth/app/utils/accountsFlow.ts
  - packages/interface-dms/src/tenant-*.ts
  - packages/interface-dms/src/request-tenant.ts
docs:
  - packages/dms/docs/03.auth-and-tenancy/03.multi-tenant.md
  - packages/dms/docs/03.auth-and-tenancy/04.saas-mode.md
---

# Tenancy

Which workspace a request is bound to, who may enter it, and the tenant access gate. The playground runs one workspace, `default`, and demonstrates the gate on `/tenancy`.

## Sub-features

- `default-workspace-membership`: onboarding makes the owner the default workspace's only member; `POST /api/auth/switch-tenant` to a workspace the owner is not in answers 403 `error.not_a_member`, and back to `default` returns new tokens.
- `suspended-workspace-gate`: Exposure: Suspend / restore the workspace on `/tenancy` makes gated routes answer 403 with the gate's code while the recovery page still opens; restoring reopens the members page.
- `tenant-routes-refuse-visitors`: error path: tenant routes refuse a caller without a session, and an anonymous toggle changes nothing.

## How to get to it (user POV)

- Sidebar > System > Tenancy, its header button, and any workspace page while the workspace is suspended.

## Driving it with dms-control

```bash
dms-control journey "$RUN" tenancy [journey-id...]
```

Evidence is under `$RUN/evidence/tenancy/<journey>/`.

## Gotchas

- Isolation between two workspaces needs a module that creates them (`dms-saas`). The playground has one, so cross-tenant reads are not verified here.
- The playground's gate keeps the suspended workspaces in memory: a backend restart clears it. That is the demo's behaviour, not a product promise.
