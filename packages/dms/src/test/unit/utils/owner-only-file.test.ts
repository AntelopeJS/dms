import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { writeOwnerOnlyFile } from "../../../utils";

const itOnWindows = platform() === "win32" ? it : it.skip;

describe("[unit] utils/owner-only-file", () => {
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

  itOnWindows(
    "rejects, leaves nothing staged and keeps the old target when the file cannot be restricted",
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
