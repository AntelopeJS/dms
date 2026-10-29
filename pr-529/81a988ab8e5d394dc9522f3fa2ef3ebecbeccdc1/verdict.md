## Verify: FAIL

**Head** `81a988a` · **Skill** `verify-dms` @ `81a988a` (not trusted yet) · **Verifier** fresh H6 verifier of AntelopeJS/dms#529 (a separate thread; it did not write the change), re-verifying the fix round

### One-way doors
None: the diff adds a bin, a skill and checks; it removes no route, export, config key, env var or stored field
- Not a door: `packages/dms/bin/dms-control.mjs` matches the contract path rules. a new bin, an addition; nothing existing is removed or changed
- Not a door: `packages/dms/package.json` matches the contract path rules. adds the bin field and bin/ to files; no existing field changes
- Not a door: `packages/dms/package.json` matches the publish path rules. same package name, same registry; only bin/ is added to the published files
- Not a door: `.github/workflows/release.yml` matches the publish path rules. the validate step imports the same rule from checks/release-range.mjs; diffed against the old inline code, 0 disagreements on 500k random inputs
- Not a door: `checks/release-range.mjs` matches the publish path rules. the rule moved verbatim out of release.yml

### Touched features
- none
- smoke: onboard → login → invite a member → reload

### Why it fails
- formal check formal-release-range: violated range: the rule accepts exactly the canonical >=0.M.p <0.(M+1).0 range (strict, F4 recorded), prerelease and build metadata: the rule agrees with semver.satisfies (strict, F1 F2 F3 recorded)

### Journeys
| Feature | Entry point | Result | Evidence |
|---|---|---|---|
| smoke | `smoke`: POST /api/onboarding/register, then the sign-in form and Settings > Members > Invite members | pass: a fresh platform onboards, its admin signs in, invites a member, and the invitation survives a reload | [smoke/smoke](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-529/81a988ab8e5d394dc9522f3fa2ef3ebecbeccdc1/smoke/smoke) |

### Formal checks
- `formal-release-range` (covers the diff, gates the verdict): violated: range: the rule accepts exactly the canonical >=0.M.p <0.(M+1).0 range (strict, F4 recorded), prerelease and build metadata: the rule agrees with semver.satisfies (strict, F1 F2 F3 recorded). [evidence](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-529/81a988ab8e5d394dc9522f3fa2ef3ebecbeccdc1/formal/formal-release-range)

### Docs
- No touched feature links a page.

### Not verified
- Exhaustive TLA+ configurations not rerun; no formal file changed this round.
- Seeded breaks: only block-preview rerun against an unpatched control this round (caught); 4 of 11 were rerun at ff0240d3; no break or journey changed since.

### Attention
- This verdict fails only on formal-release-range recorded findings F1-F4: checks/release-range.mjs and release.yml are touched by a verbatim move. Whether a pure move of a rule with recorded findings should FAIL is for Antony.

Evidence: `verify-evidence` branch, [`pr-529/81a988ab8e5d394dc9522f3fa2ef3ebecbeccdc1/`](https://github.com/AntelopeJS/dms/tree/verify-evidence/pr-529/81a988ab8e5d394dc9522f3fa2ef3ebecbeccdc1/)
