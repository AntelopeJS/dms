import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

/**
 * `rethinkdb-ts` is a dev dependency that the RethinkDB test helper requires by name, and no file
 * imports it because its declarations do not compile with this module's `lib`. `icacls` is the Windows system tool that restricts a credential file to its owner.
 */
export default antelopeKnipConfig({
  ignoreDependencies: ["@types/mocha", "rethinkdb-ts"],
  ignoreBinaries: ["icacls"],
});
