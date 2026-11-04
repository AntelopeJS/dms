import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  Parameters as DataParameters,
  Validation,
} from "@antelopejs/interface-data-api/components";
import { createGuardedWriteRoute } from "@antelopejs/interface-dms/base/table-view/internal/guards";
import { requestContextFixture } from "../../../helpers/request-context";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view/meta";
import type { TableViewGuards } from "@antelopejs/interface-dms/base/types/guards";
import { expect } from "chai";

const ctx = requestContextFixture();

class AmendingController {}
class PlainController {}

function withGuards(
  target: typeof AmendingController,
  guards: TableViewGuards,
): void {
  GetMetadata(target, TableViewMeta).setControllerGuards(guards);
}

/** A route reading its body the way `DefaultRoutes.New` and `Edit` do. */
function writingRoute(written: ReturnType<typeof Validation.ParseBody>[]) {
  return createGuardedWriteRoute(
    {
      func: async (
        _ctx: RequestContext,
        _params: DataParameters.NewParameters,
        body: Validation.WrittenBody,
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
    const seen: Validation.WrittenBody[] = [];
    const body = raw({ customer: "Acme" });
    await createGuardedWriteRoute(
      {
        func: async (
          _ctx: RequestContext,
          _params: DataParameters.NewParameters,
          value: Validation.WrittenBody,
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

  it("refuses a body that is not a JSON object before the new guard runs", async () => {
    const guarded: string[] = [];
    withGuards(AmendingController, {
      new: () => {
        guarded.push("guard");
      },
    });
    const refusal = await Promise.resolve(
      writingRoute([]).func.call(
        new AmendingController(),
        ctx,
        {},
        Buffer.from("[1]"),
      ),
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refusal).to.be.instanceOf(HTTPResult);
    expect(refusal instanceof HTTPResult && refusal.getStatus()).to.equal(400);
    expect(guarded).to.deep.equal([]);
  });

  it("answers 400 for an empty body under a new guard", async () => {
    withGuards(AmendingController, { new: () => undefined });
    const refusal = await Promise.resolve(
      writingRoute([]).func.call(
        new AmendingController(),
        ctx,
        {},
        Buffer.alloc(0),
      ),
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refusal instanceof HTTPResult && refusal.getStatus()).to.equal(400);
  });
});
