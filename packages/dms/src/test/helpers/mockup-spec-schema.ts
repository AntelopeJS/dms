import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const SCHEMA_FILE = join(__dirname, "../../../data/mockup-spec.schema.json");

/** The generated `data/mockup-spec.schema.json`, as an object. */
export const MOCKUP_SPEC_SCHEMA = z
  .record(z.string(), z.unknown())
  .parse(JSON.parse(readFileSync(SCHEMA_FILE, "utf8")));
