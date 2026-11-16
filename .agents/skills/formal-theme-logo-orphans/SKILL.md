---
name: formal-theme-logo-orphans
description: Property check of the orphan cleanup of the builder theme save (SetTheme, orphanedAssets, reachableStrings, builtFileNames), generated with fast-check over the ways an app config can spell a logo path. Use when a change touches a file in its coverage record, or when a change to how the builder reads or deletes logo files needs proof that a save never deletes a file the app config can still produce.
---

# Formal check: theme logo orphans

`SetTheme` writes the logos a draft uploads into `public/branding` and deletes the builder-named logo files that no slot reaches any more. A slot can reach a file through any string the app config spells, so a deletion that misses one spelling removes a logo that the dashboard, the email or the favicon still serves. Seven fixes (#985, #999, #1010, #1019, #1024, #1036, #1041) each added one spelling the cleanup had missed.

The promise it checks: for a generated app config that reaches a builder-named logo file through any composition of literals, constants, imports, templates, `+`, `.concat()`, `[...].join()` and URL encoding, a `SetTheme` that changes another slot never deletes that file.

The tool is fast-check, run through the module test runner, because the code under test is TypeScript that parses the config with ts-morph. A model of it would check the model, and fast-check checks the real `SetTheme` on a real layer folder.

- `packages/dms/src/test/unit/builder/helpers/logo-spellings.ts` generates the spellings and renders each one as an app config, a `brand/logos.ts` file and a `brand/paths.ts` re-export. It evaluates the spelling itself, so the oracle shares no code with the engine.
- `packages/dms/src/test/unit/builder/theme-logo-orphans.formal.test.ts` holds the property, the versions of the check before a fix, and the findings.
- `check.mjs` builds `packages/dms` and runs that one test file.

## Run it

From the repository root, with Node 24 and `pnpm install` done:

```sh
node .agents/skills/formal-theme-logo-orphans/check.mjs
```

It prints nothing when the file passes, and takes about 40 s with the build (the test file runs in 5 s). The test file also runs in the `test:builder` shards of CI, since it sits in `src/test/unit/builder`. Run it alone with `pnpm --dir packages/dms exec ajs module test . -f dist/test/unit/builder/theme-logo-orphans.formal.test.js` after a build.

- Exit 0: the property holds on 400 generated configs and every finding still reproduces.
- Exit 1: `BROKEN SetThemeKeepsReachableLogos`. The output holds the failing test. A property failure prints the shrunk counterexample, a `Spelling` tree: render it with `appConfigFor` (in the helper) and save it over a layer to replay it. A finding that no longer reproduces names itself: the defect is fixed, so delete it from `FINDINGS` and from the findings below.
- Exit 2: the build failed.

The seed is fixed (`SEED`), so a run is repeatable. To search wider, raise `RUNS` for one run: 3000 configs take 20 s and held at the sync commit.

## What the property covers

Each generated config puts the path of an uploaded logo in `default.light` and spells it in `email.light`: the path itself, with `?v=3` or `#/a/3`, inside `/_vercel/image?url=…&w=64` percent-encoded or not, or behind a host. Each spelling is built from:

- literals in single, double or backtick quotes;
- constants, declared in the app config or in a file it imports through `~/`, `@/`, a relative path, or a `export *` re-export;
- template literals, `+` chains, `.concat()` and `[...].join()` over any of these, to depth 3, cutting the path anywhere but inside a `%XX` escape.

Then `SetTheme` saves a draft that omits the `default` slot, which removes its literal, and the property asks that the file still exists.

A top-level literal in `email.light` is held in a constant: a save rewrites a literal slot, so the file is then rightly unreachable.

### Shapes left out of the property

A name is reached by static text around runtime values, so the generator keeps each runtime value (a constant, a template substitution) free of the characters a file name cannot hold, and never puts two runtime values side by side without text between them. Three shapes outside that contract break the property today; each is a finding below.

## Versions before a fix

The test file asserts that the property fails on the orphan check as it was before each of three fixes, rebuilt from exports that still exist:

| Version | What it reads | Counterexample found |
| --- | --- | --- |
| before #985 | the logo paths of the saved config | any config that names the file through a constant |
| before #999 | the string literals of the app config | any config that builds the name or imports it |
| before #1010 | the literals of the config and its imports | any config that builds the name from text |

The property also fails on the real `SetTheme` at the parent of #985 (`6e82402bb`), on its first generated config, in a scratch worktree with the helper and the main test of this folder copied in; that run is not a CI step.

The versions before #1019, #1024, #1036 and #1041 differ from today in the internals of `buildsFileName` and `builtSegments`, which these exports cannot rebuild, so the check does not replay them. Each of those fixes is a spelling the generator covers, and the main property fails on a check that drops `builtFileNames` (scratch change below).

## Findings on the code

Each finding is a hand-written config in `FINDINGS`, saved through the real `SetTheme`. The test asserts the file is deleted, so a fix turns it red. None is fixed.

- **F1, a name joined from a constant array.** `const PARTS = ["default", "light", "<hash>.png"]` and `"/branding/" + PARTS.join("-")` evaluate to the logo path. `pieces` reads `.join` only on an array literal, so the call reads as a runtime value and no literal holds the whole name: the file is deleted.
- **F2, a constant that holds a path separator beside text of the name.** `const DIRECTORY = "ing/"` and `"/brand" + DIRECTORY + "default-light-" + "<hash>.png"`. The text before the constant splits at its `/`, so the segment that ends the name starts with `brand`, and the name does not match.
- **F3, a name spelled by constants alone.** `const SLOT = "default-"`, `const REST = "light-<hash>.png"` and `"/branding/" + SLOT + REST`. `builtSegments` drops a segment with no static text on purpose (it could be any file), so a name with no text of its own matches nothing.

F2 and F3 are by design in the code (`builtSegments` documents the empty segment). They are findings because the promise is stated over what evaluating the config produces. Decide which to fix: evaluate constants, or keep every owned file a config of this shape could name.

## Real bug or modeling error

A counterexample is a modeling error when the config cannot reach the file in the app: the generator renders invalid TypeScript, or the saved config differs from what the helper evaluated (a literal slot rewritten by the save). Replay it on a layer: write the three files `appConfigFor` returns, call `SetTheme(configDraft())` and look at what `public/branding` holds. If the evaluation of the config (read it by hand) names the file and the file is gone, it is a real finding: add a hand-written config to `FINDINGS` and exclude its shape from the generator only after the finding is recorded. Never narrow the generator to make a failure pass.

## Changing the check

- A new spelling the code reads: add it to `spell`, `operations` or `targetStrings`, then rerun with a larger `RUNS`.
- A fixed finding: delete it from `FINDINGS` and from this file, and widen the generator over its shape if the shape is in the property's range.
- After you confirm that the check describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Check part | Code |
| --- | --- |
| the deletion | `orphanedAssets` and `OWNED_ASSET` (`packages/dms/src/implementations/dms-builder/engine/theme-assets.ts`), called from `writeTheme` (`engine/theme.ts`) |
| literals | `stringLiterals`, `readLogos`, `logoPaths` (`engine/theme-app-config.ts`) |
| built names | `builtFileNames`, `builtSegments`, `pieces`, `buildsFileName` (`engine/theme-app-config.ts`) |
| imports and constants | `reachableStrings`, `aliasedPath` (`engine/theme-config-imports.ts`) |
| what a save rewrites | `writeAppConfig`, `canWriteString` (`engine/theme-app-config.ts`, `engine/theme-literals.ts`) |

The sync commit is `0de3a0372` on AntelopeJS/dms `next`.

## What is left out

- A spelling outside the listed forms: template tags, `String.raw`, `.replace`, `.padStart`, ternaries, function calls other than `.concat` and `.join`, and `encodeURIComponent` applied in the config. The engine reads each as a runtime value.
- A config that reaches the file from a package import, a dynamic import or a file outside `app/`.
- A logo slot other than `email.light` holding the spelling, and several slots holding spellings at once.
- Precision: the property never asks that an unreached file is deleted. Existing tests in `theme-assets.test.ts` cover deletion of an unreached file for each spelling.
- Fonts (`orphanedFontFiles`), which `writeTheme` cleans the same way.

## Confirm the check can fail

These ran at the sync commit. Each edit is a scratch change in the real code, with `check.mjs` run after it and the edit then dropped.

| Scratch change | Result |
| --- | --- |
| `orphanedAssets` ignores `builtFileNames` (`builtFileNames.some((built) => buildsFileName(built, fileName) && false)`) | exit 1, `BROKEN SetThemeKeepsReachableLogos`, the property fails on its first generated config |
| the three versions before a fix | each fails on its first generated config, asserted by the test file on every run |

With the edits dropped, `check.mjs` exits 0.
