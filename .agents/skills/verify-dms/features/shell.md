---
covers:
  - packages/dms/src/index.ts
  - packages/dms/src/frontend-module.ts
  - packages/dms/src/config/**
  - packages/dms/src/types/index.ts
  - packages/dms/src/types/realtime.ts
  - packages/dms/src/store/internal/frontend/**
  - packages/dms/src/implementations/dms/menu-categories.ts
  - packages/dms/src/implementations/dms/nav-badges.ts
  - packages/dms/src/implementations/dms/quick-actions.ts
  - packages/dms/src/implementations/dms/layout-banners.ts
  - packages/dms/src/implementations/dms/services.ts
  - packages/dms/src/implementations/dms/client-base-url.ts
  - packages/dms/src/implementations/dms/api-base-url.ts
  - packages/dms/src/implementations/dms/dev-handshake.ts
  - packages/dms/src/implementations/dms/resolver-timeout.ts
  - packages/dms/src/implementations/dms-notifications/**
  - packages/dms/src/implementations/dms-html-render/**
  - packages/dms/src/db/models/userNotifications.model.ts
  - packages/dms/src/db/tables/userNotifications.table.ts
  - packages/dms/src/db/models/notification-feed-filter.ts
  - packages/dms/src/db/models/index.ts
  - packages/dms/src/db/tables/index.ts
  - packages/dms/src/utils/notification-*.ts
  - packages/dms/src/utils/notification-registry/**
  - packages/dms/src/utils/account-notifications.ts
  - packages/dms/src/utils/email-subjects.ts
  - packages/dms/src/utils/index.ts
  - packages/dms/src/utils/user-activity.ts
  - packages/dms/src/hooks/index.ts
  - packages/dms/src/hooks/workspace-notifications.ts
  - packages/dms/src/hooks/internal/workspace-notifications.ts
  - packages/dms/src/crons/index.ts
  - packages/dms/src/pages/index.ts
  - packages/dms/frontend-vue/*.ts
  - packages/dms/frontend-vue/*.json
  - packages/dms/frontend-vue/build/**
  - packages/dms/frontend-vue/server/**
  - packages/dms/frontend-vue/scripts/**
  - packages/dms/frontend-vue/layers/dms-core/**
  - packages/dms/frontend-vue/layers/dms-layout/**
  - packages/interface-dms/src/layout-banners.ts
  - packages/interface-dms/src/quick-actions.ts
  - packages/interface-dms/src/notifications/**
  - packages/interface-dms/src/html-render/**
  - packages/interface-dms/src/utils/**
  - packages/interface-dms/src/internal/**
  - packages/interface-dms/src/types.ts
  - packages/interface-dms/src/json.ts
  - packages/interface-dms/src/index.ts
  - packages/interface-dms/src/api-base-url.ts
  - packages/interface-dms/src/client-base-url.ts
  - packages/interface-dms/src/client-ip.ts
  - packages/interface-dms/src/constants.ts
  - packages/interface-dms/src/hooks.ts
  - packages/dms/src/pages/settings/users/quick-actions.ts
docs:
  - packages/dms/docs/05.extending-the-dashboard/02.dashboard-chrome.md
  - packages/dms/docs/06.frontend-composables/03.realtime-and-notifications.md
  - packages/dms/docs/02.building/04.navigation.md
---

# Shell

The dashboard around every page: the sidebar and breadcrumb, the command palette, favorites, the notification bell and the error pages. It also owns the frontend server, the backend-to-frontend handshake and the notification and HTML render services the other features use.

## Sub-features

- `sidebar-navigation`: signing in lands on the configured homepage; a sidebar link opens its page with its breadcrumb; a reload stays on it (persistence).
- `command-palette-navigates`: Ctrl K, a search for "Member invitations", Enter opens the settings page.
- `command-palette-no-match`: empty path: a search that matches nothing shows "No matching data" and Enter goes nowhere.
- `favorites-persist`: Add to favorites puts the page in the sidebar's Favorites; a reload and another tab of the same browser keep it; Remove from favorites empties it.
- `sign-in-notification`: a sign-in from a new device puts "New sign-in from …" behind the bell; View all opens the notification settings; the notifications API holds it unread, linking to Security.
- `unknown-page-404`: error path: an unknown path shows "Page not found" and Go to home returns to the homepage.

## How to get to it (user POV)

- The sidebar on the left, the breadcrumb and the header buttons (Add to favorites, Quick actions, Notifications) of any page, and Ctrl K anywhere.

## Driving it with dms-control

```bash
dms-control journey "$RUN" shell [journey-id...]
```

Evidence is under `$RUN/evidence/shell/<journey>/`.

## Gotchas

- Favorites live in a cookie of the browser, not in the database: another browser does not see them.
- The palette's search is fuzzy: a nonsense word with common letters still matches entries. The empty-path journey uses `qqxzjjwv`.
- Uppercase styling changes `innerText`: match headings like "Error 404" case-insensitively.
