---
covers:
  - packages/dms/src/routes/onboarding.ts
  - packages/dms/src/routes/system-state.ts
  - packages/dms/src/pages/public/onboarding/**
  - packages/dms/src/validation/onboarding/**
  - packages/dms/src/db/models/systemState.model.ts
  - packages/dms/src/db/tables/systemState.table.ts
  - packages/dms/src/utils/ensure-default-tenant.ts
  - packages/dms/frontend-vue/layers/dms-onboarding/**
  - packages/interface-dms/src/tenant-provisioning.ts
docs:
  - packages/dms/docs/01.getting-started/03.quickstart.md
  - packages/dms/docs/01.getting-started/06.built-in-dashboard.md
---

# Onboarding

The first-run wizard at `/onboarding` creates the platform owner on an empty database; `GET /api/onboarding/informations` tells the frontend whether to show it, and `POST /api/onboarding/register` is what it calls.

## Sub-features

- `wizard-creates-admin`: empty path then happy path: a fresh platform redirects `/` to the wizard; Platform, Administrator and Ready steps; Open the dashboard; read back through `informations` (`has_onboarded: true`) and `/api/auth/me` as the new owner (`owner: true`); a second visitor to `/onboarding` is sent to sign-in.
- `wizard-refuses-weak-password`: error path: the Administrator step lists the unmet password rules and creates nobody (`has_onboarded` stays false).
- `register-rejects-invalid-body`: error path: the API answers 400 naming each invalid field.
- `register-refused-once-onboarded`: error and persistence path: a second registration answers 400 `error.admin_already_set`, the members list keeps one owner, and `has_onboarded` survives a backend restart.
- `concurrent-registers-one-owner`: two registrations sent at once must leave one owner and no account behind a refused answer. It replays the `formal-onboarding-bootstrap` findings AtMostOneOwner and RefusedRegisterCreatedNoUser and fails on `main` until the race is fixed.

## How to get to it (user POV)

- Open the dashboard on an empty database: it redirects to `/onboarding`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" onboarding [journey-id...]
```

Every journey starts on an empty database of the run (`onboard: false` skips the administrator the harness creates otherwise). Evidence is under `$RUN/evidence/onboarding/<journey>/`.

## Gotchas

- `concurrent-registers-one-owner` fails on `main` (two owners, and the account of the request that answered 412 can sign in). It is a known finding: a verdict on a diff touching onboarding fails until the product is fixed.
- The password policy is an uppercase letter, a digit and one of `@$!%*?&`, at least 8 characters.
