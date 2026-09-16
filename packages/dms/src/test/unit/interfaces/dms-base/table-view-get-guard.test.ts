import {
  Controller,
  HTTPResult,
  type RequestContext,
} from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { Query } from "@antelopejs/interface-data-api/components";
import {
  Access,
  AccessMode,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import { Schema } from "@antelopejs/interface-database";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import * as tenantAccess from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view/meta";
import { setRealtimePresenceHook } from "@antelopejs/interface-dms/base/table-view/realtime";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view/routes";
import type { GetGuardArgs } from "@antelopejs/interface-dms/base/types/guards";

const SCHEMA = "get-guard-test";
const TABLE = "documents";
const NOT_FOUND = 404;
const FORBIDDEN = 403;
const USER = { _id: "get-guard-user" } as User;
const ctx = { url: new URL("http://localhost/get") } as RequestContext;
const events: string[] = [];
let denied = false;
const gate: tenantAccess.TenantAccessGateInfo = {
  id: "get-guard-order",
  order: 0,
  gate: () => {
    events.push("authorize");
    return denied ? { allowed: false, code: "denied" } : { allowed: true };
  },
};

@RegisterTable(TABLE, SCHEMA)
class Document extends Table {
  @Field("string")
  declare documentType: string;
  @Field("string")
  declare name: string;
}
class DocumentModel extends BasicDataModel(Document, TABLE) {}

@RegisterDataController()
class DocumentAPI extends DataController(
  Document,
  { get: TableViewRoutes.Get },
  Controller("/guard-test"),
) {
  @ModelReference()
  @Model(DocumentModel)
  declare model: DocumentModel;
  @Access(AccessMode.ReadOnly)
  get name() {
    events.push("transform");
    return this.table.name.toUpperCase();
  }
}

const controller = new DocumentAPI();
const meta = GetMetadata(DocumentAPI, TableViewMeta);
async function guard(
  this: unknown,
  context: RequestContext,
  args: GetGuardArgs,
) {
  await Promise.resolve();
  events.push("guard");
  expect(this).to.equal(controller);
  expect(context.url.toString()).to.equal(ctx.url.toString());
  expect(args.id).to.be.a("string");
  if (args.current.documentType !== "invoice")
    throw new HTTPResult(NOT_FOUND, "Not Found");
}

function get(id: string) {
  return TableViewRoutes.Get.func.call(
    controller,
    ctx,
    { id },
    USER,
    "session",
    "1",
    USER,
  );
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise;
  } catch (error) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(status);
    return;
  }
  throw new Error("Expected a rejected request");
}

describe("[unit] TableView Get guard", () => {
  let invoiceId: string;
  let quoteId: string;
  const originalGet = Query.Get;
  before(async () => {
    void ImplementInterface(tenantAccess, tenantAccessImpl);
    tenantAccess.RegisterTenantAccessGate(gate);
    await RegisterSchema(SCHEMA);
    const schema = Schema.get(SCHEMA);
    if (!schema) throw new Error("Missing test schema");
    const model = new DocumentModel(schema.instance());
    controller.model = model;
    [invoiceId] = await model.insert({
      documentType: "invoice",
      name: "Invoice",
    });
    [quoteId] = await model.insert({ documentType: "quote", name: "Quote" });
    setRealtimePresenceHook(() => {
      events.push("presence");
    });
  });
  beforeEach(() => {
    events.length = 0;
    denied = false;
    meta.setControllerGuards({ get: guard });
    Query.Get = (...args) => {
      events.push("load");
      return originalGet(...args);
    };
  });
  afterEach(() => {
    Query.Get = originalGet;
  });
  after(() => {
    tenantAccess.internal.RegisterTenantAccessGate.unregister(gate);
    setRealtimePresenceHook(() => {});
  });

  it("authorizes, loads once, guards hidden data, transforms, then acquires presence", async () => {
    expect(await get(invoiceId)).to.deep.equal({ name: "INVOICE" });
    expect(events).to.deep.equal([
      "authorize",
      "load",
      "guard",
      "transform",
      "presence",
    ]);
  });
  it("does not load or guard when authorization fails", async () => {
    denied = true;
    await expectStatus(get(invoiceId), FORBIDDEN);
    expect(events).to.deep.equal(["authorize"]);
  });
  it("does not transform or acquire presence when the guard denies", async () => {
    await expectStatus(get(quoteId), NOT_FOUND);
    expect(events).to.deep.equal(["authorize", "load", "guard"]);
  });
  it("does not guard or acquire presence for a missing row", async () => {
    await expectStatus(get("missing"), NOT_FOUND);
    expect(events).to.deep.equal(["authorize", "load"]);
  });
  it("preserves no-guard behavior", async () => {
    meta.setControllerGuards({});
    expect(await get(quoteId)).to.deep.equal({ name: "QUOTE" });
    expect(events).to.deep.equal([
      "authorize",
      "load",
      "transform",
      "presence",
    ]);
  });
});
