import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import {
  Hook,
  type HookHandler,
  RegisterTenantDataExportContributor,
  type TenantExportArchive,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";
import { buildTenantExportArchive } from "../../../utils/tenant-export-archive";

const TENANT_ID = "tenant-1";

type ExportHandler = HookHandler<Hook.TENANT_DATA_EXPORT>;

const registered: ExportHandler[] = [];

function register(moduleId: string, handler: ExportHandler): void {
  RegisterTenantDataExportContributor(moduleId, handler);
  registered.push(handler);
}

async function build(signal?: AbortSignal) {
  const localPath = path.join(
    os.tmpdir(),
    `dms-export-test-${process.hrtime.bigint()}.zip`,
  );
  const summary = await buildTenantExportArchive({
    tenantId: TENANT_ID,
    localPath,
    signal: signal ?? new AbortController().signal,
  });
  // Entry names sit uncompressed in the local file headers, so scanning the
  // raw bytes is enough to assert the archive layout without a zip reader.
  const raw = fs.readFileSync(localPath).toString("latin1");
  fs.rmSync(localPath, { force: true });
  return { summary, raw };
}

describe("[unit] utils/tenant-export-archive", () => {
  afterEach(() => {
    for (const handler of registered) {
      UnregisterHook(Hook.TENANT_DATA_EXPORT, handler);
    }
    registered.length = 0;
  });

  it("writes a JSON contribution under the contributor module id", async () => {
    register("alpha", async () => ({ moduleId: "alpha", data: { a: 1 } }));

    const { summary, raw } = await build();

    expect(summary.partial).to.equal(false);
    expect(raw).to.contain("modules/alpha.json");
    expect(raw).to.contain("manifest.json");
  });

  it("keeps a contributor that ignores the archive working untouched", async () => {
    const legacyHandler = async (tenantId: string) => ({
      moduleId: "legacy",
      data: { tenantId },
    });
    register("legacy", legacyHandler);

    const { summary, raw } = await build();

    expect(summary.failures).to.deep.equal([]);
    expect(raw).to.contain("modules/legacy.json");
  });

  it("namespaces archive entries and rejects path traversal", async () => {
    register("alpha", async (_tenantId, archive) => {
      await archive.addJson("config.json", { enabled: true });
      await archive.addStream(
        "../../escape/dump.bin",
        Readable.from([Buffer.from("dump")]),
      );
    });

    const { raw } = await build();

    expect(raw).to.contain("modules/alpha/config.json");
    expect(raw).to.contain("modules/alpha/escape/dump.bin");
    expect(raw).to.not.contain("../");
  });

  it("adds a file already on disk", async () => {
    const sourcePath = path.join(
      os.tmpdir(),
      `dms-export-source-${process.hrtime.bigint()}.txt`,
    );
    fs.writeFileSync(sourcePath, "on-disk artifact");
    register("alpha", async (_tenantId, archive) => {
      await archive.addFile("artifact.txt", sourcePath);
    });

    const { raw } = await build();
    fs.rmSync(sourcePath, { force: true });

    expect(raw).to.contain("modules/alpha/artifact.txt");
  });

  it("degrades to a partial archive when a contributor fails", async () => {
    register("broken", async () => {
      throw new Error("contributor exploded");
    });
    register("alpha", async () => ({ moduleId: "alpha", data: { a: 1 } }));

    const { summary, raw } = await build();

    expect(summary.partial).to.equal(true);
    expect(summary.failures).to.deep.equal([
      { source: "broken", error: "contributor exploded" },
    ]);
    expect(raw).to.contain("modules/alpha.json");
  });

  it("runs contributors serially", async () => {
    const calls: string[] = [];
    const trace = (moduleId: string): ExportHandler => {
      return async () => {
        calls.push(`${moduleId}:start`);
        await new Promise((resolve) => setImmediate(resolve));
        calls.push(`${moduleId}:end`);
      };
    };
    register("first", trace("first"));
    register("second", trace("second"));

    await build();

    expect(calls).to.deep.equal([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("keeps colliding module ids apart", async () => {
    register("alpha", async (_tenantId, archive) => {
      await archive.addJson("data.json", { source: 1 });
    });
    register("alpha", async (_tenantId, archive) => {
      await archive.addJson("data.json", { source: 2 });
    });

    const { raw } = await build();

    expect(raw).to.contain("modules/alpha/data.json");
    expect(raw).to.contain("modules/alpha-2/data.json");
  });

  it("refuses writes once the contributor has returned", async () => {
    let escaped: TenantExportArchive | undefined;
    register("alpha", async (_tenantId, archive) => {
      escaped = archive;
    });

    await build();
    const late = await escaped
      ?.addJson("late.json", {})
      .catch((error: unknown) => error);

    expect(late).to.be.instanceOf(Error);
  });

  it("fails the whole export when the signal aborts", async () => {
    const controller = new AbortController();
    register("alpha", async () => {
      controller.abort(new Error("cancelled by user"));
      throw new Error("contributor noticed the abort");
    });

    const failure = await build(controller.signal).catch(
      (error: unknown) => error,
    );

    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.equal("cancelled by user");
  });
});
