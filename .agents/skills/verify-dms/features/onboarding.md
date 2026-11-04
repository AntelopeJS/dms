---
covers:
  - packages/dms/src/routes/onboarding.ts
  - packages/dms/src/routes/system-state.ts
  - packages/dms/src/pages/public/onboarding/**
  - packages/dms/src/validation/onboarding/**
  - packages/dms/src/db/models/systemState.model.ts
  - packages/dms/src/db/tables/systemState.table.ts
  - packages/dms/src/db/models/setupToken.model.ts
  - packages/dms/src/db/tables/setupToken.table.ts
  - packages/dms/src/db/setup-token.ts
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

- `wizard-creates-admin`: empty path then happy path: a fresh platform redirects `/` to the wizard; Platform, Administrator and Ready steps; Open the dashboard; read back through `informations` (`has_onboarded: true`) and `/api/auth/me` as the new owner (`owner: true`); a second visitor to `/onboarding` is sent to sign-in, which names the platform the wizard created (persistence).
- `wizard-refuses-weak-password`: error path: the Administrator step lists the unmet password rules and creates nobody (`has_onboarded` stays false).
- `register-rejects-invalid-body`: error path: the API answers 400 naming each invalid field.
- `register-needs-the-setup-token`: error path: a registration without the token or with a wrong one answers 403 `error.invalid_setup_token` and creates nobody; the token creates the owner once and a second registration answers `error.admin_already_set`.
- `wizard-reads-the-setup-token-from-the-address`: `/onboarding?token=…` is read by the wizard, dropped from the URL, and the Administrator step does not ask for it. Without the token in the address, the other wizard journeys type it into the Setup token field.
- `register-refused-once-onboarded`: error and persistence path: a second registration answers 400 `error.admin_already_set`, the members list keeps one owner, and `has_onboarded` survives a backend restart.
- `concurrent-registers-one-owner`: two registrations sent at once, both with the right token, must leave one owner and no account behind a refused answer. The setup token fixes AtMostOneOwner; the RefusedRegisterCreatedNoUser finding of `formal-onboarding-bootstrap` needs a register and a status poll, which this journey does not send.

## How to get to it (user POV)

- Open the dashboard on an empty database: it redirects to `/onboarding`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" onboarding [journey-id...]
```

Every journey starts on an empty database of the run (`onboard: false` skips the administrator the harness creates otherwise). Evidence is under `$RUN/evidence/onboarding/<journey>/`.

## Gotchas

- Every run starts its backend with a fresh `DMS_SETUP_TOKEN` (`ctx.setupToken()`), so the harness's `onboard` and the wizard journeys register with it.
- The password policy is an uppercase letter, a digit and one of `@$!%*?&`, at least 8 characters.
