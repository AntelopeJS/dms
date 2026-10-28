import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { z } from "zod";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(frontend, "../../..");
const require = createRequire(import.meta.url);
const { createServer } = require("vite");
const baseRef = process.argv[2] ?? "HEAD^";
assert(process.argv[3], "Pass the baseline worktree as the third argument");
const baseRoot = resolve(process.argv[3]);
const baseFrontend = join(baseRoot, "packages/dms/frontend-vue");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: baseRoot,
    encoding: "utf8",
  }),
  execFileSync("git", ["rev-parse", baseRef], { cwd: root, encoding: "utf8" }),
  "The baseline files belong to the requested revision",
);
const base = execFileSync(
  "git",
  ["show", `${baseRef}:packages/dms/frontend-vue/dms.frontend.ts`],
  { cwd: root, encoding: "utf8" },
);
const renamed = new Map(
  execFileSync(
    "git",
    ["diff", "--name-status", "--find-renames=100%", baseRef, "HEAD"],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("R100\t"))
    .map((line) => {
      const [, before, after] = line.split("\t");
      return [
        relative(frontend, resolve(root, after)),
        relative(frontend, resolve(root, before)),
      ];
    }),
);
const current = readFileSync(join(frontend, "dms.frontend.ts"), "utf8");
const baseId = join(baseFrontend, "__registry-proof-base.ts");
const currentId = join(frontend, "__registry-proof-current.ts");
const server = await createServer({
  root: frontend,
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null },
  plugins: [
    {
      name: "registration-observer",
      enforce: "pre",
      resolveId(id, importer) {
        if ([baseId, currentId].includes(id)) return id;
        if (id === "#dms/frontend-module") return "\0registry-sdk";
        if (id.endsWith(".vue")) {
          const file = id.startsWith("/layers/")
            ? resolve(frontend, "." + id)
            : resolve(dirname(importer), id);
          return (
            "\0registry-component:" +
            relative(
              file.startsWith(baseFrontend + "/") ? baseFrontend : frontend,
              file,
            )
          );
        }
        if (/\/app\/(?:plugins|middleware)\//.test(id) || id.endsWith(".css"))
          return "\0registry-inert:" + id;
      },
      load(id) {
        if ([baseId, currentId].includes(id))
          return (
            (id === baseId ? base : current) +
            (id === currentId && process.env.REGISTRATION_PROOF_DROP_COMPONENT
              ? "\ndelete components[Object.keys(components)[0]];"
              : "") +
            (id === currentId && process.env.REGISTRATION_PROOF_REVERSE_ORDER
              ? "\nconst originalSortedEntries = sortedEntries; sortedEntries = loaders => originalSortedEntries(loaders).reverse();"
              : "") +
            "\nexport const registryMaps = { components, customPages, dynamicPages, layouts, errorPages };"
          );
        if (id === "\0registry-sdk")
          return "export const useDmsRuntimeConfig = () => ({ public: { dms: {} } });";
        if (id.startsWith("\0registry-component:")) {
          const target = id.slice("\0registry-component:".length);
          return `export default { target: ${JSON.stringify(renamed.get(target) ?? target)} };`;
        }
        if (id.startsWith("\0registry-inert:"))
          return `function plugin() {} plugin.registryId = ${JSON.stringify(id)}; export default plugin;`;
      },
    },
  ],
});
async function registration(module) {
  const events = [];
  const sdk = new Proxy(
    { options: { public: {} } },
    {
      get(target, name) {
        if (name in target) return target[name];
        return (...args) =>
          events.push([
            name,
            ...args.map((value) =>
              z.function().safeParse(value).success
                ? {
                    function: value.name,
                    arity: value.length,
                    importedModule: value.registryId,
                  }
                : value?.__asyncLoader
                  ? { kind: "async-component" }
                  : value,
            ),
          ]);
      },
    },
  );
  module.default.setup(sdk);
  const maps = {};
  for (const [name, entries] of Object.entries(module.registryMaps)) {
    maps[name] = [];
    for (const [key, load] of Object.entries(entries).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const loaded = await load();
      maps[name].push([key, loaded.default.target]);
    }
  }
  return { events, maps };
}
try {
  const before = await registration(await server.ssrLoadModule(baseId));
  const after = await registration(await server.ssrLoadModule(currentId));
  assert.deepEqual(
    after.maps,
    before.maps,
    "Vite-expanded registration keys and loader targets",
  );
  assert.deepEqual(
    after.events,
    before.events,
    "complete setup registration names, order, aliases and options",
  );
  assert(
    !after.maps.components.some(
      ([key]) =>
        key.endsWith("/table/TableBody.vue") ||
        key.endsWith("/ImagePresentation.vue"),
    ),
  );
  if (process.env.REGISTRATION_PROOF_OUTPUT)
    writeFileSync(
      process.env.REGISTRATION_PROOF_OUTPUT,
      JSON.stringify(
        { before, after, identicalFileRenames: [...renamed] },
        null,
        2,
      ),
    );
  console.log(
    `PASS Vite registration parity against ${baseRef} (${after.maps.components.length} component loaders; ${after.events.length} registration events)`,
  );
} finally {
  await server.close();
}
