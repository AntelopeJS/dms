import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ICON_TAG = /<(?:UIcon|Icon)\b[^>]*?>/gs;
const STATIC_ARIA_HIDDEN = /(?<![:\w-])aria-hidden=/;

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("icon aria-hidden bindings", () => {
  // The icon hands its attributes to Iconify's component, whose `ariaHidden`
  // prop is a Boolean: a static attribute reaches it as the string "true".
  it("binds aria-hidden on icons as a boolean", () => {
    const offenders = walk(join(process.cwd(), "layers"))
      .filter((path) => path.endsWith(".vue"))
      .flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(ICON_TAG)]
          .filter(([tag]) => STATIC_ARIA_HIDDEN.test(tag))
          .map(() => relative(process.cwd(), path)),
      );

    expect(offenders).toEqual([]);
  });
});
