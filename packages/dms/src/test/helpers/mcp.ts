import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const MODULE_ROOT = join(__dirname, "../../..");
const BRIDGE_CONFIG = "node_modules/.cache/dms/mcp.json";
const PERMISSION_BITS = 0o777;

const BridgeConfigSchema = z.object({ url: z.string(), token: z.string() });

/** The route and credential a start of the DMS published for its bridge, under `projectPath`. */
export function readBridgeConfig(
  projectPath: string = MODULE_ROOT,
): z.infer<typeof BridgeConfigSchema> {
  return BridgeConfigSchema.parse(
    JSON.parse(readFileSync(join(projectPath, BRIDGE_CONFIG), "utf8")),
  );
}

/** The permission bits of a file, e.g. `0o600`. */
export function fileMode(path: string): number {
  return statSync(path).mode & PERMISSION_BITS;
}

/** A file's text, or `undefined` when there is none. */
export function readOptionalText(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}
