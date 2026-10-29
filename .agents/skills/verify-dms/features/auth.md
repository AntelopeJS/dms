---
covers:
  - packages/dms/src/routes/auth.ts
  - packages/dms/src/routes/auth/**
  - packages/dms/src/routes/authentication.ts
  - packages/dms/src/routes/oauth.ts
  - packages/dms/src/routes/oauth-config.ts
  - packages/dms/src/pages/public/auth/**
  - packages/dms/src/pages/public/index.ts
  - packages/dms/src/implementations/dms-auth/**
  - packages/dms/src/validation/auth.schema.ts
  - packages/dms/src/validation/password.ts
  - packages/dms/src/validation/security.schema.ts
  - packages/dms/src/config/session-handoff.ts
  - packages/dms/src/crons/sweep-expired-sessions.ts
  - packages/dms/src/db/models/signInAttempts.model.ts
  - packages/dms/src/db/tables/signInAttempts.table.ts
  - packages/dms/src/db/models/userKnownDevices.model.ts
  - packages/dms/src/db/tables/userKnownDevices.table.ts
  - packages/dms/src/hooks/internal/sign-in-monitor.ts
  - packages/dms/src/utils/attempt-limiter.ts
  - packages/dms/src/utils/auth-constants.ts
  - packages/dms/src/utils/auth-key.ts
  - packages/dms/src/utils/failed-sign-ins.ts
  - packages/dms/src/utils/login-throttle.ts
  - packages/dms/src/utils/one-time-code.ts
  - packages/dms/src/utils/sign-in-*.ts
  - packages/dms/src/utils/two-factor-*.ts
  - packages/dms/src/utils/client-ip.ts
  - packages/dms/src/utils/client-ip/**
  - packages/dms/src/utils/request-email-verification/**
  - packages/dms/src/utils/request-email-verification.ts
  - packages/dms/src/pages/settings/users/two-factor-operations.ts
  - packages/dms/src/utils/user-agent.ts
  - packages/dms/src/implementations/dms/stale-session.ts
  - packages/dms/src/implementations/dms/client-ip.ts
  - packages/dms/src/types/2fa.d.ts
  - packages/dms/src/types/sign-in-attempt.ts
  - packages/dms/frontend-vue/layers/dms-auth/**
  - packages/dms/frontend-vue/layers/dms-core/app/composables/auth/**
  - packages/dms/frontend-vue/layers/dms-core/app/types/auth*.ts
  - packages/interface-dms/src/auth/**
docs:
  - packages/dms/docs/03.auth-and-tenancy/01.authentication.md
---

# Auth

Signing in and out, the sign-in redirect of protected pages, and password recovery by emailed code. The pages are `/auth`, `/auth/forgot`, `/auth/forgot-validation` and `/auth/recover`; the API is `/api/auth/*`.

## Sub-features

- `login-form-persists`: happy and persistence path: the form opens the dashboard; a reload and a backend restart keep the session; `/api/auth/me` reads the same account.
- `login-wrong-password`: error path: the form shows "The provided credentials are incorrect." and `POST /api/auth/login` answers 401.
- `protected-page-redirects`: a visitor opening Settings > Members is sent to `/auth?redirect=…` and back after signing in; the members API refuses anonymous callers.
- `logout-ends-session`: account menu > Logout returns to sign-in, and the settings page asks to sign in again.
- `forgot-password-resets`: the emailed 6-character code opens the new password form; the new password signs in and the old one answers 401.
- `forgot-password-wrong-code`: error path: a wrong code says it is invalid and the old password still signs in.
- `base-written-data-upgrade`: Format containment: the base ref's backend (built once per commit under `~/.cache/dms-control/base/`) onboards the owner, writes a record and opens a session on the journey's database; this version then accepts the base access token, refreshes the base refresh token, signs the owner in and lists the record.

## How to get to it (user POV)

- The sign-in page at `/auth`, its "Forgot password?" link, and the account menu (the button with the user's name) > Logout.

## Driving it with dms-control

```bash
dms-control journey "$RUN" auth [journey-id...]
```

Evidence is under `$RUN/evidence/auth/<journey>/`; the reset email is in the step's `mail.json` with its readable `text`.

## Gotchas

- Typing the sixth character of the code submits it; there is no click on Continue.
- OAuth providers, two-factor sign-in and the accounts switcher are not driven: the playground configures no provider and no account has a second factor. Report them under Not verified when their code changes.
