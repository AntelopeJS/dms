import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModuleInfo, ListModules } from "@antelopejs/interface-core/modules";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { z } from "zod";
import { defineTool, textResult } from "../tool";

const execFileAsync = promisify(execFile);

const TSC_COMMAND = "pnpm";
const TSC_ARGS = ["exec", "tsc", "--noEmit", "-p", "tsconfig.json"];
const TSCONFIG_FILE_NAME = "tsconfig.json";
const TIMEOUT_MS = 60_000;
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const MAX_SUMMARY_LINES = 30;
const ERROR_LINE = /error TS\d+/;

const ExecFailureSchema = z.object({
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});
const LocalSourceSchema = z.object({
  type: z.enum(["local", "local-folder"]),
  path: z.string().min(1),
});

/** The directories of every loaded module: where its code lives, and the folder a local source watches. */
async function moduleRoots(): Promise<string[]> {
  const ids = await ListModules();
  const infos = await Promise.all(
    ids.map((id) => GetModuleInfo(id).catch(() => undefined)),
  );
  return infos.flatMap((info) => {
    if (info === undefined) return [];
    const source = LocalSourceSchema.safeParse(info.source);
    return source.success
      ? [info.localPath, source.data.path]
      : [info.localPath];
  });
}

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

/** The root to check: the project by default, else a known root named by its basename or holding the given path. */
function resolveTarget(
  target: string | undefined,
  projectPath: string,
  roots: string[],
): string | undefined {
  if (target === undefined || target.length === 0) return projectPath;
  const byName = roots.find((root) => path.basename(root) === target);
  if (byName !== undefined) return byName;
  const file = path.resolve(target);
  return roots
    .filter((root) => isWithin(root, file))
    .sort((a, b) => b.length - a.length)[0];
}

function errorSummary(output: string): string | undefined {
  const lines = output
    .split(/\r?\n/)
    .filter((line) => ERROR_LINE.test(line))
    .map((line) => line.trim());
  if (lines.length === 0) return undefined;
  const omitted = lines.length - MAX_SUMMARY_LINES;
  const tail =
    omitted > 0
      ? `\n…and ${omitted} more error${omitted === 1 ? "" : "s"}.`
      : "";
  return `Type errors found:\n${lines.slice(0, MAX_SUMMARY_LINES).join("\n")}${tail}`;
}

async function runTypecheck(root: string): Promise<string> {
  try {
    await access(path.join(root, TSCONFIG_FILE_NAME));
  } catch {
    return "No tsconfig.json in the target module — skipped type check.";
  }
  try {
    await execFileAsync(TSC_COMMAND, TSC_ARGS, {
      cwd: root,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
      encoding: "utf8",
    });
    return "No type errors.";
  } catch (error) {
    const failure = ExecFailureSchema.safeParse(error).data ?? {};
    const summary = errorSummary(
      `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`,
    );
    if (summary !== undefined) return summary;
    Logging.Warn(`[DMS] tsc did not run cleanly in ${root}`, error);
    return "Could not run tsc (compiler unavailable or misconfigured) — skipped type check.";
  }
}

/** typecheck: `tsc --noEmit` on the project or one of its loaded modules. */
export const typecheckTool = defineTool({
  name: "typecheck",
  title: "Typecheck",
  description:
    "Runs `tsc --noEmit` on a loaded module to catch type errors BEFORE the host hot-reload rebuilds it. Optional `target` selects a module by name (its directory basename) or by a path inside it; it must be one of the known module/project roots. Defaults to the host project. Run this after editing a module's source and fix any errors before considering the page done.",
  effect: "read",
  input: z.object({ target: z.string().optional() }),
  async run({ target }) {
    const { projectPath } = await GetRuntimeInfo();
    const roots = [projectPath, ...(await moduleRoots())].map((root) =>
      path.resolve(root),
    );
    const root = resolveTarget(target, path.resolve(projectPath), roots);
    if (root === undefined) {
      const known = [...new Set(roots.map((r) => path.basename(r)))];
      return textResult(
        `Unknown target: ${target} is not a known module/project root. Known targets: ${known.join(", ")}`,
      );
    }
    return textResult(await runTypecheck(root));
  },
});
