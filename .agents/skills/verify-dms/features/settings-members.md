---
covers:
  - packages/dms/src/pages/settings/users/member*.ts
  - packages/dms/src/pages/settings/users/invite*.ts
  - packages/dms/src/pages/settings/users/permission-warnings.ts
  - packages/dms/src/pages/members.ts
  - packages/dms/src/validation/member-*.ts
  - packages/dms/src/utils/admin-invite-email.ts
  - packages/dms/src/crons/cleanup-user-invites.ts
  - packages/dms/src/hooks/invite-extensions.ts
  - packages/dms/src/implementations/dms/invite-extensions.ts
  - packages/dms/frontend-vue/layers/dms-layout/app/build/components/pages/settings/members/**
  - packages/dms/frontend-vue/layers/dms-layout/app/emails/EmailAdminInvite.vue
  - packages/interface-dms/src/data-controllers/members.ts
  - packages/interface-dms/src/invite-extensions/**
  - packages/interface-dms/src/invites.ts
  - packages/interface-dms/src/invitee-display-name.ts
  - packages/interface-dms/src/invite-resolution.ts
  - packages/interface-dms/src/tenant-members.ts
  - packages/interface-dms/src/invite-extensions.ts
  - packages/interface-dms/src/invite-extension-payloads.ts
docs:
  - packages/dms/docs/03.auth-and-tenancy/02.auth-and-permissions.md
---

# Members and invitations

The people of the workspace and how they join: Settings > Workspace > Members lists them, Invite members sends invitation emails, Member invitations lists what is pending, and a link `/auth/signup?token=` turns an invitation into an account. The pages are `/settings/workspace/members` and `/settings/workspace/invites`; the data is `/api/tables/members` and `/api/tables/admin-invites`, and the page actions are under `/dms/pages/settings/workspace/members`.

## Sub-features

- `invite-accept-lists-member`: happy and persistence path: invite with a role, the invitation is listed and held by the API with that role, the emailed link opens the sign-up form for the invited address, the new member is signed in and listed (UI and `/api/tables/members/list`), the invitation is consumed, the member signs in through the form in a new browser, and the inviter gets an "accepted your invitation" notification.
- `invite-validation-errors`: error path: a malformed address, a missing Team and a missing role each keep the dialog open with its message; an address that already belongs to a member is refused; the API refuses a role-less invitation; nothing is stored and no mail leaves.
- `invite-revoke-refuses-link`: error and persistence path: Cancel keeps the invitation; Revoke removes it (gone after a reload and from the API); the emailed link then opens "This invitation was revoked" and no sign-up form; nobody joined.
- `invite-resend-replaces-link`: Resend emails a new link; the first link opens "This invitation was replaced by a newer email"; the new link creates the account.
- `invite-edit-changes-roles`: Edit invitation swaps the role and sets the name; the list and the API hold the new role after a reload; the resent link prefills the edited name.
- `members-search-empty-state`: empty path: no invitation shows an empty table and "Invitations 0"; a members search without a match shows "No results" and Clear search brings the row back.
- `remove-member-shows-impact`: containment path, the **Data door containment** journey: the removal dialog names the roles removed and that records stay before anything changes (the API `removal-impact` says the same); Cancel removes nobody; Remove member drops the member from the list and the API; the removed member's token and open browser lose what the role granted, sign-in yields no workspace session, and the role stays.
- `removed-member-lands-on-a-page`: error path: a removed member who signs in again is sent to `/auth/no-workspace`, which has no page and shows "Page not found". It is a known finding and fails until the product has that page.
- `remove-last-owner-refused`: error path: the only owner cannot drop the owner role or be removed, in the UI or through `DELETE /api/tables/members/delete` (409).
- `make-owner-and-back`: Make owner and Remove owner role confirm first, the API flips `isTenantOwner`, and the member's access to the Roles page follows in both directions.
- `change-member-roles`: Change roles swaps a member's role; the list and the API show only the new one.

## How to get to it (user POV)

- Settings > Workspace > Members, then Invite members, or the row menu (the button "Actions for <name>") for Change roles, Make owner and Remove from workspace.
- Settings > Workspace > Member invitations, then the row buttons Edit invitation, Resend, Copy link and Revoke.
- The link in the invitation email, as a visitor.

## Driving it with dms-control

```bash
dms-control journey "$RUN" settings-members [journey-id...]
```

Roles are created through `POST /dms/pages/settings/workspace/roles/create` as setup; the journeys under test then use the UI. A second person is a second account: the invitee accepts in an `anon` tab, then `ctx.addAccount` makes it usable with `ctx.tab` and `ctx.api`. Evidence is under `$RUN/evidence/settings-members/<journey>/`; the invitation email is in the step's `mail.json`.

## Gotchas

- The playground's invite extension makes Team required; the journeys pick `Sales`. Without a role the dialog needs the Owner switch, so roles are created first.
- Signing up from the link signs the new member in at once; the first page is the first one their role can open, or a public page.
- Several journeys end on `tab.at(...)` of the signed-in landing page; the destination varies with the role, so they only require leaving `/auth`.
- `removed-member-lands-on-a-page` fails on `main`: `login.vue` navigates to `/auth/no-workspace`, and no page registers that path. A verdict on a diff touching sign-in or removal fails until the product is fixed.
- A removed member's open browser still loads account pages (`/settings/user/profile`); only workspace pages and data are refused.
- Not driven: Resend verification email and Mark as verified (the playground's members have verified addresses), the SaaS-mode ownership paths, and Copy link (a clipboard write).
