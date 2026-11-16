import { ImplementInterface } from "@antelopejs/interface-core";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import * as Builder from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import { mockupTool, run } from "../../helpers/mockup-mcp";
import {
  createFixture,
  destroyFixture,
  type Fixture,
  snapshotFixture,
} from "../../unit/builder/harness";
import {
  CONNECTION,
  ERP_CONNECTION,
  MAPPED,
} from "../../unit/builder/helpers/mapped-orders";
import { readTree } from "./project-tree";
import { MODULE } from "../../unit/builder/mapped-database";
import { reloadedAtOnce } from "../../unit/builder/reload-stub";

const MappedSchema = z.object({
  data: z.object({
    resources: z.array(
      z.object({
        ref: z.string(),
        page: z.string(),
        files: z.array(z.string()),
      }),
    ),
  }),
});

/** What mapping `erp.orders` wrote: the names the tools take back. */
export interface MappedOrders {
  ref: string;
  page: string;
}

/** A project that maps `erp.orders` from a connected database, restorable to the state right after the mapping. */
export interface MappedProject {
  /** The project's app root while a state of it is loaded. */
  fixture(): Fixture;
  /** What the mapping wrote. */
  orders: MappedOrders;
  /** Puts the project back as the mapping left it. */
  restore(): void;
  /** Every file of the project's sources, by relative path, with its text. */
  files(): Map<string, string>;
  /** Ends the project and the stubs it set. */
  destroy(): void;
}

function serveDatabase(): void {
  setCatalogConnectionsForTests({ [CONNECTION]: ERP_CONNECTION });
  setModuleReloadForTests(reloadedAtOnce);
}

async function call(name: string, args: JsonValue): Promise<string> {
  const { text, isError } = await run(mockupTool(name), args);
  if (isError) throw new Error(`${name} failed: ${text}`);
  return text;
}

/**
 * Connects the database whose rows hold the canary values, analyses it, maps `erp.orders` and
 * keeps that state to return to.
 */
export async function mapOrders(): Promise<MappedProject> {
  ImplementInterface(Builder, implementation);
  let fixture = createFixture({ modules: [MODULE] });
  serveDatabase();
  await call("builder_analyse_database", {
    connection: CONNECTION,
    module: MODULE,
  });
  const [orders] = MappedSchema.parse(
    JSON.parse(await call("builder_map_resources", MAPPED)),
  ).data.resources;
  if (orders === undefined) throw new Error("the mapping wrote no resource");
  snapshotFixture();
  return {
    fixture: () => fixture,
    orders,
    restore() {
      fixture = createFixture({ modules: [MODULE], fromSnapshot: true });
    },
    files: () => readTree(fixture.root),
    destroy() {
      setCatalogConnectionsForTests();
      setModuleReloadForTests();
      destroyFixture();
    },
  };
}
