import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const execFileAsync = promisify(execFile);

const NPM_PACK_TIMEOUT_MS = 60_000;
const TAR_BLOCK_SIZE = 512;
const TAR_NAME_LENGTH = 100;
const TAR_SIZE_OFFSET = 124;
const TAR_SIZE_LENGTH = 12;
const TAR_TYPE_OFFSET = 156;
const TAR_PREFIX_OFFSET = 345;
const TAR_PREFIX_LENGTH = 155;
const OCTAL = 8;
/** Every file of an npm tarball sits under this folder. */
const PACKAGE_ROOT = "package/";
const TEMP_PREFIX = "dms-store-pack-";

interface TarHeader {
  name: string;
  size: number;
  type: string;
}

function readString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf-8");
}

function readHeader(block: Buffer): TarHeader | undefined {
  const name = readString(block, 0, TAR_NAME_LENGTH);
  if (!name) return undefined;
  const prefix = readString(block, TAR_PREFIX_OFFSET, TAR_PREFIX_LENGTH);
  return {
    name: prefix ? `${prefix}/${name}` : name,
    size:
      Number.parseInt(
        readString(block, TAR_SIZE_OFFSET, TAR_SIZE_LENGTH).trim(),
        OCTAL,
      ) || 0,
    type: readString(block, TAR_TYPE_OFFSET, 1),
  };
}

/**
 * One file of an uncompressed tar archive, by its path inside the npm
 * `package/` folder. Only plain ustar headers are read: npm writes no other
 * kind for the short paths the store asks for.
 */
export function readTarFile(
  archive: Buffer,
  filePath: string,
): Buffer | undefined {
  const wanted = `${PACKAGE_ROOT}${filePath}`;
  let offset = 0;
  while (offset + TAR_BLOCK_SIZE <= archive.length) {
    const header = readHeader(
      archive.subarray(offset, offset + TAR_BLOCK_SIZE),
    );
    if (!header) return undefined;
    const start = offset + TAR_BLOCK_SIZE;
    if (header.name === wanted) {
      return archive.subarray(start, start + header.size);
    }
    offset = start + Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }
  return undefined;
}

async function packRelease(
  spec: string,
  projectPath: string,
  destination: string,
): Promise<Buffer> {
  await execFileAsync(
    "npm",
    ["pack", spec, "--pack-destination", destination, "--silent"],
    { cwd: projectPath, timeout: NPM_PACK_TIMEOUT_MS },
  );
  const [file] = await readdir(destination);
  if (!file) throw new Error(`npm pack ${spec} wrote no archive`);
  return gunzipSync(await readFile(path.join(destination, file)));
}

/**
 * Reads files from the published archive of `packageName@version`, fetched
 * with the project's npm configuration. A file the archive lacks is left out.
 */
export async function readPublishedFiles(
  packageName: string,
  version: string,
  projectPath: string,
  filePaths: readonly string[],
): Promise<Map<string, string>> {
  const destination = await mkdtemp(path.join(tmpdir(), TEMP_PREFIX));
  try {
    const archive = await packRelease(
      `${packageName}@${version}`,
      projectPath,
      destination,
    );
    const files = new Map<string, string>();
    for (const filePath of filePaths) {
      const content = readTarFile(archive, filePath);
      if (content) files.set(filePath, content.toString("utf-8"));
    }
    return files;
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
}
