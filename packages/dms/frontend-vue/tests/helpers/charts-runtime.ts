import type { App } from "vue";
import { engine, type ApiAnswer } from "./api-data-runtime";
import { stubBlockRuntime } from "./block-runtime";

export async function chartRuntime(app: App, response: ApiAnswer = null) {
  await stubBlockRuntime(async () => response);
  engine.provideDmsFrontendRuntime(
    app,
    engine.createDmsFrontendRuntime(undefined, {}, true),
  );
}
