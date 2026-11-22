---
name: formal-route-patterns
description: fast-check property check that the path matchers of the mockup spec agree on every string (the backend's RELATIVE_ROUTE_PATTERN and liveRouteSchema, the Vue layer's isDashboardPath and resolveUrlVariables). Use when a change touches a file in its coverage record, or when a change to a built page's path, a live route or a `{{ }}` route token needs proof that the backend and the dashboard still read the same strings.
---

# Formal check: route patterns across backend and Vue

A mockup spec holds two kinds of path. A built page's path (`builtPages[].path`) must be a path of the dashboard: one leading `/`, no host (`//host`, `/\host`), no whitespace, and no control character, which a URL parser drops (`/<tab>/host` reads `//host`). A live route (`liveRoutes`) is the same rule, plus `{{ params.id }}` tokens whose key a plain space may pad. Three pieces of code decide this and must agree on every string:

- `RELATIVE_ROUTE_PATTERN` and `relativeRouteSchema` (the built page's path), and `LIVE_ROUTE_PATTERN` and `liveRouteSchema` (the live route), in `packages/dms/src/mockup/model.ts`.
- `isDashboardPath` in `packages/dms/frontend-vue/layers/dms-ui/app/build/utils/mockup.ts`, which reads every built path the backend lists. One path it refuses hides the whole mockup list, and one it accepts that the backend refuses lets `/\^@/evil.example/steal` read as `//evil.example`.
- `resolveUrlVariables` in `packages/dms/frontend-vue/layers/dms-ui/app/build/utils/urlVariables.ts`, which fills the tokens of a live route before the dashboard requests it.

dms#950 moved the backend to one rule, and its two escapes each cost a fix: the Vue check kept the old `\S*` and accepted the control-character path (dms#975), and the strict rule refused `{{ params.id }}` live routes, so saved specs stopped reading (dms#976). The only shared check was a fixed table (`relative-routes.json`) that grew by one row per miss.

This check runs the real functions, not a model of them, on generated strings: fast-check draws separators, control characters, Unicode spaces, braces and padded `{{ }}` tokens, and shrinks a failure to the shortest string.

- `properties.cts` holds the generators and the rules.
- `check.mjs` runs it with `tsx` and exits with its code. The runner shared with other fast-check targets is `.agents/formal/run-properties.cts`.

## Run it

From the repository root, with Node 24 and `pnpm install` done (`tsx` and `fast-check` are root dev dependencies):

```sh
node .agents/skills/formal-route-patterns/check.mjs            # 5,000 cases of each rule
node .agents/skills/formal-route-patterns/check.mjs --full     # 100,000 cases of each rule
node .agents/skills/formal-route-patterns/check.mjs --verbose  # also print each finding's counterexample
node .agents/skills/formal-route-patterns/check.mjs --seed 7   # another run, same rules
```

A run starts from one fixed seed, so it reproduces; pass `--seed` to look elsewhere. The CI configuration takes about 0.6 s and `--full` about 2 s, and neither needs Java or a database.

- Exit 0 means every rule that held still holds, and each finding still breaks.
- Exit 1 means a rule changed. `BROKEN` names a rule that held and now breaks, with its shrunk counterexample on the next line. `HOLDS` names a finding that no longer breaks.
- Exit 2 means the check could not run, or the arguments were wrong.

The lines that name a changed rule match `^(?:BROKEN|HOLDS) +(\w+)`. A rule that still holds prints as lowercase `holds`, and a recorded finding that still breaks prints as `finding`.

## When to run it

Run `--full` when a change touches a file in the coverage record below, or this folder. A changed rule exits 1. Explain it in the reply. CI runs the CI configuration on every push.

## The rules

A candidate is a string of edge characters (`/`, `\`, `{`, `}`, tab, newline, NUL, C1 controls, U+00A0, U+2003, U+3000, U+FEFF, U+200B and any other code unit) and `{{ key }}` tokens, with a leading `/` nine times in ten.

| Rule | Plain sentence | Harm when it breaks | On main |
| --- | --- | --- | --- |
| `BackendAndVueAgree` | `RELATIVE_ROUTE_PATTERN` and `isDashboardPath` accept the same strings. | A built path the backend lists hides the mockup list, or a path with a control character reads as a host. | holds |
| `BuiltPathRuleIsPatternAndLength` | `relativeRouteSchema` accepts a string exactly when `isDashboardPath` does and it has at most 2,048 code points, as zod 4.5 and later count a string's length. | The schema and the dashboard stop reading one path the same way. | holds |
| `LiveRouteResolvesToBuiltPath` | A live route that `liveRouteSchema` accepts, its tokens padded with plain spaces and filled with any text the page carries, resolves through `resolveUrlVariables` to nothing (a token has no value) or to a path `isDashboardPath` accepts. | A saved spec's route, once its tokens are filled, is requested as a host or with a control character. | holds |
| `ResolvedRouteIsALiveRoute` | A route with plain-space padded tokens that the dashboard resolves to a path of the dashboard is accepted by `liveRouteSchema`. | A converted page sketches a block that the dashboard reads, or a saved spec stops reading. | holds |
| `ResolvedPaddedRouteIsALiveRoute` | The same, with the padding the dashboard's `\s*` reads: a tab, a newline, a non-breaking space. | The conversion sketches the block as `remote-route` instead of keeping its route. | finding F1 |

## Findings on main

- **F1, the dashboard resolves a token that the live route refuses (`ResolvedPaddedRouteIsALiveRoute`).** `urlVariables.ts` pads a token with `\s*`, so `/{{params.id }}` fills with the page's `id`, but `LIVE_ROUTE_PATTERN` admits only U+0020 padding, so `liveRouteSchema` refuses the route. The refusal was chosen in dms#976 ("tabs, non-breaking spaces and any space outside a complete token stay refused") and fails on the safe side: the conversion sketches the block instead of keeping its route. It stays a recorded finding because the two readings are not one: the dashboard resolves what the spec refuses. Making them one, by padding tokens with `' *'` in `urlVariables.ts` or by letting the live rule admit `\s` inside a token, flips this finding to `HOLDS`: take it off `findings` in `properties.cts`, and move it to the rules that hold here.

## Real bug or modeling error

A counterexample is a string, so replay it on the real code: call `RELATIVE_ROUTE_PATTERN.test`, `liveRouteSchema.safeParse` and `isDashboardPath` on it, and `resolveUrlVariables(route, { routeParams: { id: "1" }, routeQuery: {} })` for a token. When all agree with the printed rule, it is a real finding, and the tests that cover it are `src/test/unit/mockup/from-page.test.ts` and `store-list.test.ts` for the backend and `frontend-vue/tests/mockup-built-paths.test.ts` for the Vue layer. A rule is a modeling error only when its generator builds a string the real code cannot meet, such as a token value the dashboard never carries.

## Changing the check

- For an intended change of the route rule, edit the generators only where they no longer draw what the rule reads, and update the table above. Never weaken a rule to make the check pass.
- A fixed finding leaves the `findings` set in `properties.cts` and keeps its row. A new finding goes into that set and into this file with its counterexample.
- After you confirm that the check describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Rule | Code |
| --- | --- |
| `BackendAndVueAgree`, `BuiltPathRuleIsPatternAndLength` | `RELATIVE_ROUTE_PATTERN`, `MAX_RELATIVE_ROUTE` and `relativeRouteSchema` (packages/dms/src/mockup/model.ts:110-121); `isDashboardPath` (packages/dms/frontend-vue/layers/dms-ui/app/build/utils/mockup.ts:294-298) |
| `LiveRouteResolvesToBuiltPath`, `ResolvedRouteIsALiveRoute`, `ResolvedPaddedRouteIsALiveRoute` | `LIVE_ROUTE_PATTERN` and `liveRouteSchema` (model.ts:124-139); `resolveUrlVariables`, `replaceUrlVariables` and the token patterns (packages/dms/frontend-vue/layers/dms-ui/app/build/utils/urlVariables.ts) |

The sync commit is `0de3a0372` on AntelopeJS/dms `next`.

## Scope and what is left out

A pass covers the strings the generators draw: up to 14 parts of edge characters, binary code units and tokens, with token keys `params.id`, `params.id:3`, `query.page`, `query.a-b.c`, `response.user.name` and five near misses, and page values from a fixed list plus arbitrary text. It is a sample of the space, not a proof, so a rule can hold on 100,000 cases and break on a string never drawn; run it with other seeds when a change is risky.

The check leaves out:

- `{{response.X}}` tokens. The dashboard writes a response value into the URL as answered, so the path it builds depends on the data, not on the pattern.
- `routeIssue` in `packages/dms/src/mockup/from-page.ts` and the generated JSON Schema in `json-schema.ts` and `data/mockup-spec.schema.json`, which pass the patterns on. `store-list.test.ts` and `from-page.test.ts` read them.
- The lengths of a live route. Only `relativeRouteSchema` is checked against `MAX_RELATIVE_ROUTE`.
- `fixtures/relative-routes.json`, which the unit tests of both sides still read.

## Confirm the check can fail

Each scratch change reverts a fix on a copy of the file, then `check.mjs` runs; revert it afterwards with `git checkout`.

| Scratch change in the code | Result |
| --- | --- |
| Put the pre-dms#975 rule back in `isDashboardPath`: `/^\/(?![/\\])\S*$/` | exit 1: `BROKEN BackendAndVueAgree`, `BROKEN BuiltPathRuleIsPatternAndLength`, `BROKEN ResolvedRouteIsALiveRoute`, counterexample `["/\u0085"]` |
| Put the pre-dms#976 rule back: `liveRouteSchema = relativeRouteSchema` | exit 1: `BROKEN LiveRouteResolvesToBuiltPath` and `BROKEN ResolvedRouteIsALiveRoute`, counterexample `["/{{  params.id}}"]` |

Both ran at the sync commit. With the scratch change dropped, `check.mjs` exits 0.
