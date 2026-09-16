import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { getFrontendBootstrapSecret } from "./frontend-bootstrap";

const HANDSHAKE_RELATIVE_PATH = join(".antelope", "dms-dev.json");
const TEMP_FILE_SUFFIX = ".tmp";
const OWNER_ONLY_MODE = 0o600;
const JSON_INDENT = 2;

/**
 * Credential handed to a build tool running on this machine.
 *
 * The owning `pid` is what lets a reader tell a live instance from the file a
 * stopped one left behind, mirroring how the antelope dev registry is
 * validated. A sibling file rather than a key in `dev.json` because the core
 * rewrites that file wholesale on every registration.
 *
 * Nothing deletes it on shutdown, for the same reason the core leaves
 * `dev.json` in place: the file outliving its writer is precisely the case the
 * `pid` check already covers, whereas a departing instance removing it cannot
 * be made safe. Two backends for one project overlap routinely — a restart
 * whose old process outlives the new one's boot — and no filesystem gives us
 * an atomic "delete only if still mine", so the older process would eventually
 * delete a live replacement's credential and leave the build tool unable to
 * authenticate against a backend running perfectly well.
 */
interface DevHandshake {
  pid: number;
  bootstrapSecret: string;
  updatedAt: string;
}

async function handshakePath(): Promise<string | undefined> {
  const { dev, projectPath } = await GetRuntimeInfo();
  if (!dev || !projectPath) return undefined;
  return join(projectPath, HANDSHAKE_RELATIVE_PATH);
}

/**
 * Publish this instance's bootstrap credential for a same-machine build tool,
 * so development needs no configured secret.
 */
export async function publishDevBootstrapCredential(): Promise<void> {
  const filePath = await handshakePath();
  const bootstrapSecret = getFrontendBootstrapSecret();
  if (!filePath || !bootstrapSecret) return;

  const handshake: DevHandshake = {
    pid: process.pid,
    bootstrapSecret,
    updatedAt: new Date().toISOString(),
  };
  const tempPath = `${filePath}.${process.pid}${TEMP_FILE_SUFFIX}`;

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(
      tempPath,
      `${JSON.stringify(handshake, null, JSON_INDENT)}\n`,
      { mode: OWNER_ONLY_MODE },
    );
    await rename(tempPath, filePath);
  } catch (error) {
    Logging.Warn(
      `[DMS] Could not publish the development bootstrap credential to ${filePath}: ` +
        `${String(error)}. ` +
        "The frontend build tool will need DMS_BOOTSTRAP_SECRET set by hand.",
    );
  }
}
