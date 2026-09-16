import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  // Mocha's globals are ambient: nothing imports the types, so Knip cannot see
  // that dropping them would break the test build. The chart runtime gate loads
  // ApexCharts from the separately installed frontend package on purpose.
  ignoreDependencies: ["@types/mocha", "apexcharts"],
  // Browser gates use the runner-provided CLI rather than an npm dependency.
  ignoreBinaries: ["agent-browser"],
});
