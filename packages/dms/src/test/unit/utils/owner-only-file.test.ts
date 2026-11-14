import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { writeOwnerOnlyFile } from "../../../utils";

const itOnWindows = platform() === "win32" ? it : it.skip;
/** Each write starts Windows PowerShell up to twice, which a cold runner can take seconds to do. */
const WRITE_TIMEOUT_MS = platform() === "win32" ? 30_000 : 2_000;

describe("[unit] utils/owner-only-file", function () {
  this.timeout(WRITE_TIMEOUT_MS);
  let directory: string;
  let emptySystemRoot: string;
  let systemRoot: string | undefined;
  let target: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "dms-owner-only-"));
    emptySystemRoot = await mkdtemp(join(tmpdir(), "dms-system-root-"));
    systemRoot = process.env.SystemRoot;
    target = join(directory, "secret.json");
    await writeFile(target, "old");
  });

  afterEach(async () => {
    if (systemRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = systemRoot;
    await rm(directory, { recursive: true, force: true });
    await rm(emptySystemRoot, { recursive: true, force: true });
  });

  it("replaces the target and leaves nothing staged beside it", async () => {
    await writeOwnerOnlyFile(target, "new");
    expect(await readFile(target, "utf8")).to.equal("new");
    expect(await readdir(directory)).to.deep.equal(["secret.json"]);
  });

  it("rejects and leaves nothing staged when the rename over the target fails after the secret is staged", async () => {
    const occupied = join(directory, "occupied");
    await mkdir(occupied);
    await writeFile(join(occupied, "keep"), "kept");
    const failure = await writeOwnerOnlyFile(occupied, "new").then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).to.be.instanceOf(Error);
    expect((await readdir(directory)).sort()).to.deep.equal([
      "occupied",
      "secret.json",
    ]);
    expect(await readdir(occupied)).to.deep.equal(["keep"]);
  });

  itOnWindows(
    "rejects, leaves nothing staged and keeps the old target when its staging directory cannot be restricted",
    async () => {
      process.env.SystemRoot = emptySystemRoot;
      const failure = await writeOwnerOnlyFile(target, "new").then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).to.be.instanceOf(Error);
      expect(await readdir(directory)).to.deep.equal(["secret.json"]);
      expect(await readFile(target, "utf8")).to.equal("old");
    },
  );
});
