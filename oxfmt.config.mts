import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

/** What both packages format the same way; each adds its own exclusions. */
export default antelopeFmtPreset({
  ignorePatterns: [
    // Markdown was never formatted by a tool here, so bringing 70 documents
    // into a formatter for the first time is a change of its own.
    "**/*.md",
  ],
  // Reordering package.json rewrites a hundred lines of a file whose grouping
  // is deliberate, for no gain a reader would notice.
  sortPackageJson: false,
});
