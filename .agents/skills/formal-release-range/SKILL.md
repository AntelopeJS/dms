---
name: formal-release-range
description: Checks the release rules that the interfaces in the tree satisfy the ranges the DMS module publishes for them (satisfiesImplementedRange for interface-dms, satisfiesBoundedRange for interface-dms-builder) against semver, prereleases included. Use when checks/release-range.mjs, the validate job of .github/workflows/release.yml, the interface-dms or interface-dms-builder version, or their ranges in packages/dms/package.json change.
---

# Verify the release range rule

The `validate` job of the module release refuses to publish `@antelopejs/dms` unless the interface version in the tree satisfies the range the module publishes for it, and that range is `>=0.M.p <0.(M+1).0`. Without the cap, a breaking interface minor would reach a DMS that does not implement it. If the rule lets a bad pair through, a module is published against an interface release that does not exist, and it installs broken.

The rule is `satisfiesImplementedRange` in `checks/release-range.mjs`. It runs with no dependency, before any install, and the workflow imports it. The properties drive that function and compare it with `semver`.

The same job refuses the release unless the `@antelopejs/interface-dms-builder` version in the tree satisfies the range the module declares for it. The module consumes that interface rather than implementing it, so its range is any `>=A.B.C <D.E.F`. The rule is `satisfiesBoundedRange`, which `satisfiesImplementedRange` also builds on. Any other spelling of the range is refused.

## Run the properties

Use Node 24 from `.nvmrc` and the pinned lockfile install. From the repository root, run this command.

```sh
FC_SEED=20261029 node --test --test-reporter=spec checks/release-range.test.mjs
node --test --test-reporter=spec checks/bounded-range.test.mjs
```

Expect exit code 0 and `fail 0`, with `pass 7` for the first file and `pass 3` for the second, whose default seed is `20261114`. The same files run in `pnpm test`, so `pnpm run checks` and the required CI `checks` job run them.
Change `FC_SEED` to explore another sample. Keep the failing seed and the printed counterexample when reporting a failure. The same seed reproduces the same generation and shrinking with the pinned fast-check version.

Exit 1 means a property failed. Its output is the shrunk counterexample.

## Judge the result

The oracle is `semver.satisfies(version, range)` with default options. It is the check `@antelopejs/core` applies to an interface copy at startup, and a consumer's install resolves with it too. `includePrerelease` is not the promise. It admits `0.10.0-next.0` under `<0.10.0`, which is a prerelease of the breaking minor that the cap exists to keep out. The last test pins the three readings side by side.

1. **Range.** For every mutated range, the rule accepts the semver floor exactly when `semver` parses the range as one `>=0.M.p` and one `<0.(M+1).0` comparator and the text is `>=0.M.p <0.(M+1).0`. It catches a cap that is not the next minor, a loose operator, a union, a prerelease bound, a leading zero and a missing end anchor.
2. **Membership.** For every stable version, the rule and `semver.satisfies` agree. It catches string comparison, an inclusive cap, an exclusive floor, a dropped patch compare, and a dropped major.
3. **Cap.** No version in the next minor or any later release is accepted, prereleases and build metadata included.
4. **Prerelease and build metadata.** For every version, prereleases and build metadata included, the rule and `semver.satisfies` agree.
5. **Bounded membership.** For every `>=A.B.C <D.E.F` range and every version, prereleases and build metadata included, `satisfiesBoundedRange` and `semver.satisfies` agree. Versions are drawn on the floor, on the cap or anywhere.
6. **Bounded shape.** Every other spelling of a range is refused, even where `semver` admits the version.
7. **Unsafe integers.** A number beyond 2^53 - 1 in the version or the range is refused, as `semver` refuses it.

On failure, rebuild the counterexample as a pair of `iface.version` and `pkg.dependencies['@antelopejs/interface-dms']`, or, for a bounded property, of `builder.version` and `pkg.dependencies['@antelopejs/interface-dms-builder']`. Check these facts before calling it a product bug.

- The version is valid semver and the range is the text printed in the counterexample.
- The oracle call uses default options, with no normalised range.

A malformed generator is a modelling error. A mismatch after those checks is a finding. Keep the property, report the counterexample, and leave `checks/release-range.mjs` unchanged unless the user asks for a fix.

## Behaviour probe

`probe.mjs` prints what the release workflow's `validate` step decides in a checkout, one line per case: 80 interface-dms version and range pairs, 42 interface-dms-builder version and range pairs, prereleases and build metadata included, and 8 manifests that each break one of the step's other checks. It extracts the step's node script from `release.yml`, wherever the rule lives (inline, as before #529, or imported from `checks/release-range.mjs`), and runs it on fixture manifests built from the checkout's own. A checkout without `packages/interface-dms-builder` prints no builder rows.

```sh
node .agents/skills/formal-release-range/probe.mjs <checkout>
```

`dms-control formal` runs it on the base and on HEAD of a diff that touches the coverage record. The same output means the diff kept the covered behaviour (`verify-dms` verdict rule 5). A changed line fails it.

## Findings on main

None. The four disagreements recorded before #538 are fixed, and the strict properties now hold. F1 was a prerelease of the floor (`0.9.1-next.0`), F2 a prerelease inside the range (`0.9.5-rc.1`), F3 build metadata (`0.9.5+build.0`), and F4 a leading zero in a range field (`>=0.09.1 <0.10.0`). The rule now rejects every prerelease version, because neither bound carries one, ignores build metadata, and refuses a number with a leading zero.

## Bounds and exclusions

Each property runs 1000 cases with default seed `20261029`, overridable with `FC_SEED`.
Floors are `0.minor.patch` with minor 0 to 4 or 8 to 11 (the second band crosses the `0.9`/`0.10` width change) and patch 0 to 4.
Versions put the major at 0 (weight 8) or 1 to 4, the minor around the floor minor or 0 to 12, and the patch around the floor patch or 0 to 4. Prerelease is absent or `next`, `alpha` or `rc` followed by `.0` to `.4`. Build metadata is absent, `build.0` or `sha.abc123`.
Ranges are the canonical range for the floor and 29 mutations of it (cap and floor changes, other operators, spacing, `v` prefix, prerelease or build bounds, a union, a wildcard, empty, missing, and leading zeros).
An explicit table pins the three oracle readings for seven versions on `>=0.9.1 <0.10.0`, and another pins ten malformed or long versions against `semver.satisfies`.

The bounded properties run 1000 cases with default seed `20261114`, also overridable with `FC_SEED`. Each floor and cap part is 0 to 2 or 8 to 11, so floors above the cap occur too. The version is the floor, the cap or any such triple, followed by nothing, a `next` or `rc` prerelease `.0` to `.2`, or `+build.0` or `+sha.abc123`. The bounded shape test refuses 18 other spellings, among them leading and trailing junk, and a table pins four versions or ranges around 2^53 - 1 against `semver.satisfies`.

The properties do not draw numbers beyond 2^53 (only the unsafe-integers table does), versions or ranges with a leading `v` or `=` on the version, version strings that are not valid semver, or any other check in the `validate` step. The workflow wiring (the step imports `./checks/release-range.mjs` as an ES module) was confirmed by extracting the step and running it, not by a test: a test that read `release.yml` would break the repo's rule that no test reads the file it covers.
`satisfiesImplementedRange` only accepts the exact spelling `>=0.M.p <0.(M+1).0`. A semver-equivalent spelling (two spaces, a trailing space) is rejected on purpose.

## Coverage record

Last synchronized product commit is the one that added the interface-dms-builder rule (ANT-2585), which reran every scratch break below.

| File | What it covers |
| --- | --- |
| `checks/release-range.mjs` | `satisfiesImplementedRange`, `satisfiesBoundedRange` and the version and range patterns they read |
| `checks/release-range.test.mjs` | The properties, the generators and the oracle table |
| `checks/bounded-range.test.mjs` | The bounded-range properties and their generators |
| `.github/workflows/release.yml` | The `validate` job step that imports the module, with `actions/setup-node` before it, and the interface-dms-builder manifest it reads |
| `package.json` | The root `test` script that runs the check, and the `fast-check` and `semver` dev dependencies |

Compare changes since the sync commit against this table before trusting an old pass.
After an intended change to the rule or the range shape, update the oracle, generators and this record together.
Move the sync commit forward only after confirming the properties still describe the changed code and rerunning them, including a scratch break.

## Confirm the check can fail

In a scratch copy of `checks/release-range.mjs`, `checks/release-range.test.mjs` and `checks/bounded-range.test.mjs` outside the repo, apply one break at a time to the module, run both test files, and restore it. These breaks were caught at the sync commit with the default seeds (`20261029` and `20261114`). Every break made at least one file exit 1, and the restored copy exited 0 on both.

| Scratch break | Failing observation |
| --- | --- |
| Numbers compared as strings | Range fails for `>=0.9.0 <0.10.0`, membership for `0.10.0` on `>=0.1.1 <0.2.0`. Bounded membership fails for `8.0.0` on `>=1.1.9 <10.2.11`. |
| Drop the patch comparison | Membership fails for `0.9.0` on `>=0.9.3 <0.10.0`. Bounded membership fails too. |
| Ignore the major | Membership and cap fail for `1.2.2` on `>=0.2.2 <0.3.0`. Bounded membership fails too. |
| Exclusive floor | Range fails for `>=0.0.4 <0.1.0` at the floor itself. Membership and bounded membership fail too. |
| Inclusive cap | Membership and cap fail for `0.11.0` on `>=0.10.1 <0.11.0`. Bounded membership fails for `9.1.11` on `>=1.1.0 <9.1.11`. |
| Drop `capMinor === floorMinor + 1` | Range fails for `>=0.11.1 <0.13.0` ("cap skips a minor"). |
| Drop `capMajor === 0` | Range fails for `>=0.0.3 <1.1.0` ("cap major one"). |
| Drop `capPatch === 0` | Range fails for `>=0.3.1 <0.4.1` ("cap patch"). |
| Drop the `^` of the range pattern | Bounded shape fails: it accepts `<0.4.1 >=0.4.0 <1.0.0` and `x>=0.4.0 <1.0.0`. |
| Drop the `$` of the range pattern | Range fails for `>=0.9.3 <0.10.0 ` ("trailing space"). Bounded shape fails too. |
| Accept a prerelease | Prerelease and the oracle table fail. Bounded membership fails for `1.8.2-next.0` on `>=1.8.2 <9.0.2`. |
| Refuse build metadata | Prerelease and the oracle table fail. Bounded membership fails for `8.0.0+build.0` on `>=1.1.9 <10.2.11`. |
| Accept a leading zero (`\d+`) | Range fails for `>=0.00.4 <0.1.0`. The leading-zero test, malformed versions and bounded shape fail too. |
| Accept an empty build suffix | Malformed versions fails for `0.9.5+`. |
| Accept `_` in build metadata | Malformed versions fails for `0.9.5+a_b`. |
| Drop the 256-character cap | Malformed versions fails for a 257-character version. |
| Drop the safe-integer guard in the range | Unsafe integers fails for `0.4.1` on `>=0.4.0 <9007199254740992.0.0`. |
| Drop the safe-integer guard in the version | Unsafe integers fails for `0.9007199254740992.0` on `>=0.4.0 <1.0.0`. |
