import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect } from "chai";

const DIST_ROOT = resolve(__dirname, "..", "..");
const SELF_PACKAGE_NAME = "@antelopejs/dms";
const SELF_IMPORT_PATTERN = new RegExp(
  `(?:require\\(|import\\()\\s*["']${SELF_PACKAGE_NAME}`,
);

function collectJsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectJsFiles(fullPath);
    }
    return entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

describe("[unit] dist self-imports", () => {
  it("contains no runtime imports of the package's own name", () => {
    const offenders = collectJsFiles(DIST_ROOT).filter((file) =>
      SELF_IMPORT_PATTERN.test(readFileSync(file, "utf8")),
    );
    expect(offenders).to.deep.equal([]);
  });
});
