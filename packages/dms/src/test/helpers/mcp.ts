import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const MODULE_ROOT = join(__dirname, "../../..");
const BRIDGE_CONFIG = "node_modules/.cache/dms/mcp.json";
const PERMISSION_BITS = 0o777;

const BridgeConfigSchema = z.object({ url: z.string(), token: z.string() });

export function readBridgeConfig(
  projectPath: string = MODULE_ROOT,
): z.infer<typeof BridgeConfigSchema> {
  return BridgeConfigSchema.parse(
    JSON.parse(readFileSync(join(projectPath, BRIDGE_CONFIG), "utf8")),
  );
}

export function fileMode(path: string): number {
  return statSync(path).mode & PERMISSION_BITS;
}

/**
 * The access entries `icacls` lists for a file on Windows, lower-cased, with
 * `(I)` marking each entry inherited from the folder.
 */
export function windowsAccessEntries(path: string): string[] {
  const listing = execFileSync("icacls", [path], { encoding: "utf8" });
  const [entries = ""] = listing.split(/\r?\n\s*\r?\n/);
  return entries
    .slice(path.length)
    .split(/\r?\n/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
}

export function readOptionalText(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}
