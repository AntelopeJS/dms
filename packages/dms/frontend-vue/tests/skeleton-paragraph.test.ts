import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PARAGRAPH = /<p\b[^>]*>(.*?)<\/p>/gs;
const SKELETON = /<USkeleton\b/;

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("skeleton placement", () => {
  // The skeleton renders a <div>. The browser's parser closes an open <p>
  // before a <div>, so the server markup no longer matches the client tree
  // and hydration reports a mismatch.
  it("keeps skeletons out of paragraphs", () => {
    const offenders = walk(join(process.cwd(), "layers"))
      .filter((path) => path.endsWith(".vue"))
      .flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(PARAGRAPH)]
          .filter(([, content]) => SKELETON.test(content ?? ""))
          .map(() => relative(process.cwd(), path)),
      );

    expect(offenders).toEqual([]);
  });
});
