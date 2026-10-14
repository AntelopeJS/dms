---
title: "The DMS interface"
description: "One public package, @antelopejs/interface-dms, holds every contract a module uses — its subpaths, domain by domain."
---

# The DMS interface

## Overview

The DMS ships one public AntelopeJS interface package, `@antelopejs/interface-dms`. Everything a module needs to declare pages, build components, authenticate a request, send a notification or render an HTML template comes from that single package, through a subpath named after the domain it belongs to. Never reach the surface through the runtime package `@antelopejs/dms`.

```json
{
  "dependencies": {
    "@antelopejs/interface-dms": ">=0.0.1 <1.0.0"
  }
}
```

This section is the contract reference: the exact symbol names, options and return types, grouped by domain. The DMS guide covers the same ground task by task, organised around what you are building.

## The Domains

| Domain | What it is for | Import prefix |
| ------ | -------------- | ------------- |
| [Core](/docs/interfaces/core/introduction) | Pages, modules, components, permissions, tenancy, invites, hooks, realtime, quick actions and layout banners. | `@antelopejs/interface-dms` and its root-level subpaths |
| [Auth](/docs/interfaces/auth/introduction) | Authentication decorators, token and session handling, and the user and session tables. | `@antelopejs/interface-dms/auth` |
| [Base](/docs/interfaces/base/introduction) | The component vocabulary: forms, tables, charts, layout, trees, data types and the shared prop types. | `@antelopejs/interface-dms/base` |
| [Notifications](/docs/interfaces/notifications/introduction) | Declaring notification categories and subjects, and building and sending notifications. | `@antelopejs/interface-dms/notifications` |
| [HTML Render](/docs/interfaces/html-render/introduction) | Registering HTML templates and rendering them server-side. | `@antelopejs/interface-dms/html-render` |

Start with [Core](/docs/interfaces/core/introduction) and [Base](/docs/interfaces/base/introduction): the first declares pages and the components they carry as serializable data, the second is the concrete set of components you fill those pages with. [Auth](/docs/interfaces/auth/introduction) resolves a request to a user, which the permission and tenant guards build on. The remaining two stand on their own and are used where you need them.

## Subpath Map

Each subpath is its own entry point: importing one does not pull the others in, and the modules that register schemas or controllers as they evaluate are deliberately kept off the root barrel. Every domain's introduction carries the detailed map of its own subpaths; this is the whole set at a glance.

| Subpath | Holds | Domain |
| ------- | ----- | ------ |
| `@antelopejs/interface-dms` | The root barrel over the core surface below | [Core](/docs/interfaces/core/introduction) |
| `/page` | Pages, categories, modules, layouts, page extensions, dynamic menus, frontend modules | [Core](/docs/interfaces/core/pages-and-modules) |
| `/component` | `Component`, `ComponentBuilder`, actions, watches | [Core](/docs/interfaces/core/components) |
| `/permissions` | The permission registry and the permission computation | [Core](/docs/interfaces/core/permissions) |
| `/permissions-resolver` | Registering and running permission resolvers | [Core](/docs/interfaces/core/permissions) |
| `/guards` | `AuthUserWithPermission`, `AuthTenantOwner`, `AuthTenantMember` | [Core](/docs/interfaces/core/permissions) |
| `/constants` | Schema names and the default tenant | [Core](/docs/interfaces/core/tenancy) |
| `/db`, `/db/models`, `/db/tables` | The `Tenant`, `TenantMember`, `Role` and `UserInvite` tables and models | [Core](/docs/interfaces/core/tenancy) |
| `/request-tenant` | `getRequestTenantId` | [Core](/docs/interfaces/core/tenancy) |
| `/tenant-scoped-model` | `TenantScopedModel` | [Core](/docs/interfaces/core/tenancy) |
| `/tenant-access` | Tenant access gates | [Core](/docs/interfaces/core/tenancy) |
| `/tenant-ownership` | Membership and ownership writes | [Core](/docs/interfaces/core/tenancy) |
| `/data-controllers` | The built-in members and roles data controllers | [Core](/docs/interfaces/core/tenancy) |
| `/invites` | Inviting a user into a tenant | [Core](/docs/interfaces/core/invites) |
| `/hooks` | The `Hook` enum, handlers and dispatch | [Core](/docs/interfaces/core/hooks) |
| `/tenant-export` | The tenant export archive, contribution and manifest types | [Core](/docs/interfaces/core/hooks) |
| `/realtime` | Page topics, publishing and backend subscription | [Core](/docs/interfaces/core/realtime) |
| `/quick-actions` | Command-palette entries | [Core](/docs/interfaces/core/quick-actions) |
| `/layout-banners` | Global banners under the dashboard header | [Core](/docs/interfaces/core/layout-banners) |
| `/uploads` | Signed upload tokens for the file and image fields of a serialized component | [Core](/docs/interfaces/core/pages-and-modules) |
| `/types` | `MaybePromise`, the one shared type alias | [Core](/docs/interfaces/core/pages-and-modules) |
| `/api-base-url`, `/client-base-url` | `GetApiBaseUrl`, `GetClientBaseUrl`: the public origins of the API and the dashboard | [Core](/docs/interfaces/core/pages-and-modules#public-urls) |
| `/client-ip` | `getClientIp`, `ResolveClientIp`: a request's client address behind the trusted proxies | [Core](/docs/interfaces/core/pages-and-modules#client-address) |
| `/auth` | Authentication decorators, tokens, sessions, external identities, account mail | [Auth](/docs/interfaces/auth/introduction) |
| `/auth/db`, `/auth/db/models`, `/auth/db/tables` | The `User`, `Session` and `UserExternalIdentity` tables and models | [Auth](/docs/interfaces/auth/users) |
| `/base` | The component barrel: forms, tables, charts, cards, layout, trees | [Base](/docs/interfaces/base/introduction) |
| `/base/types` | Base props, colours, sizes, buttons, action targets, row-action rules, guards | [Base](/docs/interfaces/base/types) |
| `/base/form` | `Form`, the field and group shapes, `FormComponents`, `FormEvents`, the schema helpers | [Base](/docs/interfaces/base/forms) |
| `/base/table-view` | `TableView`, `@Column`, `TableViewRoutes`, guards, row actions | [Base](/docs/interfaces/base/tables) |
| `/base/data-types` | `DataType`, the registration decorators, `DefaultDataTypes`, `DefaultDataCompareTypes`, `StatusType` | [Base](/docs/interfaces/base/data-types) |
| `/base/…` | The per-component subpaths — `chart`, `grid`, `stack`, `tab`, `tree`, `custom`, `layouts`, `helpers/…` | [Base](/docs/interfaces/base/introduction) |
| `/notifications`, `/notifications/types` | Categories, subjects, the notification builder and its dispatch targets | [Notifications](/docs/interfaces/notifications/introduction) |
| `/html-render` | `RegisterHtmlTemplate`, `GenerateHtml` and the template reference types | [HTML Render](/docs/interfaces/html-render/introduction) |

Beyond these entry points, every file under the package's `src` is importable through its `./*` export (`@antelopejs/interface-dms/base/form-types`), so moving or renaming one is a breaking change, like removing an export.

Symbols under an `internal` namespace are the wiring between the interface and its implementation, and are not part of the contract.

## How to Read a Domain

Every domain folder opens with `1.introduction.md`. It gives you the overview, the key features, the AntelopeJS packages the domain depends on, one runnable quick-start example, and the list of the folder's other pages.

The numbered pages after it are topic pages, ordered so that reading them front to back builds up. Each one starts with an overview, then works through the surface task by task with a code example per section and a table for anything that takes options. Every topic page ends with a link to the next one, so you can also follow a folder straight through from its introduction.

Read a topic page on its own when you already know which surface you need.
