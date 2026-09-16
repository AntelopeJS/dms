import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const LAYERS_DIR = fileURLToPath(new URL("../layers", import.meta.url));
const SOURCE_EXTENSIONS = [".vue", ".ts"];
const ASYNC_DATA_KEY =
  /useDms(?:Lazy)?AsyncData\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;

function collectSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(path);
    return SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
      ? [path]
      : [];
  });
}

// String constants are resolved so a key spelled `${PREFIX}${id}` is still
// comparable; what is left interpolated marks the end of the static part.
function staticPrefix(key: string, source: string): string {
  const resolved = key.replace(/\$\{(\w+)\}/g, (interpolation, name) => {
    const declaration = source.match(
      new RegExp(`\\bconst ${name} = ("[^"]*"|'[^']*'|\`[^\`$]*\`)`),
    );
    return declaration ? declaration[1]!.slice(1, -1) : interpolation;
  });
  return resolved.split("${")[0] ?? "";
}

function keyOwners(): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const path of collectSources(LAYERS_DIR)) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(ASYNC_DATA_KEY)) {
      const key = match[1] ?? match[2] ?? match[3] ?? "";
      const prefix = staticPrefix(key, source);
      if (!prefix) continue;
      const files = owners.get(prefix) ?? new Set<string>();
      files.add(relative(LAYERS_DIR, path));
      owners.set(prefix, files);
    }
  }
  return owners;
}

describe("useAsyncData key ownership", () => {
  // Nuxt keys async data globally and keeps only the first handler registered
  // for a key, so a key claimed from two files means one of them silently runs
  // the other's fetch. Sharing is fine — through a composable, from one file.
  it("declares every key prefix in a single file", () => {
    const shared = [...keyOwners()]
      .filter(([, files]) => files.size > 1)
      .map(([prefix, files]) => `${prefix} → ${[...files].join(", ")}`);

    expect(shared).toEqual([]);
  });

  it("routes the page layout fetch through usePageLayout", () => {
    const page = readFileSync(
      join(LAYERS_DIR, "dms-layout/app/pages/[...slug].vue"),
      "utf8",
    );
    const owner = readFileSync(
      join(LAYERS_DIR, "dms-layout/app/composables/page/usePageLayout.ts"),
      "utf8",
    );
    expect(page).toContain("await usePageLayout()");
    expect(page).not.toContain("useDmsAsyncData(");
    expect(owner).toContain("siteLayout.pageLayouts.value");
  });
});
