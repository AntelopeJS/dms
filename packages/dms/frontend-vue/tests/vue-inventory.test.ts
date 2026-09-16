import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const EXPECTED_VUE_FILES = 143;

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function ownership(path: string): string | undefined {
  const owners: Array<[RegExp, string]> = [
    [/\/app\/(?:components|build\/components)\/.*\.vue$/, "component"],
    [/\/app\/custom-pages\/.*\.vue$/, "custom-page"],
    [/\/app\/pages\/.*\.vue$/, "dynamic-page"],
    [/\/app\/custom-layouts\/.*\.vue$/, "layout"],
    [/\/app\/error\.vue$/, "inertia-error-page"],
    [/\/app\/emails\/.*\.vue$/, "server-email-template"],
  ];
  return owners.find(([pattern]) => pattern.test(path))?.[1];
}

describe("Vue source inventory", () => {
  it("contains only Vue frontend source files", () => {
    const files = walk(join(process.cwd(), "layers"));
    expect(files.filter((path) => path.includes("/server/"))).toEqual([]);
  });

  it("assigns every Vue file an explicit runtime owner", () => {
    const files = walk(join(process.cwd(), "layers"))
      .filter((path) => path.endsWith(".vue"))
      .map((path) => relative(process.cwd(), path));
    expect(files).toHaveLength(EXPECTED_VUE_FILES);
    expect(files.filter((path) => !ownership(path))).toEqual([]);
    expect(
      files.filter((path) => ownership(path) === "server-email-template"),
    ).toHaveLength(8);
  });

  it("exposes entries for the frontend adapter", () => {
    const root = process.cwd();
    const frontendModule = readFileSync(join(root, "dms.frontend.ts"), "utf8");

    expect(frontendModule).toContain(
      'import "./layers/dms-layout/app/assets/css/main.css"',
    );
    expect(frontendModule).toContain('"./layers/**/app/custom-pages/**/*.vue"');
    expect(frontendModule).toContain(
      '"./layers/**/app/custom-layouts/**/*.vue"',
    );
    expect(frontendModule).toContain('"./layers/**/app/error.vue"');
    expect(frontendModule).toContain(
      "sdk.registerComponent(`Dms${pascalCase(name)}`, component)",
    );
    expect(frontendModule).toContain('.replace(/\\/index$/, "")');
    expect(frontendModule).toContain(
      "sdk.registerErrorPage(lazyComponent(loader), loader)",
    );

    const entries = walk(join(root, "layers")).filter(
      (path) =>
        path.includes("/app/custom-pages/") || path.endsWith("/app/error.vue"),
    );
    expect(entries).not.toHaveLength(0);
    expect(
      entries.every((path) => path.endsWith(".vue") && statSync(path).isFile()),
    ).toBe(true);
    expect(
      statSync(
        join(root, "layers/dms-layout/app/custom-layouts/DefaultLayout.vue"),
      ).isFile(),
    ).toBe(true);
  });

  it("registers lazy components and reports deterministic name collisions", () => {
    const frontendModule = readFileSync(
      join(process.cwd(), "dms.frontend.ts"),
      "utf8",
    );
    expect(frontendModule).toContain("defineAsyncComponent");
    expect(frontendModule).toContain("sortedEntries(components)");
    expect(frontendModule).toContain(
      "Duplicate component name ${name}: ${previousPath}, ${path}",
    );
    expect(frontendModule).not.toMatch(
      /components\|build\/components}[\s\S]*eager: true/,
    );
  });
});
