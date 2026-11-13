import {
  type DatabaseAccess,
  type DatabaseEngine,
  DATABASE_ENGINE_SCHEMES,
  type OpResult,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { DATABASE_ENGINES } from "./database-access";
import { checkDatabase } from "./database-check";
import { invalidConfig, unsupported } from "./ops";

const SCHEME = /^([a-z][a-z0-9+.-]*:)\/\//i;

function isUrlOf(engine: DatabaseEngine, url: string): boolean {
  const scheme = SCHEME.exec(url)?.[1]?.toLowerCase();
  return (
    scheme !== undefined &&
    DATABASE_ENGINE_SCHEMES[engine].some((accepted) => accepted === scheme)
  );
}

const CheckInputSchema = z
  .object({ engine: z.enum(DATABASE_ENGINES), url: z.string() })
  .refine(({ engine, url }) => isUrlOf(engine, url), { path: ["url"] });

/** What `parseCheckInput` answers. */
export type ParsedCheckInput = ReturnType<typeof CheckInputSchema.safeParse>;

/** Reads `input` as an engine and a URL of that engine's scheme. */
export function parseCheckInput(input: unknown): ParsedCheckInput {
  return CheckInputSchema.safeParse(input);
}

/**
 * Checks the database `parsed` names, once it is an engine and a URL of that engine's scheme. The
 * builder may be mounted outside development through `builder.enabled`, and this opens a
 * connection to a host the caller names, so it refuses unless `dev`. A refusal names the fields
 * of the input, never their values.
 */
export async function checkConnection(
  parsed: ParsedCheckInput,
  dev: boolean,
): Promise<OpResult<DatabaseAccess>> {
  if (!dev) {
    return unsupported<DatabaseAccess>(
      "Databases are checked in development only.",
    );
  }
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map(({ path }) => String(path[0]))),
    ];
    return invalidConfig<DatabaseAccess>(
      `Expected an engine of ${DATABASE_ENGINES.join(", ")} and a URL of that engine; check ${fields.join(", ")}.`,
    );
  }
  return {
    ok: true,
    data: await checkDatabase(parsed.data.engine, parsed.data.url),
    changes: [],
  };
}
