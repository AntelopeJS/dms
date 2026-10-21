/**
 * The frontend loader only runs the plugins `dms.frontend.ts` registers, at
 * start or deferred (`deferred-plugins.ts`): a file dropped in a layer's
 * `app/plugins` folder is not picked up by convention, and silently never
 * runs.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MANIFESTS = ["dms.frontend.ts", "deferred-plugins.ts"];

function layerPlugins(): string[] {
  const layersDir = join(ROOT, "layers");
  return readdirSync(layersDir).flatMap((layer) => {
    const pluginsDir = join(layersDir, layer, "app", "plugins");
    try {
      return readdirSync(pluginsDir)
        .filter((file) => file.endsWith(".ts"))
        .map(
          (file) =>
            `./layers/${layer}/app/plugins/${file.replace(/\.ts$/, "")}`,
        );
    } catch {
      return [];
    }
  });
}

describe("the layers' plugins", () => {
  const manifests = MANIFESTS.map((file) =>
    readFileSync(join(ROOT, file), "utf8"),
  ).join("\n");

  it.each(layerPlugins())("%s is registered", (plugin) => {
    expect(manifests).toContain(`"${plugin}"`);
  });
});
