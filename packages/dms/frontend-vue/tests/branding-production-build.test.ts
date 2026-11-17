/**
 * The Branding editor is development only: a production build of the DMS
 * frontend module reaches none of it, neither its header icon nor its editor,
 * while a development build does.
 */
import { resolve } from "node:path";
import { build, type Rollup } from "vite";
import { afterEach, expect, it, vi } from "vitest";

const ROOT = resolve(__dirname, "..");
const ENTRY = resolve(ROOT, "dms.frontend.ts");
const BUILD_TIMEOUT_MS = 60_000;
const BRANDING = /entries\/branding\/|build\/branding\/|BrandingEditor/;

/**
 * The module entry alone, every import left external: what stays is what the
 * build keeps of `dms.frontend.ts` once `import.meta.env.DEV` is replaced.
 */
async function entryCode(nodeEnv: "production" | "development") {
  vi.stubEnv("NODE_ENV", nodeEnv);
  const result = await build({
    configFile: false,
    root: ROOT,
    logLevel: "silent",
    mode: nodeEnv,
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        input: ENTRY,
        preserveEntrySignatures: "strict",
        external: (_id, importer) => importer !== undefined,
      },
    },
  });
  const outputs = Array.isArray(result)
    ? result
    : "output" in result
      ? [result]
      : [];
  const entry = outputs
    .flatMap(({ output }) => output)
    .find(
      (item): item is Rollup.OutputChunk =>
        item.type === "chunk" && item.isEntry,
    );
  return {
    code: entry?.code ?? "",
    imports: [...(entry?.imports ?? []), ...(entry?.dynamicImports ?? [])],
  };
}

afterEach(() => vi.unstubAllEnvs());

it(
  "leaves the branding editor out of a production build",
  async () => {
    const production = await entryCode("production");
    expect(production.code).toContain("componentPrefix");
    expect(production.imports.filter((id) => BRANDING.test(id))).toEqual([]);
    expect(production.code).not.toMatch(BRANDING);

    const development = await entryCode("development");
    expect(development.code).toMatch(BRANDING);
  },
  BUILD_TIMEOUT_MS,
);
