import {
  ExecuteHooks,
  Hook,
  type HookHandler,
  RegisterHook,
  type TenantProvisioningHookPayload,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";

type ProvisioningHandler = HookHandler<Hook.TENANT_BEING_PROVISIONED>;

const TENANT_ID = "provisioning-tenant";
const USER_ID = "provisioning-user";
const HANDLER_FAILURE = "referral ledger is down";

const registered: ProvisioningHandler[] = [];

function register(handler: ProvisioningHandler): void {
  RegisterHook(Hook.TENANT_BEING_PROVISIONED, handler);
  registered.push(handler);
}

function buildPayload(
  extras: Record<string, unknown> = {},
): TenantProvisioningHookPayload {
  return { tenantId: TENANT_ID, userId: USER_ID, extras };
}

async function provision(
  payload: TenantProvisioningHookPayload,
): Promise<unknown> {
  try {
    await ExecuteHooks(Hook.TENANT_BEING_PROVISIONED, payload);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("[unit] interfaces/dms/hooks — TENANT_BEING_PROVISIONED", () => {
  afterEach(() => {
    for (const handler of registered) {
      UnregisterHook(Hook.TENANT_BEING_PROVISIONED, handler);
    }
    registered.length = 0;
  });

  // The whole point of the hook: an emitter that awaits it can unwind the
  // workspace it was provisioning, because it learns of the failure before it
  // commits and no later handler has run in the meantime.
  it("propagates a handler failure to the emitter and stops there", async () => {
    const reached: string[] = [];
    register(async () => {
      reached.push("first");
      return undefined;
    });
    register(async () => {
      throw new Error(HANDLER_FAILURE);
    });
    register(async () => {
      reached.push("third");
      return undefined;
    });

    const error = await provision(buildPayload());

    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.equal(HANDLER_FAILURE);
    // "first" ran and nothing takes it back: the dispatcher enlists no shared
    // transaction, so a handler that already returned owns what it wrote. The
    // guarantee runs one way — no workspace without the enrichment, not the
    // reverse — and handlers are documented to key their rows on `tenantId`.
    expect(reached).to.deep.equal(["first"]);
  });

  it("awaits each handler before starting the next", async () => {
    const events: string[] = [];
    register(async () => {
      events.push("slow:start");
      await new Promise((resolve) => setImmediate(resolve));
      events.push("slow:end");
      return undefined;
    });
    register(async () => {
      events.push("next:start");
      return undefined;
    });

    await provision(buildPayload());

    expect(events).to.deep.equal(["slow:start", "slow:end", "next:start"]);
  });

  // `extras` belongs to the caller and the handler; the DMS is only the
  // courier. Anything reshaping it in transit would break that contract.
  it("hands extras to the handler untouched", async () => {
    const extras = {
      acquisitionSource: "podcast",
      teamSize: 12,
      referral: { code: "ACME-7", campaign: null },
    };
    let seen: TenantProvisioningHookPayload | undefined;
    register(async (payload) => {
      seen = payload;
      return undefined;
    });

    await provision(buildPayload(extras));

    expect(seen?.tenantId).to.equal(TENANT_ID);
    expect(seen?.userId).to.equal(USER_ID);
    expect(seen?.extras).to.deep.equal(extras);
  });

  it("carries extras a future consumer invents, with no DMS change", async () => {
    const unknownToTheDms = { whateverTheProductAsks: ["a", "b"] };
    let seen: Record<string, unknown> | undefined;
    register(async (payload) => {
      seen = payload.extras;
      return undefined;
    });

    await provision(buildPayload(unknownToTheDms));

    expect(seen).to.deep.equal(unknownToTheDms);
  });
});
