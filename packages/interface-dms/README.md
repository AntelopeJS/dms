# `@antelopejs/interface-dms`

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

The public contracts of the AntelopeJS DMS: pages and components, permissions
and tenancy, authentication, notifications and HTML rendering. A module that
extends the DMS imports them from here and never from `@antelopejs/dms`, so it
compiles against the contract rather than against the implementation.

```bash
pnpm add @antelopejs/interface-dms
```

## Entry points

| Import                                  | What it holds                                              |
| --------------------------------------- | ---------------------------------------------------------- |
| `@antelopejs/interface-dms`             | the `dms` interface itself: pages, permissions, tenancy, hooks |
| `@antelopejs/interface-dms/<module>`    | one module of it -- `/page`, `/permissions`, `/hooks`, `/db`, ... |
| `@antelopejs/interface-dms/auth`        | authentication: users, sessions, external identities        |
| `@antelopejs/interface-dms/base`        | the component library: forms, tables, charts, layouts       |
| `@antelopejs/interface-dms/notifications` | notification categories, subjects and delivery             |
| `@antelopejs/interface-dms/html-render` | server-side HTML templates                                  |

`/auth`, `/base` and `/notifications` take subpaths of their own
(`/auth/db`, `/base/table-view`, `/base/data-types`, `/notifications/builder`,
...). The reference documentation lives in the runtime package, under
`docs/interfaces/`.

## One copy, always

Every AntelopeJS interface is a peer dependency, and so is this one in effect:
the host and every module have to resolve **the same installed copy**.

That is stricter here than the usual "duplicate dependencies waste space". This
package holds live state, not just types -- the page, category and extension
registries, the permission tree, the hook registry, the data-type and block
registries, the component slot resolvers -- and the interface proxies a module
registers into are identified per loaded instance. A second copy gets its own
empty registries and its own proxies: pages register into a tree nobody reads,
permissions never reach the roles form, and hooks never fire. Nothing throws.

`@antelopejs/core` checks this before constructing modules and fails with
`Incompatible interface package resolution` when a consumer resolves a copy
other than the canonical one, so a mismatch is caught at startup rather than
diagnosed later. Depend on it with a wide range -- `>=0.0.1 <1.0.0`, raising the lower bound
to the version you actually need rather than pinning an upper one -- so package
managers can deduplicate, and never vendor or bundle this package into a module.

One more consequence worth knowing when writing a module: the runtime hands a
module a per-context view of the values it receives through an interface, so
reference equality does not survive the round trip. Compare registrations on a
field, never with `===`.

The same goes for *finding* a registration again, not just comparing two. A
view has to be resolved back to the registered object by its token before it can
be used as a key: `RegisteringProxy` looks its entries up by object reference,
so unregistering with the view a module holds matches nothing and leaves the
registration live -- silently, exactly like a second copy would. `RegisterPage`
and `RegisterCategory` resolve their argument through `RegistrationIdentity`
(`page/registry`) for that reason; anything else keyed on a value that crossed
the boundary has to do the same. The same trap catches structural comparisons:
`isDeepStrictEqual` and `assert.deepStrictEqual` both refuse two views that hold
equal values, so compare plain data, field by field or after a JSON round trip.

## Releasing

Release this package before releasing a `@antelopejs/dms` version that needs it,
and upgrade it first on the consumer side. It has its own workflow
(`Release DMS interface`); releasing the runtime never releases it.
