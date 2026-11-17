import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { expect } from "chai";
import { readPublishedFiles } from "../../../store";

const TAR_BLOCK = 512;

/** A one-file ustar archive, as `npm pack` writes it. */
function tarball(name: string, content: string): Buffer {
  const header = Buffer.alloc(TAR_BLOCK);
  header.write(name, 0);
  header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write("0", 156);
  const body = Buffer.alloc(Math.ceil(content.length / TAR_BLOCK) * TAR_BLOCK);
  body.write(content);
  return gzipSync(Buffer.concat([header, body, Buffer.alloc(2 * TAR_BLOCK)]));
}

/** Writes the archive where `--pack-destination` points, from npm's cwd, and logs that argument. */
const NPM_STAND_IN = `#!/usr/bin/env node
const { appendFileSync, copyFileSync } = require("node:fs");
const path = require("node:path");
const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
appendFileSync(process.env.NPM_STAND_IN_LOG, destination + "\\n");
copyFileSync(process.env.NPM_STAND_IN_ARCHIVE, path.resolve(destination, "pkg-1.0.0.tgz"));
`;

const NPM_CMD_SHIM = `@"${process.execPath}" "%~dp0npm" %*\r\n`;

describe("[unit] store/tarball — published files", () => {
  const originalPath = process.env.PATH;
  let root: string;
  let project: string;
  let log: string;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "dms-store-tarball-"));
    project = path.join(root, "project");
    const binFolder = path.join(root, "bin");
    await mkdir(project);
    await mkdir(binFolder);
    await writeFile(path.join(binFolder, "npm"), NPM_STAND_IN, {
      mode: 0o755,
    });
    await writeFile(path.join(binFolder, "npm.cmd"), NPM_CMD_SHIM);
    const archive = path.join(root, "archive.tgz");
    await writeFile(archive, tarball("package/dms.json", '{"ok":true}'));
    log = path.join(root, "destinations.log");
    process.env.NPM_STAND_IN_ARCHIVE = archive;
    process.env.NPM_STAND_IN_LOG = log;
    process.env.PATH = `${binFolder}${path.delimiter}${originalPath}`;
  });
  after(async () => {
    process.env.PATH = originalPath;
    delete process.env.NPM_STAND_IN_ARCHIVE;
    delete process.env.NPM_STAND_IN_LOG;
    await rm(root, { recursive: true, force: true });
  });

  it("reads a file of the packed release, naming no folder outside the project to npm", async () => {
    const files = await readPublishedFiles("@acme/x", "1.0.0", project, [
      "dms.json",
      "missing.json",
    ]);
    expect([...files]).to.deep.equal([["dms.json", '{"ok":true}']]);
    const [destination] = (await readFile(log, "utf8")).split("\n");
    expect(path.isAbsolute(destination ?? "")).to.equal(false);
    expect(destination).to.not.include(root);
  });
});
