import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BACKEND_SOURCES = [
  join(ROOT, "../src"),
  join(ROOT, "../../interface-dms/src"),
];
const BUILD_COMPONENT = /\/app\/build\/components\/.*\.vue$/;
const BACKEND_GLOB =
  /const backendPageComponents = import\.meta\.glob<VueModule>\(\[([\s\S]*?)\]\);/;
const COMPONENT_NAME = /["'`](Dms[A-Z][A-Za-z0-9]*|dms-[a-z0-9-]+)["'`]/g;

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function pascalCase(name: string): string {
  return name
    .split(/[./_-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join("");
}

function componentName(path: string): string {
  return `Dms${pascalCase(basename(path, ".vue"))}`;
}

function backendComponentNames(): Set<string> {
  const names = BACKEND_SOURCES.flatMap(walk)
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
    .flatMap((path) => [...readFileSync(path, "utf8").matchAll(COMPONENT_NAME)])
    .map(([, name]) => (name!.startsWith("dms-") ? pascalCase(name!) : name!));
  return new Set(names);
}

function kebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function usesWithoutImport(source: string, name: string): boolean {
  const used = new RegExp(`<(?:${name}|${kebabCase(name)})[\\s/>]`).test(
    source,
  );
  return used && !new RegExp(`import\\s+${name}\\b`).test(source);
}

function registeredBuildComponents(): string[] {
  const source = readFileSync(join(ROOT, "dms.frontend.ts"), "utf8");
  const list = source.match(BACKEND_GLOB)?.[1] ?? "";
  return [...list.matchAll(/"\.\/(layers\/[^"]+\.vue)"/g)].map(
    ([, path]) => path!,
  );
}

describe("build/ component registration", () => {
  const buildComponents = walk(join(ROOT, "layers"))
    .map((path) => relative(ROOT, path).replaceAll("\\", "/"))
    .filter((path) => BUILD_COMPONENT.test(`/${path}`));

  it("registers every build/ component a backend page tree names", () => {
    const named = backendComponentNames();
    const expected = buildComponents
      .filter((path) => named.has(componentName(path)))
      .sort();
    expect(registeredBuildComponents().sort()).toEqual(expected);
  });

  it("lists only existing build/ components", () => {
    for (const path of registeredBuildComponents()) {
      expect(buildComponents).toContain(path);
    }
  });

  it("imports every unregistered build/ component by path", () => {
    const registered = new Set(registeredBuildComponents());
    const privateNames = buildComponents
      .filter((path) => !registered.has(path))
      .map(componentName);
    const offenders = walk(join(ROOT, "layers"))
      .filter((path) => path.endsWith(".vue"))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return privateNames
          .filter((name) => usesWithoutImport(source, name))
          .map((name) => `${relative(ROOT, path)}: ${name}`);
      });
    expect(offenders).toEqual([]);
  });
});
