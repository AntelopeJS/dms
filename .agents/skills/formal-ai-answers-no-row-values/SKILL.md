---
name: formal-ai-answers-no-row-values
description: Generated-input check of the MCP tool registry of @antelopejs/dms (packages/dms/src/mcp), run on the real tools: with canary values in a connected database and mapped into the project, no tool answers a canary and every tool that writes refuses `{ $hidden }` sent back. Use when a change touches a file in its coverage record, adds or changes an MCP tool, or changes how a mapping, a diff or a page check reaches the AI, and needs proof that no row value does.
---

# Formal check: the AI gets the shape of a connected database, never its values

The AI that drives the builder reads tool answers, and they end up at its provider, in `state.json` and in the chat. A value read from a connected database's rows must not be in any of them. #1065 redacted the database tools, and #1073 found that `builder_resource_structure`, `builder_page_structure` and `changes[].diff` still carried row values: one path was left. This check does not name tools one by one. It calls every tool of `MCP_TOOLS`.

Verification here is a generated-input test of the real code, not a hand model: no model checker runs on this TypeScript, and the property is about what the tools answer, not about an order of steps.

- `packages/dms/src/test/formal/ai-answers-no-row-values.test.ts` holds the property.
- `packages/dms/src/test/formal/helpers/schema-arbitrary.ts` turns a tool's own `inputSchema` into a fast-check arbitrary: every required property, each optional one when drawn, strings drawn from the project's real refs, paths, columns and names or invented, and a free-form position holding any JSON value. A tool that changes its schema changes what is generated.
- `packages/dms/src/test/formal/helpers/mapped-project.ts` connects the `erp` database, analyses it, maps `erp.orders` and keeps that state to restore after each write.
- `packages/dms/src/test/unit/builder/helpers/row-values-database.ts` holds the canaries (`ROW_VALUES`: `zq_paid`, `JPY`, `4471.5`, `1987-03-14`, `2031-07`...) in the profile of the connected database, shared with `tool-row-values.test.ts`.
- `packages/dms/src/test/formal/helpers/verify-reports.ts` generates `page_verify` reports whose every quoting place holds a canary.

## The property and the harm

| Rule (test title) | Plain sentence | Harm when it breaks |
| --- | --- | --- |
| `<tool> answers no value of a row for the arguments it accepts` | With canaries seeded and mapped, no tool answers a canary, for generated valid arguments. A tool that writes is called twice with the same arguments, so a confirmation gate lets it run, and the project is restored after. | A row value reaches the provider, `state.json` or the chat. |
| `<tool> refuses a $hidden value sent back and writes nothing` | A tool that writes answers an error and leaves the project's files as they were when the arguments hold `{ $hidden }` at a free-form position. | An edit overwrites the code's real value with the placeholder the AI was shown. |
| `page_verify answers a report of a page no value of a row, whatever the page quoted` | `redactVerifyReport` leaves no canary of a generated report, which quotes them in targets, details, console text, request URLs, sources and notes. | The page check quotes what a page showed. |
| `names every tool of the registry as driven here or driven apart` | `page_verify`, which needs a browser, is the only tool driven through its answer function. | A tool skips the check. |

A tool whose generated calls all fail its own argument check fails the test (`no generated call of <tool> passed its argument check`), so a generator that stops reaching a tool cannot pass silently. `TAKES_NO_FREE_FORM_VALUE` lists the 17 tools that write and have no free-form position; the test fails when a tool is in the list and takes one, or is out of it and takes none.

## Run it

From the repository root, with Node 24 and `pnpm install` done:

```sh
node .agents/skills/formal-ai-answers-no-row-values/check.mjs
```

It builds `packages/dms` (skipped when `DMS_PREBUILT` is set), then runs the one test file with `ajs module test`, which boots the module against an in-memory MongoDB (the first run downloads the binary; see `packages/dms/TESTING.md`). It prints nothing when the property holds. About 2 minutes on a desktop.

- Exit 0: every rule holds for the generated cases.
- Exit 1: `BROKEN <tool>` per failed test, then the runner's output, with fast-check's seed and the counterexample arguments of the first failure.
- Exit 2: the build or the runner could not run.

`dms-control formal` runs it and reads each `BROKEN` line as a violated rule. CI runs it in the `formal-generated` job.

## When to run it

Run it when a change touches a file in the coverage record below, adds or edits an MCP tool, changes a tool's input schema, or changes how a mapping writes code from rows. A `BROKEN` line makes `dms-control formal` print `ERROR` or `VIOLATED`, and the verifier explains it in the reply (`verify-dms` verdict rule 5).

## Real bug or modeling error

A `BROKEN <tool>` for the first rule is a real leak when the answer text printed with it holds a canary that the tool took from rows: read where the value sits in the answer, and find the code that left it in. It is a modeling error only when the canary reached the answer from the arguments (a generated string that equals a canary), which the pools do not produce: the pools hold refs, paths, columns and names. For the second rule, read the answer printed with the failure: a tool that wrote `{ $hidden }` into the project, or answered without an error, is real. A tool that refuses for another reason passes.

Replay a failure with the seed and counterexample fast-check prints, by calling the tool with those arguments in `tool-row-values.test.ts`'s fixture.

## Findings on the code

None stand. The check passes on `next` at the sync commit.

## Changing the check

- A new tool needs nothing, unless it is driven apart from `call`, or takes a string no pool in `options()` names: add a pattern to `grounding` so generated calls reach its work, and keep the "passed its argument check" assertion green.
- A new canary goes in `ROW_VALUES` and in the profile or mapping that holds it.
- Never weaken a rule to make the check pass. A fixed finding needs no record: the test passes.
- After you confirm that the check describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Part of the check | Code |
| --- | --- |
| Every tool called through `call` | `MCP_TOOLS` (`packages/dms/src/mcp/tools/index.ts`), `defineTool` and its `$hidden` refusal (`packages/dms/src/mcp/tool.ts`, `packages/dms/src/mcp/hidden-values.ts`) |
| Row values hidden in code | `packages/dms/src/mcp/redact.ts`, `packages/dms/src/mcp/hidden-values.ts`, `packages/dms/src/implementations/dms-builder/engine/mapped-modules.ts`, `packages/dms/src/mcp/tools/builder-shared.ts` |
| Tools that read or write the mapped code | `packages/dms/src/mcp/tools/builder-pages.ts`, `builder-resources.ts`, `builder-compose.ts`, `builder-project.ts`, `builder-queries.ts`, `builder-table-view.ts`, `database.ts` |
| `page_verify` | `packages/dms/src/mcp/tools/page-verify.ts`, `packages/dms/src/mcp/page-verify/redact-report.ts` |

The sync commit is `daa3203f4` on AntelopeJS/dms `next`.

## Bounds and what is left out

A pass covers these bounds only: seed 1065, 12 generated calls per tool that reads, 6 per tool that writes, 30 per tool for `$hidden`, 200 reports for `page_verify`, one mapped table (`erp.orders`) with a badge, a price and a date column, and one mapping state.

The check leaves out:

- a sequence of calls. Each write call starts from the mapped project, so a leak that needs two different writes in a row is not reached.
- a value that does not equal a canary. A transformed value (a hash, a prefix) passes; only a change to `ROW_VALUES` extends it.
- where an answer goes after the tool: the SSE stream, `state.json` and the chat store.
- the browser run of `page_verify`: its report is generated, so what the browser reads from a page is out of scope.
- tools in another access mode than the one the call takes: the tools are called directly, without the MCP protocol's access filter.
- a database other than the stubbed catalog connection: the real drivers are not run.

## Confirm the check can fail

On the code before #1065 (`14d34c5e3`, the parent of `525d45c41`), with the test copied in and its mapping written the way that code took it (badge `items`, price `currency`), the check fails with eight tests broken: `builder_page_structure`, `builder_resource_structure`, `builder_remove_field` (the diff), `builder_mapping`, `database_profile`, `page_verify` (the report was answered whole, so the generated report keeps its canaries), `builder_compose_page` and `mockup_write_spec` (they accept `{ $hidden }`).

On the current code, a scratch change that turns off `defineTool`'s refusal of `$hidden` (`packages/dms/src/mcp/tool.ts`, the `containsHiddenValue` test replaced by `false`) makes `builder_compose_page` and `mockup_write_spec` fail with `BROKEN`; the other write tools still refuse `{ $hidden }` through their own checks. Dropping the scratch change puts the check back to passing.
