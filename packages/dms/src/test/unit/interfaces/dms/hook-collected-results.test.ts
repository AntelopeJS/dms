import {
  CollectHooks,
  Hook,
  RegisterHook,
  type TenantDataExportContribution,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";

type IsAny<A> = 0 extends 1 & A ? true : false;

type IsExact<A, B> =
  IsAny<A> extends true
    ? false
    : IsAny<B> extends true
      ? false
      : [A] extends [B]
        ? [B] extends [A]
          ? true
          : false
        : false;

type Collected<H extends Hook> = Awaited<ReturnType<typeof CollectHooks<H>>>;

const exportCollectsContributions: IsExact<
  Collected<Hook.TENANT_DATA_EXPORT>,
  Array<TenantDataExportContribution | void>
> = true;

const eventCollectsWhateverHandlersReturn: IsExact<
  Collected<Hook.MEMBER_ADDED>,
  unknown[]
> = true;

const MEMBER = {
  tenantId: "collected-tenant",
  userId: "collected-user",
  isTenantOwner: false,
};
const WRITTEN_ROWS = 3;

describe("[unit] interfaces/dms/hooks — collected results", () => {
  it("types what CollectHooks gathers by the hook, not as the hook's declared result", () => {
    expect([
      exportCollectsContributions,
      eventCollectsWhateverHandlersReturn,
    ]).to.deep.equal([true, true]);
  });

  it("gathers the value each handler of an event hook returned, failures skipped", async () => {
    const before = await CollectHooks(Hook.MEMBER_ADDED, MEMBER);
    const rows = () => WRITTEN_ROWS;
    const failing = () => {
      throw new Error("collected handler failure");
    };
    RegisterHook(Hook.MEMBER_ADDED, rows);
    RegisterHook(Hook.MEMBER_ADDED, failing);
    try {
      const collected = await CollectHooks(Hook.MEMBER_ADDED, MEMBER);
      expect(collected).to.deep.equal([...before, WRITTEN_ROWS]);
    } finally {
      UnregisterHook(Hook.MEMBER_ADDED, rows);
      UnregisterHook(Hook.MEMBER_ADDED, failing);
    }
  });
});
