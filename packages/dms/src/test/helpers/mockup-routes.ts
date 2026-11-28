import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  closeMockupStreams,
  createMockupEngine,
  type LivePages,
  type MockupEngine,
  MockupStore,
  PresenceBoard,
  type PresenceClock,
  registerMockupRoutes,
} from "../../mockup";
import { authorizedClient, registerUser } from "./auth";

/** Where the mockup routes live. */
export const MOCKUP_API = "/api/mockup";

/** What a suite gets from {@link serveMockupRoutes} once its `before` hook ran. */
export interface ServedMockups {
  /** The project folder: the spec is `mockups/desk/spec.json` in it. */
  dir: string;
  engine: MockupEngine;
  /** A client signed in as the platform owner, the caller every route serves. */
  owner: AxiosInstance;
  ownerToken: string;
  /** The platform owner's user id: the author of the owner's notes, and the recipient of a reviewer's. */
  ownerId: string;
}

function mockupRouteIds(): number[] {
  return getRegisteredRoutes()
    .filter((route) => route.location.startsWith(MOCKUP_API))
    .map((route) => Number(route.id));
}

/**
 * Serves `spec` as the mockup `desk` through `/api/mockup` routes registered
 * for the enclosing suite, signs a platform owner up, and removes the routes
 * and the files after the suite. `clock` replaces the time the viewers' locks
 * run out by, and `pages` the live pages a conversion reads.
 */
export function serveMockupRoutes(
  spec: string,
  clock?: PresenceClock,
  pages?: LivePages,
): () => ServedMockups {
  let served: ServedMockups | undefined;

  before(async () => {
    expect(mockupRouteIds()).to.deep.equal([]);
    const { accessToken: ownerToken, userId: ownerId } = await registerUser({
      owner: true,
    });
    const dir = await mkdtemp(join(tmpdir(), "dms-mockup-routes-"));
    await mkdir(join(dir, "mockups", "desk"), { recursive: true });
    await writeFile(join(dir, "mockups", "desk", "spec.json"), spec);
    const store = new MockupStore(join(dir, "mockups"));
    const engine = createMockupEngine(
      store,
      new PresenceBoard(store, clock),
      pages,
    );
    registerMockupRoutes(engine);
    served = {
      dir,
      engine,
      owner: authorizedClient(ownerToken),
      ownerToken,
      ownerId,
    };
  });

  after(async () => {
    mockupRouteIds().forEach(UnregisterRoute);
    if (!served) return;
    closeMockupStreams(served.engine);
    served.engine.store.close();
    await rm(served.dir, { recursive: true, force: true });
  });

  return () => {
    if (!served) throw new Error("The suite's before hook has not run yet");
    return served;
  };
}
