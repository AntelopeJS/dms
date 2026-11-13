import { createRequire } from "node:module";
import path from "node:path";
import type * as Mongodb from "mongodb";
import type * as Mysql2 from "mysql2";
import type * as Pg from "pg";
import { z } from "zod";
import { resolveProjectRoot } from "./project";
import type { RethinkdbClient } from "./rethinkdb-client";

/**
 * The client packages a probe opens a database with, each by what it exports. They are optional
 * peer dependencies: a project installs the one of the engine it connects.
 */
interface ClientModules {
  pg: typeof Pg;
  mongodb: typeof Mongodb;
  mysql2: typeof Mysql2;
  "rethinkdb-ts": RethinkdbClient;
}

export type ClientName = keyof ClientModules;

type ClientRequire = <Name extends ClientName>(
  name: Name,
) => ClientModules[Name];

/** What Node throws when a package is not installed. */
const NotInstalled = z.object({
  code: z.literal("MODULE_NOT_FOUND"),
  message: z.string(),
});

function requireFrom(file: string): ClientRequire {
  return createRequire(file);
}

/**
 * The client package `name`, required only when its engine is checked: from this module's
 * dependencies first, then from the project's. `undefined` when neither installs it. A package
 * that is installed but fails to load throws.
 */
export function loadClient<Name extends ClientName>(
  name: Name,
): ClientModules[Name] | undefined {
  const bases = [__filename, path.join(resolveProjectRoot(), "package.json")];
  for (const base of bases) {
    try {
      return requireFrom(base)(name);
    } catch (error) {
      const failure = NotInstalled.safeParse(error);
      if (!failure.success || !failure.data.message.includes(`'${name}'`)) {
        throw error;
      }
    }
  }
  return undefined;
}
