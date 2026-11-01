---
covers:
docs:
  - packages/dms/docs/01.getting-started/03.quickstart.md
---

# Smoke

The fixed journey every verdict runs, whatever the diff touches: a fresh platform onboards its administrator, the administrator signs in through the form, invites a member from Settings > Members, and the invitation is still there after a reload.

## Sub-features

- `smoke`: `POST /api/onboarding/register` creates the owner on an empty database; the sign-in form opens the dashboard; Invite members (email, the playground's Team field, owner switch) lands on Member invitations with the row; a reload keeps it; `GET /api/tables/admin-invites/list` holds it with `asTenantOwner: true`; the mail sink holds the invitation email with its `/auth/signup?token=` link.

## How to get to it (user POV)

- Open the dashboard, sign in, then Settings > Workspace > Members > Invite members.

## Driving it with dms-control

```bash
dms-control journey "$RUN" smoke
```

The journey's steps, checks and evidence are in `journeys/smoke.mjs` and under `$RUN/evidence/smoke/smoke/`.

## Gotchas

- The playground registers an invite extension whose Team field is required; the journey picks `Sales`. Another playground needs its own value.
- The invitation email goes to the run's mail sink; a dead sink makes the toast say "Done, with a warning" and fails the journey.
