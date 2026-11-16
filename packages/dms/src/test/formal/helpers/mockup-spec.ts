import fs from "node:fs";
import path from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { JsonObjectSchema } from "./json";
import { defaultMockupsDir } from "../../../mockup";
import type { JsonObject } from "./json";

/** Sets `options` over the options of the node `id` in `mockups/<mockup>/spec.json`, as a person editing the mockup would. */
export function editNodeOptions(
  mockup: string,
  id: string,
  options: JsonObject,
): void {
  const file = path.join(defaultMockupsDir(), mockup, "spec.json");
  const spec = JsonObjectSchema.parse(
    JSON.parse(fs.readFileSync(file, "utf8")),
  );
  const edited = JSON.stringify(spec, (_key, value: JsonValue) => {
    const node = JsonObjectSchema.safeParse(value);
    if (!node.success || node.data.id !== id) return value;
    const current = JsonObjectSchema.safeParse(node.data.options);
    const merged: JsonObject = { ...options };
    if (current.success) Object.assign(merged, current.data, options);
    return { ...node.data, options: merged };
  });
  fs.writeFileSync(file, edited);
}
