import {
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import type { PageReader } from "./built-sync";
import { defaultMockupsDir } from "./files";
import { MOCKUP_API } from "./fixtures";
import {
  isJsonObject,
  type Json,
  type JsonObject,
  type MockupIssue,
  type MockupName,
} from "./model";
import { registerMockupPage } from "./page";
import {
  closeMockupStreams,
  createMockupEngine,
  type MockupEngine,
  registerMockupRoutes,
} from "./routes";
import { MockupStore } from "./store";

export * from "./annotations";
export * from "./apply-notes";
export * from "./apply-plan";
export * from "./apply-to-page";
export * from "./compile";
export * from "./files";
export * from "./from-page";
export * from "./from-page-sketch";
export * from "./history";
export * from "./history-routes";
export * from "./json-schema";
export * from "./manage";
export * from "./live-page";
export * from "./model";
export * from "./presence";
export * from "./presence-board";
export * from "./presence-routes";
export * from "./review";
export * from "./review-notifications";
export * from "./routes";
export * from "./sample-rows";
export * from "./source";
export * from "./source-routes";
export * from "./store";
export * from "./table-title";

let engine: MockupEngine | undefined;

/**
 * Serves the mockups of `mockupsDir` (`<project root>/mockups` by default):
 * the `/api/mockup` routes and the `/mockup` page. Development only.
 */
export function startMockupEngine(
  mockupsDir = defaultMockupsDir(),
  livePages?: PageReader,
): void {
  if (engine) return;
  engine = createMockupEngine(new MockupStore(mockupsDir, livePages));
  registerMockupRoutes(engine);
  registerMockupPage();
}

export function mockupEngineRunning(): boolean {
  return engine !== undefined;
}

/**
 * The issues that refuse writing `next` over the `current` spec of `name`
 * because a viewer of the running engine holds a block it changes or removes,
 * as `PUT /spec` refuses it: each at the block's path, naming the holder.
 * None while the engine does not run. Ask it inside the spec lock of `name`,
 * for a write made outside the engine's routes.
 */
export function mockupLockRefusals(
  name: MockupName,
  current: JsonObject,
  next: Json,
): MockupIssue[] {
  return engine && isJsonObject(next)
    ? engine.presence.refusals(name, undefined, current, next)
    : [];
}

/**
 * Ends the event streams and stops watching. The routes stay registered: a
 * new subscriber watches again.
 */
export function stopMockupEngine(): void {
  if (!engine) return;
  closeMockupStreams(engine);
  engine.store.close();
}

/**
 * Stops the engine for good: it ends as {@link stopMockupEngine} stops it,
 * its `/api/mockup` routes go, and {@link mockupEngineRunning} answers false
 * until the next {@link startMockupEngine}.
 */
export function endMockupEngine(): void {
  stopMockupEngine();
  engine = undefined;
  for (const route of getRegisteredRoutes()) {
    if (route.location.startsWith(MOCKUP_API)) {
      UnregisterRoute(Number(route.id));
    }
  }
}
