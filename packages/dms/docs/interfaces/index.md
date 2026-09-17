# The DMS Interface

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
| [Core](./1.core/1.introduction.md) | Pages, modules, components, permissions, tenancy, invites, hooks, realtime and quick actions. | `@antelopejs/interface-dms` and its root-level subpaths |
| [Auth](./2.auth/1.introduction.md) | Authentication decorators, token and session handling, and the user and session tables. | `@antelopejs/interface-dms/auth` |
| [Base](./3.base/1.introduction.md) | The component vocabulary: forms, tables, charts, layout, trees, data types and the shared prop types. | `@antelopejs/interface-dms/base` |
| [Notifications](./4.notifications/1.introduction.md) | Declaring notification categories and subjects, and building and sending notifications. | `@antelopejs/interface-dms/notifications` |
| [HTML Render](./5.html-render/1.introduction.md) | Registering HTML templates and rendering them server-side. | `@antelopejs/interface-dms/html-render` |

Start with [Core](./1.core/1.introduction.md) and [Base](./3.base/1.introduction.md): the first declares pages and the components they carry as serializable data, the second is the concrete set of components you fill those pages with. [Auth](./2.auth/1.introduction.md) resolves a request to a user, which the permission and tenant guards build on. The remaining two stand on their own and are used where you need them.

## Subpath Map

Each subpath is its own entry point: importing one does not pull the others in, and the modules that register schemas or controllers as they evaluate are deliberately kept off the root barrel. Every domain's introduction carries the detailed map of its own subpaths; this is the whole set at a glance.

| Subpath | Holds | Domain |
| ------- | ----- | ------ |
| `@antelopejs/interface-dms` | The root barrel over the core surface below | [Core](./1.core/1.introduction.md) |
| `/page` | Pages, categories, modules, layouts, page extensions, dynamic menus, frontend modules | [Core](./1.core/2.pages-and-modules.md) |
| `/component` | `Component`, `ComponentBuilder`, actions, watches | [Core](./1.core/3.components.md) |
| `/permissions` | The permission registry and the permission computation | [Core](./1.core/4.permissions.md) |
| `/permissions-resolver` | Registering and running permission resolvers | [Core](./1.core/4.permissions.md) |
| `/guards` | `AuthUserWithPermission`, `AuthTenantOwner`, `AuthTenantMember` | [Core](./1.core/4.permissions.md) |
| `/constants` | Schema names and the default tenant | [Core](./1.core/5.tenancy.md) |
| `/db`, `/db/models`, `/db/tables` | The `Tenant`, `TenantMember`, `Role` and `UserInvite` tables and models | [Core](./1.core/5.tenancy.md) |
| `/request-tenant` | `getRequestTenantId` | [Core](./1.core/5.tenancy.md) |
| `/tenant-scoped-model` | `TenantScopedModel` | [Core](./1.core/5.tenancy.md) |
| `/tenant-access` | Tenant access gates | [Core](./1.core/5.tenancy.md) |
| `/tenant-ownership` | Membership and ownership writes | [Core](./1.core/5.tenancy.md) |
| `/data-controllers` | The built-in members and roles data controllers | [Core](./1.core/5.tenancy.md) |
| `/invites` | Inviting a user into a tenant | [Core](./1.core/6.invites.md) |
| `/hooks` | The `Hook` enum, handlers and dispatch | [Core](./1.core/7.hooks.md) |
| `/tenant-export` | The tenant export archive, contribution and manifest types | [Core](./1.core/7.hooks.md) |
| `/realtime` | Page topics, publishing and backend subscription | [Core](./1.core/8.realtime.md) |
| `/quick-actions` | Command-palette entries | [Core](./1.core/9.quick-actions.md) |
| `/uploads` | Signed upload tokens for the file and image fields of a serialized component | [Core](./1.core/2.pages-and-modules.md) |
| `/types` | `MaybePromise`, the one shared type alias | [Core](./1.core/2.pages-and-modules.md) |
| `/auth` | Authentication decorators, tokens, sessions, external identities, account mail | [Auth](./2.auth/1.introduction.md) |
| `/auth/db`, `/auth/db/models`, `/auth/db/tables` | The `User`, `Session` and `UserExternalIdentity` tables and models | [Auth](./2.auth/4.users.md) |
| `/base` | The component barrel: forms, tables, charts, cards, layout, trees | [Base](./3.base/1.introduction.md) |
| `/base/types` | Base props, colours, sizes, buttons, action targets, row-action rules, guards | [Base](./3.base/2.types.md) |
| `/base/form` | `Form`, the field and group shapes, `FormComponents`, `FormEvents`, the schema helpers | [Base](./3.base/3.forms.md) |
| `/base/table-view` | `TableView`, `@Column`, `TableViewRoutes`, guards, row actions | [Base](./3.base/4.tables.md) |
| `/base/data-types` | `DataType`, the registration decorators, `DefaultDataTypes`, `DefaultDataCompareTypes`, `StatusType` | [Base](./3.base/8.data-types.md) |
| `/base/…` | The per-component subpaths — `chart`, `grid`, `stack`, `tab`, `tree`, `custom`, `layouts`, `helpers/…` | [Base](./3.base/1.introduction.md) |
| `/notifications`, `/notifications/types` | Categories, subjects, the notification builder and its dispatch targets | [Notifications](./4.notifications/1.introduction.md) |
| `/html-render` | `RegisterHtmlTemplate`, `GenerateHtml` and the template reference types | [HTML Render](./5.html-render/1.introduction.md) |

Symbols under an `internal` namespace are the wiring between the interface and its implementation, and are not part of the contract.

## How to Read a Domain

Every domain folder opens with `1.introduction.md`. It gives you the overview, the key features, the AntelopeJS packages the domain depends on, one runnable quick-start example, and the list of the folder's other pages.

The numbered pages after it are topic pages, ordered so that reading them front to back builds up. Each one starts with an overview, then works through the surface task by task with a code example per section and a table for anything that takes options. Every topic page ends with a link to the next one, so you can also follow a folder straight through from its introduction.

Read a topic page on its own when you already know which surface you need.
