import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CMD_EXPANDED_IN_QUOTES = /["%!\p{Cc}]/u;
const TRAILING_BACKSLASHES = /(\\+)$/;

/** A package-manager CLI that dms runs in a project or a module. */
export type PackageManager = "npm" | "pnpm";

/** Where a package-manager run happens and how long it may take. */
export interface PackageManagerOptions {
  cwd: string;
  timeout: number;
  signal?: AbortSignal;
  maxBuffer?: number;
}

function quoteForCmd(argument: string): string {
  if (CMD_EXPANDED_IN_QUOTES.test(argument)) {
    throw new Error(
      `cmd.exe cannot pass ${JSON.stringify(argument)} through unchanged`,
    );
  }
  return `"${argument.replace(TRAILING_BACKSLASHES, "$1$1")}"`;
}

/**
 * The cmd.exe command line that runs `manager` with `args` on Windows. Each
 * argument is double-quoted, so cmd.exe and the `.cmd` shim that receives it
 * through `%*` read `& | < > ^ ( )` as text. Trailing backslashes are doubled
 * so the closing quote still ends the argument. An argument holding `"`, `%`,
 * `!` or a control character is refused, because cmd.exe reads those even
 * inside quotes.
 *
 * @throws Error when an argument cannot pass through cmd.exe unchanged.
 */
export function windowsCommandLine(
  manager: PackageManager,
  args: readonly string[],
): string {
  return [manager, ...args.map(quoteForCmd)].join(" ");
}

/**
 * Runs `manager` with `args` and resolves its output. On Windows the CLI is a
 * `.cmd` shim, which only cmd.exe can run, so the command goes through
 * cmd.exe as {@link windowsCommandLine} builds it, whatever `%ComSpec%`
 * names, and a refused argument rejects before anything runs. Elsewhere the
 * CLI runs with no shell.
 */
export async function runPackageManager(
  manager: PackageManager,
  args: readonly string[],
  options: PackageManagerOptions,
): Promise<{ stdout: string; stderr: string }> {
  return platform() === "win32"
    ? execFileAsync(windowsCommandLine(manager, args), {
        ...options,
        shell: "cmd.exe",
      })
    : execFileAsync(manager, args, options);
}
