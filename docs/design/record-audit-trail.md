# Design: a record-level audit trail for the DMS

Card ANT-984 ("Add a record-level audit trail to the DMS", Low, after the 10 Dec launch). Goal as written: record who changed which record and when, for human members and AI agents, in the open-source DMS, not as a Cloud-only feature. This note sizes the smallest useful slice, names where it lands in the two packages, and lists what the maintainer decides before any code is written. Nothing here changes a published interface in a breaking way: the slice adds one subpath to `@antelopejs/interface-dms` and one optional table-view option.

## What an audit event records

One event per write of one record, written after the write succeeded:

| Field | Meaning | Source |
| --- | --- | --- |
| `tenantId` | The workspace the record belongs to | The request's tenant (`resolveRequestTenantId`) |
| `table`, `recordId` | The data controller's table name and the row's primary key | The table view's metadata and the `_id` of the written row |
| `action` | `create`, `update`, `delete`, `archive` or `restore` | The guarded route that ran |
| `changedFields` | The names of the fields whose value changed | `current` versus the written row, which the edit guard already reads back |
| `before`, `after` | The old and new values of those fields, redacted | Same rows; only the fields an allowlist names, see decision 2 |
| `actor` | `{ kind: "user" \| "agent" \| "system", id, name }` | The request principal (`authenticateRequestPrincipal`); the MCP session for an agent; the cron or automation for `system` |
| `origin` | `{ surface: "dashboard" \| "mcp" \| "automation" \| "cron", ip?, userAgent?, requestId? }` | `getClientIp` (`@antelopejs/interface-dms/client-ip`) and `auth/internal/user-agent.ts`, which the sign-in notifications already use |
| `at` | When | Server clock |

## Where it lands

### `@antelopejs/interface-dms`: one new subpath, `audit-trail`

- `packages/interface-dms/src/audit-trail.ts`: the types above, and two `InterfaceFunction`s the runtime implements, as every write-to-database contract is exposed (AGENTS.md, "Where code goes"):
  - `RecordAuditEvent(event: AuditEvent): Promise<void>`, which a module calls after its own write when it bypasses table views.
  - `ListAuditEvents(query: { tenantId; table?; recordId?; actorId?; from?; to?; limit; cursor? }): Promise<{ events; next? }>`, which the audit page and a future per-record history drawer read.
- `TableView(..., { audit?: { fields?: string[] | "all" | "none" } })`: one optional option on the published table-view options. Absent, a table audits with `changedFields` and no values (decision 2).
- The guarded routes (`base/table-view/internal/guards.ts`, `createGuardedWriteRoute` and `createGuardedConfirmRoute`) already run after-write work on `new`, `edit`, `delete`, `archive` and `restore`, and already read the row before an edit and back after it: the event is built there and handed to `RecordAuditEvent`. No module changes its guards.

Additive only: a consumer compiled against the previous interface keeps working, and a module that never imports the subpath pays nothing.

### `@antelopejs/dms`: the implementation

- `db/tables/auditEvents.table.ts` in the tenant schema (`TENANT_SCHEMA_NAME`), indexed on `(table, recordId, at)`, `(actor.id, at)` and `at`; `db/models/auditEvents.model.ts` with append, page and purge.
- `implementations/dms/audit-trail/`: implements both functions; the write is fire-and-forget after the response as the notification emitters are (a failure is logged, never fails the request).
- `crons/purge-audit-events.ts`: nightly purge past `config.audit.retentionDays` (decision 4), next to `sweep-expired-sessions.ts`.
- Hooks: `Hook.TENANT_DELETED` drops the tenant's events; `Hook.TENANT_DATA_EXPORT` contributes them to the export archive (`RegisterTenantDataExportContributor`), so the trail follows the data-portability contract the DMS already has.
- Read surface: a settings page `Settings / Workspace / Audit log` (`pages/settings/workspace/audit-log.ts`), a `TableView` over `ListAuditEvents` with filters on table, record, actor and date, behind the permission `settings.workspace.audit` (decision 3). Nothing is editable there. A later slice adds a "History" drawer on a table row.
- MCP: agents already write only through the builder tools (`effect: "builder"`), which edit pages, not records; a record write by an agent reaches the data routes as a signed-in request through the dashboard chat, so it is attributed to the user with `actor.kind: "agent"` when the request carries the assistant's marker (decision 5).

## Smallest slice

1. The interface subpath, the table-view option and the guard wiring, with `changedFields` only.
2. The tenant table, the model, the two implementations, the purge cron, the two hook handlers.
3. The Audit log settings page behind its permission, en-GB and fr-FR.
4. Tests: a unit test on the guard wiring (a `new`, an `edit` changing two fields and a `delete` produce three events with the right fields and actor), an integration test on the page's permission (member without the permission gets 403), a cron test on retention.

Values (`before`, `after`) and the per-record drawer are the second slice, once decision 2 is taken.

## Decisions for the maintainer

1. Scope of capture. Table-view writes only (this slice: every write the dashboard makes through a data controller) or every model write (not reachable without hooks in `@antelopejs/interface-database`, which the DMS does not own). Proposal: table views now, `RecordAuditEvent` for modules that write by hand.
2. Values or field names. Storing `before` and `after` values is what Forest Admin and Directus show, and also what stores personal data twice and grows the table fastest. Proposal: field names by default, values only for the fields a table view lists in `audit.fields`, never for a field a form marks as a secret.
3. Who reads the trail. A workspace permission (`settings.workspace.audit`, grantable to a role) or the platform owner alone. Proposal: the permission, since a client's compliance officer is the reader the competitors sell this to.
4. Retention. A default (proposal: 365 days) in `config.audit.retentionDays`, and whether the Cloud sets a plan-dependent value through a permissions resolver or a config override.
5. Agent attribution. An agent acts through a signed-in user (the dashboard chat) or as the developer (Claude Code's MCP session, which has no DMS user). Proposal: the acting user is the actor, `actor.kind: "agent"` plus the agent's name in `origin`, and MCP writes without a user are `system` with the MCP client name.
6. Tamper evidence (hash chain, append-only storage) is out of scope for the slice; say so in the docs or plan it.
7. Pairing with the MCP server card: whether `ListAuditEvents` is also an MCP read tool for the agent, which the card hints at.
