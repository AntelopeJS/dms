import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

/**
 * `rethinkdb-ts` is an optional peer that the database check requires by name when it checks a
 * RethinkDB connection, and no file imports it because its declarations do not compile with this
 * module's `lib`.
 */
export default antelopeKnipConfig({
  ignoreDependencies: ["@types/mocha", "rethinkdb-ts"],
});
