import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

/**
 * `rethinkdb-ts` is a dev dependency that the RethinkDB test helper requires by name, and no file
 * imports it because its declarations do not compile with this module's `lib`. `icacls` is the Windows system tool that restricts a credential file to its owner.
 * `@playwright/test` serves the `./e2e` export, and this package has no Playwright tests, so its plugin, which would
 * take every `*.test.ts` for one, is off.
 */
export default Object.assign(
  antelopeKnipConfig({
    ignoreDependencies: ["@types/mocha", "rethinkdb-ts"],
    ignoreBinaries: ["icacls"],
  }),
  { playwright: false },
);
