import {
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import type { PageReader } from "./built-sync";
import { defaultMockupsDir } from "./files";
import { MOCKUP_API } from "./fixtures";
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
