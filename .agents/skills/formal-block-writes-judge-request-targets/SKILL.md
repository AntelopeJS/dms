---
name: formal-block-writes-judge-request-targets
description: Generated-input check of the MCP tools of @antelopejs/dms that persist blocks (builder_add_block, builder_compose_page, builder_configure_block, mockup_apply_to_page), run on the real tools: a block that posts, loads or links outside its page's data API is refused and nothing is written. Use when a change touches a file in its coverage record, adds an MCP tool that writes block options, or changes the request-target judge.
---

# Formal check: every block write judges where its requests go

A block an agent builds runs in the owner's browser with the owner's session. A form posting to `/api/builder/database/connections/check`, a KPI that loads with a write method, a row action calling another API or a link that runs a script all act for the owner. #1074 made `builder_add_block` and `builder_compose_page` refuse such a block, and days later #1076 found `mockup_apply_to_page` writing blocks through `SetPageBlocks` with no judge. This check does not drive one tool: it drives every tool that persists block options, and it fails when a tool is added to the registry without being sorted.

Verification here is a generated-input test of the real code, not a hand model: no model checker runs on this TypeScript, and the property is about what a tool writes, not about an order of steps.

- `packages/dms/src/test/formal/block-writes-judge-request-targets.test.ts` holds the property and the sorting of the tools.
- `packages/dms/src/test/formal/helpers/request-targets.ts` generates the options: request URLs that no endpoint of the `builder` resource's data API is, by construction (`/api/builder/database/connections`, a page route, `//attacker.invalid`, a dot segment, a suffix after an endpoint, with a query or a `{{token}}`), and the places they go in a block: a form's `submitUrl` and a secret field's `rotateUrl`, a KPI's `fetchUrl` with a write method, a row action's `api` target, and a script link (`javascript:`, ` java\tscript:`, `java{{query.zz}}script:`, `data:`, `vbscript:`).
- `packages/dms/src/test/formal/helpers/shop-project.ts` builds the project: the shop of `block-requests.ts` (a page `/shop/board` and a resource `builder`) with a Form, a KpiCard and a TableView written on the page, restorable after each call.
- `packages/dms/src/test/formal/helpers/mockup-engine.ts` runs the mockup engine as in development, and puts `mockups/` back as it found it.

## The property and the harm

| Rule (test title) | Plain sentence | Harm when it breaks |
| --- | --- | --- |
| `<tool> on a <block> refuses options aimed outside it and writes nothing` | For each tool that persists block options and each block type, options aimed outside the data API give an error answer, and every file of the project is as it was. | A block writes as the owner to a route only the owner may call. |
| `<tool> on a <block> writes options aimed inside the data API` | The same tool writes options aimed at the resource's own endpoint (`/api/builder/new`, `/api/builder/count`, a `https` link), and a file changes. | The refusal is blanket, and the check passes without judging. |
| `sorts every tool that writes into one that reaches block options or one that does not` | The write tools of `MCP_TOOLS` are exactly `BLOCK_WRITERS` and `NO_BLOCK_OPTIONS`. | A new tool that writes blocks skips the check. |
| `carries a Form through a mockup as a custom sketch...` | A Form is a Custom sketch in a mockup, so `mockup_apply_to_page` writes none of its options, and the Form is not driven through that tool. | A change that makes the mockup edit forms leaves that path unjudged. |

The tools driven: `builder_add_block` (a new `...Extra` block), `builder_compose_page` (a new block), `builder_configure_block` (a patch of an existing block) and `mockup_apply_to_page` (`mockup_from_page`, an edit of the node's options in `spec.json`, then the apply), each on a Form, a KpiCard and a TableView.

## Run it

From the repository root, with Node 24 and `pnpm install` done:

```sh
node .agents/skills/formal-block-writes-judge-request-targets/check.mjs
```

It builds `packages/dms` (skipped when `DMS_PREBUILT` is set), then runs the one test file with `ajs module test`, on an in-memory MongoDB (the first run downloads the binary; see `packages/dms/TESTING.md`). It prints nothing when the property holds. About 2 minutes on a desktop.

- Exit 0: every rule holds for the generated cases.
- Exit 1: `BROKEN <tool>` per failed test, then the runner's output, with fast-check's seed and the counterexample options of the first failure.
- Exit 2: the build or the runner could not run.

`dms-control formal` runs it and reads each `BROKEN` line as a violated rule. CI runs it in the `formal-generated` job.

## When to run it

Run it when a change touches a file in the coverage record below, adds or changes an MCP tool that writes block options, changes the URL rules of `builder-request-targets.ts`, or changes how the engine writes a block's options. A `BROKEN` line makes `dms-control formal` print `ERROR` or `VIOLATED`, and the verifier explains it in the reply (`verify-dms` verdict rule 5).

## Real bug or modeling error

A `BROKEN <tool>` on the refusal rule is real when the answer printed with it is not an error and the counterexample URL is one the data API does not serve: read the URL and the tool's answer. It is a modeling error when the URL is one the data API does serve; every generated URL has a root no endpoint has, so that means a new endpoint of the data API, which belongs in `DATA_API_ENDPOINTS` of `builder-request-targets.ts` and not in this check. A `BROKEN` on the blanket rule means the tool refuses a well-formed block: check the block's options against `builder_catalog` before blaming the judge.

Replay a failure by calling the tool with the printed options in the shop of `block-requests.ts` (`packages/dms/src/test/unit/builder/block-request-targets.test.ts` shows how).

## Findings on the code

None stand. The check passes on `next` at the sync commit.

## Changing the check

- A tool that writes block options goes in `BLOCK_WRITERS`, with a function in `WRITERS` that sends options the way the tool takes them. A tool that writes and reaches none goes in `NO_BLOCK_OPTIONS`.
- A new URL option goes in `badOptions` and `goodOptions`, per block type.
- Never weaken a rule to make the check pass. A fixed finding needs no record: the test passes.
- After you confirm that the check describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Part of the check | Code |
| --- | --- |
| The judge | `packages/dms/src/mcp/tools/builder-request-targets.ts` (`foreignRequestRefusal`, `judgePatch`, `draftRequestIssues`) |
| `builder_add_block`, `builder_configure_block` | `packages/dms/src/mcp/tools/builder-pages.ts` |
| `builder_compose_page` | `packages/dms/src/mcp/tools/builder-compose.ts` |
| `mockup_apply_to_page` | `packages/dms/src/mcp/tools/mockup-apply-to-page.ts` (`judgedWriter`), `packages/dms/src/mockup/apply-to-page.ts` |
| The block a patch is merged into | `packages/dms/src/implementations/dms-builder/engine/configure-target.ts` |

The sync commit is `daa3203f4` on AntelopeJS/dms `next`.

## Bounds and what is left out

A pass covers these bounds only: seed 1074, 12 generated option sets per tool and block type, three block types, one page, one resource.

The check leaves out:

- the other writers that never take block options from the agent (`NO_BLOCK_OPTIONS`): the test sorts them by name, and a review decides that a tool reaches none.
- `builder_configure_table_view`, which writes only column choices into a TableView's options, and `builder_map_resources`, which writes the options the mapping computes.
- an option that carries a request in a way `URL_RULES` does not name: the generator draws from the rules' keys, so a block option that takes a URL under another key is not reached.
- a block type the shop's catalog does not have, and children nested under a container.
- the status of the `{{token}}` filling at run time: only the text of the URL is judged.

## Confirm the check can fail

On the code before #1074 (`e5f20b212^`), with the test and `block-requests.ts` copied in, eleven tests fail: all the refusal tests, for `builder_add_block`, `builder_compose_page`, `builder_configure_block` and `mockup_apply_to_page` on each block type they reach. Every write is accepted and the project's files change.

On the current code, a scratch change that makes `foreignRequestRefusal` return `undefined` (`if (targets.length >= 0) return undefined;` in place of the length test) fails the six tests of `builder_add_block` and `builder_compose_page`; `builder_configure_block` and `mockup_apply_to_page` keep refusing, since they judge a patch and a draft through `judgePatch` and `draftRequestIssues`. Dropping the scratch change puts the check back to passing.
