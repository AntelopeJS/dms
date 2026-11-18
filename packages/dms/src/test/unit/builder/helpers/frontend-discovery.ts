import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ts } from "ts-morph";
import { z } from "zod";

const manifestSchema = z.object({ dmsFrontend: z.string().optional() });

/** What `@antelopejs/dms-frontend` reads of a module's registration. */
const registrationSchema = z.object({
  name: z.string(),
  sourcePath: z.string(),
  renderer: z.object({ name: z.string(), version: z.string() }),
  priority: z.number().optional(),
});

export type DiscoveredFrontendModule = z.infer<typeof registrationSchema>;

/** What the loader does with the declared file: load it alone and call it, as `registrationOf` does. */
const LOAD_AND_CALL =
  "const { frontendModule } = require(process.argv[1]);" +
  "process.stdout.write(JSON.stringify(frontendModule({}, { dev: false })));";

function compileSources(projectRoot: string): void {
  const sources = path.join(projectRoot, "src");
  const output = path.join(projectRoot, "dist");
  fs.mkdirSync(output, { recursive: true });
  for (const name of fs.readdirSync(sources)) {
    if (!name.endsWith(".ts")) {
      continue;
    }
    const { outputText } = ts.transpileModule(
      fs.readFileSync(path.join(sources, name), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    );
    fs.writeFileSync(
      path.join(output, name.replace(/\.ts$/, ".js")),
      outputText,
    );
  }
}

/**
 * Finds a project's frontend module as `readProjectFrontendModules` of
 * `@antelopejs/dms-frontend` does: the module's `package.json` names a file in
 * its `dmsFrontend` field, which exports the pure `frontendModule(config,
 * context)`. The project's TypeScript is compiled to `dist/` first, as its
 * build does, and the declared file runs in a process of its own, with no
 * backend. Undefined when the module declares none, which is when the loader
 * leaves its pages out.
 */
export function discoverFrontendModule(
  projectRoot: string,
): DiscoveredFrontendModule | undefined {
  const { dmsFrontend } = manifestSchema.parse(
    JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")),
  );
  if (dmsFrontend === undefined) {
    return undefined;
  }
  compileSources(projectRoot);
  const output = execFileSync(
    process.execPath,
    ["-e", LOAD_AND_CALL, path.join(projectRoot, dmsFrontend)],
    { encoding: "utf8" },
  );
  return registrationSchema.parse(JSON.parse(output));
}
