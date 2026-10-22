import type { RequestContext } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { Validation } from "@antelopejs/interface-data-api/components";
import { createGuardedRoute } from "@antelopejs/interface-dms/base/table-view/internal/guards";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view/meta";
import type { TableViewGuards } from "@antelopejs/interface-dms/base/types/guards";
import { expect } from "chai";

// A `new` guard amends the body the route writes: a generated number filled
// in, a field dropped. The data API route parses the raw body it is handed, so
// what it writes is what the guard left. The edit guard, which reads the row
// it edits, is covered over HTTP (integration/table-view-guard-body.test.ts).

const ctx = {} as RequestContext;

class AmendingController {}
class PlainController {}

function withGuards(target: new () => unknown, guards: TableViewGuards): void {
  GetMetadata(target, TableViewMeta).setControllerGuards(guards);
}

/** A route reading its body the way `DefaultRoutes.New` and `Edit` do. */
function writingRoute(
  written: Record<string, unknown>[],
): DataControllerCallback {
  return createGuardedRoute(
    {
      func: async (_ctx: RequestContext, _params: unknown, body: Buffer) => {
        written.push(Validation.ParseBody(body));
        return "written";
      },
      args: [],
      method: "post",
    } as unknown as DataControllerCallback,
    "new",
  );
}

const raw = (body: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(body));

describe("[unit] interfaces/dms-base/table-view — guards amending the body", () => {
  it("writes the body a new guard amended", async () => {
    withGuards(AmendingController, {
      new: (_ctx, { body }) => {
        (body as Record<string, unknown>).number = "INV-0042";
        delete (body as Record<string, unknown>).internal;
      },
    });
    const written: Record<string, unknown>[] = [];
    await writingRoute(written).func.call(
      new AmendingController(),
      ctx,
      {},
      raw({ customer: "Acme", internal: true }),
    );
    expect(written).to.deep.equal([{ customer: "Acme", number: "INV-0042" }]);
  });

  it("hands the route its raw body untouched without a guard", async () => {
    withGuards(PlainController, {});
    const seen: unknown[] = [];
    const body = raw({ customer: "Acme" });
    await createGuardedRoute(
      {
        func: async (_ctx: RequestContext, _params: unknown, value: Buffer) => {
          seen.push(value);
        },
        args: [],
        method: "post",
      } as unknown as DataControllerCallback,
      "new",
    ).func.call(new PlainController(), ctx, {}, body);
    expect(seen).to.deep.equal([body]);
    expect(seen[0]).to.equal(body);
  });
});
