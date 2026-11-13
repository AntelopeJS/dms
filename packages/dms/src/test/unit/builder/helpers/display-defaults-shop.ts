import path from "node:path";
import type {
  MappedField,
  MappedResource,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import {
  AnalyseDatabase,
  GetAnalysis,
} from "../../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../../implementations/dms-builder/engine";
import { INFO, Profiled } from "../analysis-catalog";
import { createFixture, destroyFixture, type Fixture } from "../harness";
import { MODULE } from "../mapped-database";
import { reloadedAtOnce } from "../reload-stub";
import { projectFile } from "./project-files";
import { ordersInput, SHOP } from "./shop-orders";

let app: Fixture;

/** Set `down` to make the shop's profile fail for the rest of the test. */
export const profiles = { down: false };

/** The text of a file the engine wrote under the fixture module's `src`. */
export function moduleFile(relative: string): string {
  return projectFile(app.root, path.join("modules", MODULE, "src", relative));
}

const PROFILES = new Map([
  [
    "shop.customers",
    Profiled("shop.customers", 4, { name: { traits: ["label-candidate"] } }),
  ],
  [
    "shop.orders",
    Profiled("shop.orders", 10, {
      reference: { traits: ["label-candidate"] },
      status: {
        traits: ["enum-like"],
        categories: { paid: 5, pending: 3, cancelled: 2 },
      },
    }),
  ],
]);

/** What an assistant sends when its example shows no `display` and no `tabs`. */
export function bareInput(
  overrides: Partial<MappedResource> = {},
  total: Partial<MappedField> = {},
): MapResourcesInput {
  return ordersInput({
    fields: [
      { column: "reference" },
      { column: "customer_id", relation: "shop.customers", label: "Customer" },
      { column: "status", filterable: true },
      { column: "total", ...total },
    ],
    tabs: undefined,
    ...overrides,
  });
}

/** Runs an analysis of the shop connection and waits for it to settle. */
export async function analysed(): Promise<void> {
  const started = await AnalyseDatabase({ connection: "shop", module: MODULE });
  if (!started.ok) {
    throw new Error(`AnalyseDatabase: ${JSON.stringify(started.error)}`);
  }
  for (;;) {
    const state = await GetAnalysis(started.data.id);
    if (state.ok && state.data.status !== "running") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** A fresh app, and a shop connection whose profiles come from `profiles`. */
export function openShop(): void {
  profiles.down = false;
  app = createFixture({ modules: [MODULE] });
  setCatalogConnectionsForTests({
    shop: {
      async Info() {
        return INFO;
      },
      async ListRelations() {
        return SHOP;
      },
      async DescribeRelations(relations: string[]) {
        return SHOP.filter((description) =>
          relations.includes(`${description.schema}.${description.name}`),
        );
      },
      async Profile(request) {
        if (profiles.down) {
          throw new Error("the profile timed out");
        }
        const profile = PROFILES.get(request.relation);
        if (!profile) {
          throw new Error(`no profile of ${request.relation}`);
        }
        return profile;
      },
      async CheckReference() {
        return {
          status: "ok",
          value: {
            containment: 1,
            checkedRows: 10,
            sampled: false,
            targetIsKey: true,
          },
        };
      },
    },
  });
  setModuleReloadForTests(reloadedAtOnce);
}

export function closeShop(): void {
  setCatalogConnectionsForTests();
  setModuleReloadForTests();
  destroyFixture();
}
