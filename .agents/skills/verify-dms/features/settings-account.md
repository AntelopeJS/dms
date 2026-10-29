---
covers:
  - packages/dms/src/pages/settings/users/account-*.ts
  - packages/dms/src/pages/settings/users/appearance.ts
  - packages/dms/src/pages/settings/users/profile.ts
  - packages/dms/src/pages/settings/users/security.ts
  - packages/dms/src/pages/settings/users/region.ts
  - packages/dms/src/pages/settings/users/shortcuts.ts
  - packages/dms/src/pages/settings/users/notification*.ts
  - packages/dms/src/pages/settings/users/email-change.ts
  - packages/dms/src/pages/settings/users/current-password.ts
  - packages/dms/src/pages/settings/users/dashboard-languages.ts
  - packages/dms/src/pages/settings/users/category.ts
  - packages/dms/src/pages/settings/users/index.ts
  - packages/dms/src/pages/settings/overview/**
  - packages/dms/src/pages/settings/users/profile-*.ts
  - packages/dms/src/pages/settings/users/region-form.ts
  - packages/dms/src/pages/settings/users/regional-preferences.ts
  - packages/dms/src/pages/settings/users/security-attention.ts
  - packages/dms/src/pages/settings/users/two-factor-operations.ts
  - packages/dms/src/pages/settings/users/quick-actions.ts
  - packages/dms/src/pages/settings/*.ts
  - packages/dms/src/pages/account.ts
  - packages/dms/src/validation/account-deletion.schema.ts
  - packages/dms/src/validation/regional-preferences.schema.ts
  - packages/dms/src/validation/user-notification-preferences.schema.ts
  - packages/dms/src/validation/index.ts
  - packages/dms/src/validation/issue-message.ts
  - packages/dms/src/utils/email-change-mail.ts
  - packages/dms/src/db/models/userEmailChanges.model.ts
  - packages/dms/src/db/tables/userEmailChanges.table.ts
  - packages/dms/src/db/models/userNotificationPreferences.model.ts
  - packages/dms/src/db/tables/userNotificationPreferences.table.ts
  - packages/dms/frontend-vue/layers/dms-layout/app/build/components/pages/settings/**
  - packages/dms/frontend-vue/layers/dms-layout/app/custom-pages/settings/**
  - packages/dms/frontend-vue/layers/dms-layout/app/custom-layouts/SettingsLayout.vue
  - packages/dms/frontend-vue/layers/dms-layout/app/emails/EmailChange*.vue
docs:
  - packages/dms/docs/02.building/14.settings-pages.md
---

# Account settings

The signed-in person's own pages under Settings > Account, plus the Settings overview. Pages: `/settings` (overview), `/settings/user/profile`, `/settings/user/region` (Language & region), `/settings/user/security`, `/settings/user/notifications`, `/settings/user/appearance` and `/settings/user/shortcuts`. The page actions are under `/dms/pages/settings/user/<page>` (for example `security/password`, `security/sessions`, `region/preferences`, `notifications/preferences`).

## Sub-features

- `profile-name-persists`: happy and persistence path: editing the full name shows "Profile saved"; a reload, `/api/auth/me`, the members list and the Settings overview all read the new name; the email field is read only.
- `profile-name-required`: error path: a blank name is refused and not stored; Discard puts the stored name back.
- `change-password-signs-out-other-devices`: happy and persistence path: the new password signs in and the old answers 401; a second browser signed in as the account is sent to sign-in; this device stays signed in; a "Password changed" alert is in the inbox.
- `change-password-errors`: error path: a wrong current password says "Your current password is incorrect"; a weak or mismatched new password is not saved; the API refuses a weak one and the old password still signs in.
- `change-email-confirms-with-code`: the new address gets a 6-digit code and the old address a warning; the account keeps the old address until the code is entered; then a reload, the API and the sign-in all use the new address only.
- `change-email-errors`: error path: a wrong password, a malformed address and a wrong code ("The validation code is invalid") each leave the address unchanged.
- `language-region-persists`: Français switches the page at once, survives a reload, shows on `/api/auth/me` and in a second browser; switching back restores English.
- `time-format-persists`: the 24-hour clock changes the preview and is stored as `h23`.
- `appearance-persists`: dark theme, large density and increased contrast apply at once and survive a reload; another browser keeps its own light default (the choice is per browser).
- `notification-preferences-persist`: turning Security alerts off persists across a reload and stops the new sign-in alert; turning it on again brings the alert back.
- `notification-inbox-actions`: Mark all as read and Delete all change the inbox and the counts, and survive a reload.
- `sessions-sign-out`: signing out a listed session ends that browser; Sign out other sessions makes the other token answer 401 and keeps this device.
- `two-factor-email-enroll`: Add method > Email verification shows ten backup codes, a new sign-in stops at "Two-factor verification" and the emailed code completes it, and removing the last method restores plain sign-in.
- `export-my-data`: Export my data downloads a JSON file with the email and name and without the password.
- `delete-account-last-owner-refused`: error path: the last owner is told the account cannot be deleted yet and keeps it.
- `delete-account-member`: containment path: the dialog counts what goes (workspaces left, devices signed out, notifications deleted); without the typed address it refuses; then the member lands on sign-in, cannot sign in, and leaves the Members list.
- `settings-overview-and-search`: the overview shows the name, email, role and recent activity and links every page; Search settings filters the menu and says when nothing matches.
- `shortcuts-layout-and-search`: macOS relabels the keys; the shortcut search filters and says when nothing matches.

## How to get to it (user POV)

- The account menu (the button with the user's name) > Settings, or the sidebar of any settings page: Profile, Language & region, Security, Notifications, Appearance, Shortcuts.

## Driving it with dms-control

```bash
dms-control journey "$RUN" settings-account [journey-id...]
```

A second device is a second browser context signed in as the same account: `ctx.addAccount("admin2", { ...ctx.state.accounts.admin })`, then `ctx.tab("admin2")` and `signIn`. Codes arrive in the mail sink (`ctx.mail`); the sixth character typed into a code dialog submits it, so there is no click on Confirm. Evidence is under `$RUN/evidence/settings-account/<journey>/`.

## Gotchas

- Changing the password or the email signs the other sessions out, including the harness's API token; the journeys that do it replace the account's stored password, and `ctx.api` signs in again.
- Theme, density and contrast are stored in the browser, not on the account; the keyboard layout is not stored at all and returns to the detected one on reload.
- The Appearance tiles are visually hidden inputs; the journey ticks them with Playwright's forced check.
- Notification email delivery is "coming soon" in the product, so only the in-app column is driven.
- Not verified: the authenticator app (TOTP) enrolment and sign-in, backup-code sign-in, Regenerate backup codes, the avatar upload, time zone, first day of the week and date format, the quick actions menu, linked sign-in providers, and the accounts switcher. None of them can be driven without a second device or an external provider.
- `delete-account-member` leaves the Members list but keeps the member's records, as the dialog promises.
