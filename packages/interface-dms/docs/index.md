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

If you are learning the DMS, start with the [Quickstart](/docs/getting-started/quickstart) and [Pages & components](/docs/building/pages-and-components). Return here when you need an import path, a signature, or the exact behavior of an option; you do not need to read every domain before building a page.

| Task | Guide with examples | Contract reference |
| --- | --- | --- |
| Build a page and choose its layout | [Pages & components](/docs/building/pages-and-components) | [Pages and modules](/docs/interfaces/core/pages-and-modules), [Layout](/docs/interfaces/base/layout) |
| Add workspace settings | [Settings pages](/docs/building/settings-pages) | [Page access](/docs/interfaces/core/pages-and-modules#page-access) |
| Protect a route and scope its data | [Auth & tenancy](/docs/auth-and-tenancy/overview) | [Authentication](/docs/interfaces/auth/authentication), [Tenancy](/docs/interfaces/core/tenancy) |
| Extend another module's screen | [Page extensions](/docs/building/pages-and-components#extending-another-modules-page) | [Extend a page](/docs/interfaces/core/pages-and-modules#extend-a-page-from-another-module) |

Separately published extension interfaces have their own [module interface references](/docs/modules#interface-references), including Builder. This page covers `@antelopejs/interface-dms` itself.

## One installed copy

The host and every module must resolve **the same installed copy** of `@antelopejs/interface-dms`. The package holds live state, not just types: the page, category and extension registries, the permission tree, the hook registry, the data-type and block registries and the component slot resolvers. A second copy gets its own empty registries: pages register into a tree nobody reads, permissions never reach the roles form, and hooks never fire, without any error. `@antelopejs/core` checks this before constructing modules and fails with `Incompatible interface package resolution` when a module resolves another copy.

Depend on the package with a wide range, raising the lower bound to the version you need rather than pinning an upper one, so package managers can deduplicate, and never vendor or bundle it into a module. `@antelopejs/dms`, which implements the interface, is the exception: it caps its range below the next minor, so a breaking minor never reaches an older DMS.

The runtime also hands a module a per-context view of the values it receives through an interface, so reference equality does not survive the round trip. Compare registrations on a field, never with `===`, and compare plain data rather than the views themselves: `isDeepStrictEqual` and `assert.deepStrictEqual` refuse two views that hold equal values.

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
| `/component-slots` | `RegisterComponentSlot`, `ComponentSlotResolver`, `SlotOptions` | [Core](/docs/interfaces/core/components#registercomponentslot) |
| `/attachments` | `SaveComponentFiles` and its request, field and result types | [Core](/docs/interfaces/core/pages-and-modules#savecomponentfiles) |
| `/permission-gate` | Shared `PermissionGate` fields for permission-filtered UI | [Base](/docs/interfaces/base/types#permissiongate) |
| `/permissions` | The permission registry and the permission computation | [Core](/docs/interfaces/core/permissions) |
| `/permissions-resolver` | Registering and running permission resolvers | [Core](/docs/interfaces/core/permissions) |
| `/guards` | `AuthUserWithPermission`, `AuthTenantOwner`, `AuthTenantMember` | [Core](/docs/interfaces/core/permissions) |
| `/constants` | Schema names and the default tenant | [Core](/docs/interfaces/core/tenancy) |
| `/db`, `/db/models`, `/db/tables` | The `Tenant`, `TenantMember`, `Role` and `UserInvite` tables and models | [Core](/docs/interfaces/core/tenancy) |
| `/request-tenant` | `getRequestTenantId` | [Core](/docs/interfaces/core/tenancy) |
| `/tenant-scoped-model` | `TenantScopedModel` | [Core](/docs/interfaces/core/tenancy) |
| `/tenant-access` | Tenant access gates | [Core](/docs/interfaces/core/tenancy) |
| `/tenant-ownership` | Membership and ownership writes | [Core](/docs/interfaces/core/tenancy) |
| `/tenant-lifecycle` | Producer admission and permanent closure before tenant deletion | [Core](/docs/interfaces/core/tenancy#tenant-lifecycle-admission) |
| `/data-controllers` | The built-in members and roles data controllers | [Core](/docs/interfaces/core/tenancy) |
| `/invites` | Inviting a user into a tenant | [Core](/docs/interfaces/core/invites) |
| `/invite-extensions` | Invite form contributions, validation, delivery and availability | [Core](/docs/interfaces/core/invites#registerinviteextension) |
| `/invite-resolution` | Durable terminal decisions and retryable invite effects | [Core](/docs/interfaces/core/invites#durable-invite-resolution) |
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

Beyond these entry points, built files are importable through the `./*` export (`@antelopejs/interface-dms/base/form-types`). Moving or renaming a public path is a breaking change, like removing an export.

Importability does not make a declaration public. Paths under `internal/`, symbols tagged `@internal`, and `internal` namespaces are wiring between the interface and its implementation, not supported consumer APIs. This includes compatibility exports retained at old paths. Public types named by a supported signature remain part of its contract; use the documented entry points rather than calling internal proxies or raw writer helpers.

## How to Read a Domain

Every domain folder opens with `1.introduction.md`. It gives you the overview, the key features, the AntelopeJS packages the domain depends on, one runnable quick-start example, and the list of the folder's other pages.

The numbered pages after it are topic pages, ordered so that reading them front to back builds up. Each one starts with an overview, then works through the surface task by task with a code example per section and a table for anything that takes options. Every topic page ends with a link to the next one, so you can also follow a folder straight through from its introduction.

Read a topic page on its own when you already know which surface you need.
