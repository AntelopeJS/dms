import type { App } from "vue";
import { engine } from "./api-data-runtime";
import { stubBlockRuntime } from "./block-runtime";

export async function chartRuntime(app: App, response: unknown = null) {
  await stubBlockRuntime(async () => response);
  engine.provideDmsFrontendRuntime(
    app,
    engine.createDmsFrontendRuntime(undefined, {}, true),
  );
}
