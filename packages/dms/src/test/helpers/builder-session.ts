import { type BridgeProcess, startBridge } from "./mcp-bridge-process";

type Shop = typeof import("../unit/builder/helpers/block-requests");

/** The shop app with the builder engine behind its interface, and a stdio bridge to the MCP route. */
export interface BuilderSession {
  shop: Shop;
  bridge: BridgeProcess;
}

/**
 * Starts the shop app and a bridge for the suite that calls it, and stops them after it. The
 * shop helper loads the builder engine when the suite starts, not when the file loads, so the
 * start of the harness still loads no ts-morph.
 *
 * @returns The session, once the suite's `before` hooks ran
 */
export function useBuilderSession(): () => BuilderSession {
  let current: BuilderSession | undefined;
  before(async () => {
    const shop = await import("../unit/builder/helpers/block-requests");
    await shop.createShop();
    current = { shop, bridge: await startBridge() };
  });
  after(async () => {
    await current?.bridge.close();
    await current?.shop.destroyShop();
  });
  return () => {
    if (current === undefined) throw new Error("the shop has not started");
    return current;
  };
}
