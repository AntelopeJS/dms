import { strict as assert } from "node:assert";
import { mock } from "node:test";
import { GetModel } from "@antelopejs/interface-database-decorators";
import * as storage from "@antelopejs/interface-file-storage";
import { ExportJobModel } from "@antelopejs/interface-dms/db/models/exportJobs.model";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { ExportStatus } from "@antelopejs/interface-dms/base/types/export-status";
import { sweepStaleExportsAllTenants } from "../../utils/export-jobs";
import { resetDatabase } from "../helpers/db";

const TENANT = "export-cleanup-tenant";
const OTHER_TENANT = "export-cleanup-other";
const TTL_MS = 60_000;
const STALE = new Date(0);

describe("Export cleanup replay (MongoDB adapter)", () => {
  let model: ExportJobModel;
  let objects: Set<string>;

  function useStorageFake(
    deleteFile: (key: string) => Promise<void> = async (key) => {
      if (!objects.delete(key)) throw new Error("object missing");
    },
  ) {
    mock.restoreAll();
    mock.method(storage, "DeleteFile", deleteFile);
    mock.method(storage, "FileExists", async (key: string) => objects.has(key));
  }

  beforeEach(async () => {
    await resetDatabase();
    await GetModel(TenantModel).table.insert({ _id: TENANT }).run();
    model = GetModel(ExportJobModel, TENANT);
    objects = new Set(["old-file", "pending-file", "recent-file"]);
    useStorageFake();
    await model.table
      .insert([
        {
          _id: "old",
          status: ExportStatus.completed,
          updatedAt: STALE,
          resultPath: "old-file",
        },
        {
          _id: "pending",
          status: ExportStatus.pending,
          updatedAt: STALE,
          resultPath: "pending-file",
        },
        {
          _id: "recent",
          status: ExportStatus.completed,
          updatedAt: new Date(),
          resultPath: "recent-file",
        },
      ])
      .run();
  });

  afterEach(() => mock.restoreAll());

  it("allows concurrent sweeps without deleting pending or fresh exports", async () => {
    await Promise.all([
      sweepStaleExportsAllTenants(TTL_MS),
      sweepStaleExportsAllTenants(TTL_MS),
    ]);
    assert.equal(await model.get("old"), undefined);
    assert.ok(await model.get("pending"));
    assert.ok(await model.get("recent"));
    assert.deepEqual([...objects].sort(), ["pending-file", "recent-file"]);
  });

  it("retains failed storage cleanup and retries it on the next sweep", async () => {
    useStorageFake(async () => {
      throw new Error("storage unavailable");
    });
    await assert.rejects(
      sweepStaleExportsAllTenants(TTL_MS),
      /storage unavailable/,
    );
    assert.ok(await model.get("old"));
    useStorageFake(async (key: string) => {
      objects.delete(key);
    });
    await sweepStaleExportsAllTenants(TTL_MS);
    assert.equal(await model.get("old"), undefined);
    assert.equal(objects.has("old-file"), false);
  });

  it("replays a committed object deletion with the database record still present", async () => {
    objects.delete("old-file");
    await sweepStaleExportsAllTenants(TTL_MS);
    assert.equal(await model.get("old"), undefined);
  });

  it("retains an upload whose completion failed for later cleanup", async () => {
    objects.add("failed-upload");
    await model.markAsFailed(
      "pending",
      new Error("completion failed"),
      "failed-upload",
    );
    assert.equal((await model.get("pending"))?.resultPath, "failed-upload");
    await model.markAsFailed("pending", new Error("cleanup retry failed"));
    assert.equal((await model.get("pending"))?.resultPath, "failed-upload");
    await model.update("pending", { updatedAt: STALE });
    await sweepStaleExportsAllTenants(TTL_MS);
    assert.equal(await model.get("pending"), undefined);
    assert.equal(objects.has("failed-upload"), false);
  });

  it("sweeps each tenant without crossing object or record scopes", async () => {
    await GetModel(TenantModel).table.insert({ _id: OTHER_TENANT }).run();
    const other = GetModel(ExportJobModel, OTHER_TENANT);
    await other.table
      .insert({
        _id: "other-old",
        status: ExportStatus.failed,
        updatedAt: STALE,
      })
      .run();
    await sweepStaleExportsAllTenants(TTL_MS);
    assert.equal(await other.get("other-old"), undefined);
    assert.ok(await model.get("pending"));
  });
});
