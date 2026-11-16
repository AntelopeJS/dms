---
name: formal-builder-option-echo
description: Round-trip property check of the builder options of a page, a block and a category (GetPageStructure, ConfigurePage, SetPageBlocks, ConfigureCategory, ListCategories), generated with fast-check over the ways an author writes an option. Use when a change touches a file in its coverage record, or when a change to how the builder reads or writes page, category or block options needs proof that echoing what it read leaves the source as written.
---

# Formal check: builder option echo

The dashboard reads a page, a block and a category, lets an editor change one option, and sends the whole option set back. An author writes an option as a literal, a constant, an import, an enum member, a template, a shorthand or a call, and the builder reads some of those as values and cannot read the rest. An echo that rewrites what it could not read overwrites or deletes the author's code, or turns a constant into its value. Nine fixes (#927, #928, #962, #964, #969, #981, #993, #994, #1003) each repaired one form.

The promise it checks: for a generated page, block and category whose options are written in any form below, reading them and writing the values read back through `ConfigurePage`, `SetPageBlocks` or `ConfigureCategory` leaves each file byte-identical, and each option the builder can read statically reads as the value it holds.

The tool is fast-check, run through the module test runner, because the code under test parses and rewrites TypeScript with ts-morph and a model would check the model. The property drives the real operations on a real app folder.

- `packages/dms/src/test/unit/builder/helpers/option-spellings.ts` generates an option and writes it in one form, with the statements the form needs.
- `packages/dms/src/test/unit/builder/builder-option-echo.formal.test.ts` builds the three files, runs the property and holds the findings.
- `check.mjs` builds `packages/dms` and runs that one test file.

## Run it

From the repository root, with Node 24 and `pnpm install` done:

```sh
node .agents/skills/formal-builder-option-echo/check.mjs
```

It prints nothing when the file passes, and takes about 1 minute with the build (the test file runs in 25 s). The test file also runs in the `test:builder` shards of CI, since it sits in `src/test/unit/builder`.

- Exit 0: the property holds on 12 generated sets and every finding still reproduces.
- Exit 1: `BROKEN BuilderOptionEchoIsNoop`. The output holds the failing test. A property failure prints the shrunk counterexample, the options with the form of each, and the lines the echo changed. A finding that no longer reproduces names itself: the defect is fixed, so delete it from the findings test and from this file.
- Exit 2: the build failed.

The seed is fixed (`SEED`), so a run is repeatable. To search wider, raise `RUNS` for one run: 100 sets take 3 minutes and held at the sync commit.

## What the property covers

Each generated set has a page (`displayName`, then optionally `icon`, `order`, `hidden`, `description`), the `title` and optionally `fetchUrl` of a `KpiCard` block, and a category (`displayName`, then optionally `icon`, `order`). Each option holds a string, a number or a boolean and is written as:

- a literal;
- a constant of the same file, or of an imported file, by name;
- a template literal over a constant (strings);
- a member of an enum declared in the file or imported, `enum` or `const enum` (strings and numbers);
- a shorthand property over a constant named like the key;
- a call of a function of the file, which the builder cannot read;
- a member of a namespace import, `Values.name` (see F1).

The property then:

1. reads the page with `GetPageStructure` and the category with `ListCategories`, and asks that each option written in a readable form reads as its value;
2. sends the page options back through `ConfigurePage`, then again with the icon as `null` when it read as nothing, the way an editor clears a field;
3. sends the page options and the blocks as read through `SetPageBlocks`;
4. sends the category through `ConfigureCategory`, and again with the icon as `null` when it read as nothing;
5. asks after each save that `board/page.ts` and `board/category.ts` are byte-identical to what was generated.

The generated text follows the builder's own layout: one option per line in a page or category, a block on one line when it fits in 80 columns (a block option stays at four characters so it does), and one option per line otherwise. A block made of literals alone is re-emitted in that layout, so a different layout would be a change the property is not asking about.

### Shapes left out of the property

A block with a shorthand option, and a block with an option the builder cannot read beside another option, break the property today. Each is a finding below.

## Findings on the code

Each finding is a hand-written source in the findings test. The test asserts the symptom is present, so a fix turns it red. None is fixed.

- **F1, a namespace import reads as nothing.** `import * as Values from "./values"` and `icon: Values.icon0` read as no icon, on a page, a block and a category. The page's name falls back to its id. The editor shows the option as empty. An echo of that read leaves the source as written, which the property checks.
- **F2, a block option written as code makes the echo quote its neighbours.** `KpiCard({ title: stringFor("a"), fetchUrl: "/a" })` echoed with the blocks as read becomes `KpiCard({ title: stringFor("a"), "fetchUrl": "/a" })`. The same happens for a block option written through a namespace import, which it reads as code.
- **F3, a block option written as shorthand is written back as key and value.** `KpiCard({ title, fetchUrl: "/a" })` becomes `KpiCard({ title: title, fetchUrl: "/a" })`. A page option written as shorthand is kept (#964).

F2 and F3 leave the page working and change its text, which the promise rules out. F1 makes the dashboard show an option that is set as empty.

## Versions before a fix

At the parent of #927 (`13c899f86`) the property fails on its first generated set: the category's `order` written as a shorthand reads as nothing, as before #969. That run could not use the category echo of a parent, which `ConfigureCategory` refused as "not supported in v1", so the scratch copy dropped `parent` from that call. The run was a scratch worktree, not a CI step.

## Real bug or modeling error

A counterexample is a modeling error when the generated source is not what the builder writes, or when the form cannot hold the value (a boolean enum, a template over a number): the property then fails on a source the author could not have written. Check the printed source first. When it is a real option echoed unchanged, replay it: write the printed files to an app folder (`createFixture`, `app.write`), run the failing step, and read the file. Add the case to the findings test, and exclude its shape from `OPTIONS` only after it is recorded there. Never narrow the generator to make a failure pass.

## Changing the check

- A new form or option: add it to `OptionForm` and `writeOption`, or to `OPTIONS`, then rerun with a larger `RUNS`.
- A fixed finding: delete it from the findings test and from this file, drop its exclusion from `OPTIONS` or `isRead`, and rerun.
- After you confirm that the check describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Check part | Code |
| --- | --- |
| reading page, block and category options | `optionValue` (`packages/dms/src/implementations/dms-builder/engine/config-literal.ts`), `GetPageStructure` (`engine/page-structure.ts`), `ListCategories` (`engine/ops-categories.ts`) |
| the echo of a page or category option | `optionsPatch`, `writePatch` (`engine/options-patch.ts`), `ConfigurePage` (`engine/ops.ts`), `ConfigureCategory` (`engine/ops-categories.ts`) |
| the echo of a block | `SetPageBlocks` (`engine/page-draft.ts`), `heldAt` (`engine/held-value.ts`), `hides` (`engine/literal-overrides.ts`) |
| bindings an echo may drop | `pruningOrphans` (`engine/options-patch.ts`), `engine/local-bindings.ts` |

The sync commit is `0de3a0372` on AntelopeJS/dms `next`.

## What is left out

- Options other than the ones listed: a page's `permission` and `live`, a block's nested and array options, and the other blocks of the catalog.
- A real edit: the property echoes what it read and never changes an option, so it does not check that a changed option is written and the others kept. Existing tests (`page-constant-options.test.ts`, `category-constant-options.test.ts`) cover that.
- Expressions other than the forms above: spreads, ternaries, `as const`, object-valued options, and `a + b` over constants.
- Several blocks, nested blocks, and a page or category in more than one file.
- A line wider than 80 columns holding code-valued options: the builder keeps it as written.

## Confirm the check can fail

These ran at the sync commit. Each edit is a scratch change in the real code, with `check.mjs` run after it and the edit then dropped.

| Scratch change | Result |
| --- | --- |
| `optionsPatch` keeps every key of a patch, so an echo rewrites the options it set to the value they read (`engine/options-patch.ts`) | exit 1, `BROKEN BuilderOptionEchoIsNoop`, `ConfigureCategory` rewrote `board/category.ts` |
| the code before #927, in a scratch worktree | the property fails on its first generated set |

With the edit dropped, `check.mjs` exits 0.
