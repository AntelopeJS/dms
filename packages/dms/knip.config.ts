import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  // Mocha's globals are ambient: nothing imports the types, so Knip cannot see
  // that dropping them would break the test build.
  ignoreDependencies: ["@types/mocha"],
});
