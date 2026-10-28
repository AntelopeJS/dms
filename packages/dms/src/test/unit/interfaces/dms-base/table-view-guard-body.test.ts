import type { RequestContext } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { Validation } from "@antelopejs/interface-data-api/components";
import { createGuardedRoute } from "@antelopejs/interface-dms/base/table-view/internal/guards";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view/meta";
import type { TableViewGuards } from "@antelopejs/interface-dms/base/types/guards";
import { expect } from "chai";

const ctx = {};

class AmendingController {}
class PlainController {}

function withGuards(
  target: typeof AmendingController,
  guards: TableViewGuards,
): void {
  GetMetadata(target, TableViewMeta).setControllerGuards(guards);
}

/** A route reading its body the way `DefaultRoutes.New` and `Edit` do. */
function writingRoute(
  written: ReturnType<typeof Validation.ParseBody>[],
): DataControllerCallback {
  return createGuardedRoute(
    {
      func: async (
        _ctx: RequestContext,
        _params: Parameters<DataControllerCallback["func"]>[1],
        body: Buffer,
      ) => {
        written.push(Validation.ParseBody(body));
        return "written";
      },
      args: [],
      method: "post",
    },
    "new",
  );
}

const raw = (body: { customer: string; internal?: boolean }) =>
  Buffer.from(JSON.stringify(body));

describe("[unit] interfaces/dms-base/table-view — guards amending the body", () => {
  it("writes the body a new guard amended", async () => {
    withGuards(AmendingController, {
      new: (_ctx, { body }) => {
        body.number = "INV-0042";
        delete body.internal;
      },
    });
    const written: ReturnType<typeof Validation.ParseBody>[] = [];
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
    const seen: Buffer[] = [];
    const body = raw({ customer: "Acme" });
    await createGuardedRoute(
      {
        func: async (
          _ctx: RequestContext,
          _params: Parameters<DataControllerCallback["func"]>[1],
          value: Buffer,
        ) => {
          seen.push(value);
        },
        args: [],
        method: "post",
      },
      "new",
    ).func.call(new PlainController(), ctx, {}, body);
    expect(seen).to.deep.equal([body]);
    expect(seen[0]).to.equal(body);
  });
});
