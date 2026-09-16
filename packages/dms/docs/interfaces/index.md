# DMS Interfaces

## Overview

The dms-back module ships several AntelopeJS interfaces. Each one is a separate contract with its own import subpath under `@antelopejs/interface-dms/`, and each has its own folder here.

A folder is a self-contained reference: it documents one interface, and every link inside it points at a sibling file in the same folder. When an interface is extracted into its own package, its folder moves with it verbatim.

These pages describe the contracts — the exact symbol names, options and return types. The DMS guide covers the same ground task by task, organised around what you are building.

## The Interfaces

| Interface | What it is for | Import prefix |
| --------- | -------------- | ------------- |
| [DMS](./dms/1.introduction.md) | The core DMS contract: pages, modules, components, permissions, tenancy, hooks, realtime and quick actions. | `@antelopejs/interface-dms` |
| [DMS Auth](./dms-auth/1.introduction.md) | Authentication decorators, token and session handling, and the user and session tables. | `@antelopejs/interface-dms/auth` |
| [DMS Base](./dms-base/1.introduction.md) | The component vocabulary: forms, tables, charts, layout, trees, data types and the shared prop types. | `@antelopejs/interface-dms/base` |
| [DMS HTML Render](./dms-html-render/1.introduction.md) | Registering HTML templates and rendering them server-side. | `@antelopejs/interface-dms/html-render` |
| [DMS Notifications](./dms-notifications/1.introduction.md) | Declaring notification categories and subjects, and building and sending notifications. | `@antelopejs/interface-dms/notifications` |

Start with [DMS](./dms/1.introduction.md) and [DMS Base](./dms-base/1.introduction.md): the first declares pages and the components they carry as serializable data, the second is the concrete set of components you fill those pages with. [DMS Auth](./dms-auth/1.introduction.md) resolves a request to a user, which the DMS permission and tenant guards build on. The remaining two stand on their own and are used where you need them.

Several interfaces expose more than one subpath — the DMS interface splits its surface across `/page`, `/component`, `/permissions` and others, and DMS Auth publishes its tables under `/db`. Each introduction carries the map of its own subpaths.

## How to Read a Folder

Every folder opens with `1.introduction.md`. It gives you the overview, the key features, the AntelopeJS packages the interface depends on, one runnable quick-start example, and the list of the folder's other pages.

The numbered pages after it are topic pages, ordered so that reading them front to back builds up. Each one starts with an overview, then works through the surface task by task with a code example per section and a table for anything that takes options. Every topic page ends with a link to the next one, so you can also follow the folder straight through from the introduction.

Read a topic page on its own when you already know which surface you need. Symbols in an `internal` namespace are wiring between an interface and its implementation, and are not documented as part of the contract.
