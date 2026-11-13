import { defaultMockupsDir } from "./files";
import { registerMockupPage } from "./page";
import {
  closeMockupStreams,
  type MockupEngine,
  registerMockupRoutes,
} from "./routes";
import { MockupStore } from "./store";

export * from "./annotations";
export * from "./compile";
export * from "./files";
export * from "./from-page";
export * from "./from-page-sketch";
export * from "./json-schema";
export * from "./live-page";
export * from "./model";
export * from "./routes";
export * from "./source";
export * from "./source-routes";
export * from "./store";

let engine: MockupEngine | undefined;

/**
 * Serves the mockups of `mockupsDir` (`<project root>/mockups` by default):
 * the `/api/mockup` routes and the `/mockup` page. Development only.
 */
export function startMockupEngine(mockupsDir = defaultMockupsDir()): void {
  if (engine) return;
  engine = { store: new MockupStore(mockupsDir), streams: new Set() };
  registerMockupRoutes(engine);
  registerMockupPage();
}

/** Whether the mockup engine serves this process: in development only. */
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
